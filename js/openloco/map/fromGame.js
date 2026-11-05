/**
 * Adapter: transit-tycoon map -> OpenLoco TileManager (this file is original to transit-tycoon; it uses the
 * MIT-licensed OpenLoco port in ./ and ../trackData.js).
 *
 * Game tile model: `rail` / `road` bit masks (1=N 2=E 4=S 8=W), `height` 0..7, `terrain`, `tunnel`, `bridge`,
 * `building` ({type:'house'|'industry'|'station'|'depot', ...}).
 *
 * Mapping (identical for rail -> TrackId and road -> RoadId):
 *   every PAIR of set edge bits becomes one single-tile piece at the tile origin:
 *     opposite edges (N-S, E-W)  -> straight        (rotation 1 = N-S, rotation 0 = E-W)
 *     adjacent edges (e.g. N-E)  -> leftCurveVerySmall / rightCurveVerySmall (whichever has the matching
 *                                   begin/end rotation, rotation 0..3 searched from ROTATION tables)
 *   so: 2 bits -> 1 piece, 3 bits (T) -> 3 pieces (1 straight + 2 curves), 4 bits -> 6 pieces (2 straight + 4 curves),
 *   1 bit (dead end, depot, tunnel mouth) -> a straight on that axis. Pieces are flat unless a straight
 *   tile spans a height step of one level: then it becomes a straightSteepSlopeUp (rise 16 per tile, rotation =
 *   direction of the rise). Edge heights: z(edge between P,Q) = 16*(max(hP,hQ)+1); a curve/junction tile is flat at
 *   16*(h+1), and straights next to such a tile adopt that tile's z for the shared edge. Mismatches between two
 *   adjacent non-straight tiles of different height cannot connect (counted in stats.heightBreaks).
 *   Surface baseZ (smallZ) = 4*(h+1), water tiles get water level h+2 (microZ). Terrain codes: see TERRAIN_CODE.
 *   Tunnels / bridges keep surface z (no real tunnel geometry); tile.bridge sets hasBridge (bridge object 0).
 *   Rail owner 0, road owner 15 (neutral) and object id 0.
 *   houses/industries -> BuildingElement/IndustryElement on the surface (occupied 0xF, 32 units tall);
 *   forest -> TreeElement; rail 'station' tiles -> track straight + trainStation StationElement; road 'bus'/'truck'
 *   stops -> road straight + roadStation StationElement; depots -> dead-end piece, no building element.
 */
import { ROAD_COORDINATES, TRACK_COORDINATES } from '../trackData.js';
import { TrackId, RoadId } from '../trackEnum.js';
import { TileManager } from './tileManager.js';
import { ElementType } from './elements.js';
import { placeTrack, placeRoad, attachTrainStation, attachRoadStation } from './place.js';

/** terrain string -> SurfaceElement.terrain() code. */
export const TERRAIN_CODE = Object.freeze({ grass: 0, desert: 1, forest: 2, rock: 3, snow: 4, water: 5 });

const BIT = { N: 1, E: 2, S: 4, W: 8 };
const BIT_LIST = [1, 2, 4, 8];
const D = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };
const OPP = { 1: 4, 2: 8, 4: 1, 8: 2 };
// OpenLoco travel direction (rotation index) when LEAVING a tile through a game edge: 0=-x(W) 1=+y(S) 2=+x(E) 3=-y(N)
const OUT_DIR = { 8: 0, 4: 1, 2: 2, 1: 3 };
const IN_DIR = (edge) => OUT_DIR[OPP[edge]]; // entering through `edge` means moving away from it

/** Search the very-small-curve tads for the (rotation, trackId) joining two adjacent edges. */
function buildCurveTable(coords, ids) {
  const table = {};
  for (const id of ids) {
    for (let rot = 0; rot < 4; rot++) {
      const c = coords[id * 8 + rot];
      for (const e1 of BIT_LIST) for (const e2 of BIT_LIST) {
        if (e1 >= e2 || OPP[e1] === e2) continue;
        if (c.rotationBegin === IN_DIR(e1) && c.rotationEnd === OUT_DIR[e2]) table[e1 | e2] = { id, rot };
        if (c.rotationBegin === IN_DIR(e2) && c.rotationEnd === OUT_DIR[e1]) table[e1 | e2] = { id, rot };
      }
    }
  }
  return table;
}
const TRACK_CURVES = buildCurveTable(TRACK_COORDINATES, [TrackId.leftCurveVerySmall, TrackId.rightCurveVerySmall]);
const ROAD_CURVES = buildCurveTable(ROAD_COORDINATES, [RoadId.leftCurveVerySmall, RoadId.rightCurveVerySmall]);

/** @returns {Array<{kind:'straight'|'curve', mask:number, axis?:'x'|'y'}>} edge-pair pieces for a bit mask */
export function piecesForMask(bits) {
  const edges = BIT_LIST.filter((b) => bits & b);
  if (edges.length === 1) return [{ kind: 'straight', mask: edges[0] | OPP[edges[0]], axis: edges[0] & 5 ? 'y' : 'x' }];
  const out = [];
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const mask = edges[i] | edges[j];
    out.push(OPP[edges[i]] === edges[j] ? { kind: 'straight', mask, axis: edges[i] & 5 ? 'y' : 'x' } : { kind: 'curve', mask });
  }
  return out;
}

const isStraightMask = (bits) => bits === 5 || bits === 10 || bits === 1 || bits === 4 || bits === 2 || bits === 8;

/**
 * Build a TileManager from a transit-tycoon state.
 * @param {{map:{width:number,height:number,tiles:object[]}}} state
 * @param {{railOwner?:number, roadOwner?:number, buildings?:boolean}} [opts]
 * @returns {{tm:TileManager, starts:Array<{kind:'rail'|'road', tx:number, ty:number, trackId:number, rotation:number,
 *   pos:{x:number,y:number,z:number}, tad:number, tadReverse:number, element:object}>, stats:object}}
 *   `starts` lists every sequence-0 piece with its forward trackAndDirection (trackId<<3 | rotation), the reverse one (| 4, same `pos`) and world pos.
 */
export function tileManagerFromGame(state, opts = {}) {
  const { width, height, tiles } = state.map;
  const railOwner = opts.railOwner ?? 0, roadOwner = opts.roadOwner ?? 15;
  const tm = new TileManager(width, height);
  const starts = [];
  const stats = { surfaces: width * height, railPieces: 0, roadPieces: 0, ramps: 0, buildings: 0, trees: 0, stations: 0, tunnels: 0, bridges: 0, heightBreaks: 0 };
  const T = (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? tiles[y * width + x] : null);
  const surfBase = (t) => 4 * ((t.height || 0) + 1);

  for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) {
    const t = tiles[ty * width + tx];
    const s = tm.insertElementAtTile(ElementType.surface, tx, ty, surfBase(t), 0xf);
    s.setTerrain(TERRAIN_CODE[t.terrain] ?? 0);
    if (t.terrain === 'water') s.setWater((t.height || 0) + 2);
  }

  // flat z (world units) of a tile that is not a plain straight
  const flatZ = (t) => 16 * ((t.height || 0) + 1);
  // z of the shared edge between tile (x,y) and its neighbour across game edge `bit`, as seen from the straight at (x,y)
  const edgeZ = (x, y, t, bit, key) => {
    const [dx, dy] = D[bit];
    const n = T(x + dx, y + dy);
    if (!n) return flatZ(t);
    if (n[key] && !isStraightMask(n[key] & 0xf)) return flatZ(n);
    return 16 * (Math.max(t.height || 0, n.height || 0) + 1);
  };

  for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) {
    const t = tiles[ty * width + tx];
    const origin = { x: tx * 32, y: ty * 32 };
    if (t.tunnel) stats.tunnels++;
    if (t.bridge) stats.bridges++;
    for (const kind of ['rail', 'road']) {
      const bits = (t[kind] || 0) & 0xf;
      if (!bits) continue;
      const curves = kind === 'rail' ? TRACK_CURVES : ROAD_CURVES;
      const straightId = kind === 'rail' ? TrackId.straight : RoadId.straight;
      const steepId = kind === 'rail' ? TrackId.straightSteepSlopeUp : RoadId.straightSteepSlopeUp;
      for (const p of piecesForMask(bits)) {
        let trackId, rotation, z = flatZ(t);
        if (p.kind === 'curve') ({ id: trackId, rot: rotation } = curves[p.mask]);
        else if (!isStraightMask(bits)) { trackId = straightId; rotation = p.axis === 'y' ? 1 : 0; } // junction straights stay flat
        else {
          trackId = straightId; rotation = p.axis === 'y' ? 1 : 0;
          const [lo, hi] = p.axis === 'y' ? [1, 4] : [8, 2]; // lo = N/W edge, hi = S/E edge
          const zl = edgeZ(tx, ty, t, lo, kind), zh = edgeZ(tx, ty, t, hi, kind);
          if (zl === zh) z = zl;
          else if (Math.abs(zl - zh) === 16) {
            trackId = steepId; stats.ramps++;
            // piece rotation d rises while moving in OpenLoco direction d: 0=-x 1=+y 2=+x 3=-y
            if (zh > zl) { z = zl; rotation = p.axis === 'y' ? 1 : 2; } else { z = zh; rotation = p.axis === 'y' ? 3 : 0; }
          } else { z = zl; stats.heightBreaks++; }
        }
        const pos = { x: origin.x, y: origin.y, z };
        const els = kind === 'rail'
          ? placeTrack(tm, pos, { trackId, rotation, owner: railOwner, bridge: t.bridge ? 0 : null })
          : placeRoad(tm, pos, { roadId: trackId, rotation, owner: roadOwner, bridge: t.bridge ? 0 : null });
        if (kind === 'rail') stats.railPieces++; else stats.roadPieces++;
        starts.push({ kind, tx, ty, trackId, rotation, pos, tad: (trackId << 3) | rotation, tadReverse: (trackId << 3) | 4 | rotation, element: els[0] });
        const b = t.building;
        if (b && b.type === 'station' && p.kind === 'straight' && (kind === 'rail' ? b.kind === 'rail' : b.kind !== 'rail')) {
          const ctx = { stationId: b.stationId & 0x3ff };
          if (kind === 'rail') attachTrainStation(tm, els[0], ctx); else attachRoadStation(tm, els[0], { ...ctx, owner: roadOwner });
          stats.stations++;
        }
      }
    }
    if (opts.buildings !== false) {
      const b = t.building;
      const base = surfBase(t);
      if (b && (b.type === 'house' || b.type === 'industry')) {
        const el = tm.insertElementAtTile(b.type === 'house' ? ElementType.building : ElementType.industry, tx, ty, base, 0xf);
        el.setClearZ(base + 8); if (b.type === 'house') el.setConstructed(true); else el.setIsConstructed(true);
        if (b.type === 'industry') el.setIndustryId((b.industryId ?? 0) & 0xff);
        stats.buildings++;
      } else if (!b && t.terrain === 'forest' && !t.rail && !t.road) {
        const el = tm.insertElementAtTile(ElementType.tree, tx, ty, base, 0xf);
        el.setClearZ(base + 8); stats.trees++;
      }
    }
  }
  return { tm, starts, stats };
}

