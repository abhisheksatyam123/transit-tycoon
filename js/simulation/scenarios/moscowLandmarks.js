/**
 * Moscow scenario, landmarks: lays the contract's landmark buildings (w×h footprints, no road
 * bits, type 'landmark') and the Gorky Park forest strip. Pure and deterministic: candidate
 * anchors are tried by ring distance from the real position, shifting at most LANDMARK_SHIFT tiles
 * and never onto major roads or rail.
 */
import { tl, TS } from './moscowScale.js';
import { clearFootprint, clearable } from './moscowLand.js';
import { inBounds } from '../map.js';
import { project } from './moscowTiles.js';
import { LM3D } from '../../config/landmarks3d.js';

/** Maximum shift (tiles, Chebyshev) of a landmark footprint away from its real position. */
const LANDMARK_SHIFT = tl(2);

/** Landmark buildings: id (contract), map landmark id, footprint, and display title. */
export const LANDMARK_SPECS = [
  { id: 'kremlin', mapId: 'kremlin', w: 3, h: 3, ox: -1, oy: -1, title: 'Moscow Kremlin' },
  { id: 'red_square', mapId: 'red_square', w: 1, h: 2, ox: 1, oy: 0, title: "Red Square & St Basil's Cathedral" },
  { id: 'moscow_city', mapId: 'moscow_city', w: 3, h: 2, shift: tl(12), title: 'Moscow City business district' },
  { id: 'msu', mapId: 'msu', w: 2, h: 2, title: 'Lomonosov Moscow State University' },
  { id: 'ostankino', mapId: 'ostankino_tower', w: 1, h: 1, title: 'Ostankino TV Tower' },
  { id: 'luzhniki', mapId: 'luzhniki', w: 2, h: 2, title: 'Luzhniki Stadium' },
  { id: 'christ_saviour', mapId: 'christ_saviour', w: 1, h: 1, title: 'Cathedral of Christ the Saviour' },
  { id: 'bolshoi', mapId: 'bolshoi', w: 1, h: 1, title: 'Bolshoi Theatre' },
  { id: 'vdnkh', mapId: 'vdnkh', w: 2, h: 2, title: 'VDNKh exhibition centre' },
  { id: 'ukraina', mapId: 'ukraina', w: 2, h: 2, lat: 55.7516, lon: 37.5663, title: 'Hotel Ukraina (Stalinist skyscraper)' },
  { id: 'kotelnicheskaya', mapId: 'kotelnicheskaya', w: 2, h: 2, shift: tl(5), lat: 55.7472, lon: 37.6426, title: 'Kotelnicheskaya Embankment Building' },
  { id: 'kudrinskaya', mapId: 'kudrinskaya', w: 2, h: 2, lat: 55.7584, lon: 37.5812, title: 'Kudrinskaya Square Building' },
  { id: 'mid', mapId: 'mid', w: 2, h: 2, lat: 55.7462, lon: 37.5843, title: 'Ministry of Foreign Affairs' },
  { id: 'leningradskaya', mapId: 'leningradskaya', w: 2, h: 2, lat: 55.7739, lon: 37.6531, title: 'Leningradskaya Hotel' },
  { id: 'red_gates', mapId: 'red_gates', w: 2, h: 2, lat: 55.7685, lon: 37.6491, title: 'Red Gates Building' },
  { id: 'gum', mapId: 'gum', w: 2, h: 1, lat: 55.7547, lon: 37.6215, title: 'GUM department store' },
  { id: 'shukhov_tower', mapId: 'shukhov_tower', w: 1, h: 1, lat: 55.7172, lon: 37.6119, title: 'Shukhov Radio Tower' },
  { id: 'novodevichy', mapId: 'novodevichy', w: 2, h: 2, shift: tl(6), lat: 55.7262, lon: 37.5562, title: 'Novodevichy Convent' },
];

/** Gorky Park forest strip along the river (3 wide, 4 tall), not a landmark building. */
const PARK = { mapId: 'gorky_park', w: 3, h: 4, title: 'Gorky Park' };

/** Landmark titles by id (for the Query tool). */

/** Map landmark position by id; null when the baked map has none. */
function mapPos(map, mapId, lat, lon) {
  const l = (map.landmarks || []).find((q) => q.id === mapId);
  if (l) return { x: l.x, y: l.y };
  // baked map predates this landmark: project the real lat/lon directly
  return Number.isFinite(lat) ? project(lat, lon) : null;
}

/**
 * Anchor candidates around (ax,ay) within `maxR`, ordered by ring then distance to the anchor.
 * @returns {{x:number,y:number}[]}
 */
function anchorsByDistance(ax, ay, maxR) {
  const out = [];
  for (let dy = -maxR; dy <= maxR; dy++) for (let dx = -maxR; dx <= maxR; dx++) {
    out.push({ x: ax + dx, y: ay + dy, r: Math.max(Math.abs(dx), Math.abs(dy)), d: Math.hypot(dx, dy) });
  }
  out.sort((p, q) => p.r - q.r || p.d - q.d || p.y - q.y || p.x - q.x);
  return out;
}

/** True when every tile of the w×h footprint at (x,y) may be taken by a landmark or park. */
function footprintFree(state, x, y, w, h, major) {
  const { map } = state;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    if (!inBounds(map, xx, yy)) return false;
    const i = yy * map.width + xx;
    if (!clearable(map, i) || map.tiles[i].rail || (major && major[i])) return false;
  }
  return true;
}

/**
 * Nearest free anchor for a footprint, within LANDMARK_SHIFT of (ax,ay).
 * @returns {{x:number,y:number}|null}
 */
function fitFootprint(state, w, h, ax, ay, major, maxR = LANDMARK_SHIFT) {
  for (const a of anchorsByDistance(ax, ay, maxR)) {
    if (footprintFree(state, a.x, a.y, w, h, major)) return { x: a.x, y: a.y };
  }
  return null;
}

/**
 * Lay landmark buildings: clears the footprint (houses, links) and stamps
 * tile.building = {type:'landmark', id, dx, dy, w, h} on every footprint tile.
 * @returns {{id:string,x:number,y:number,w:number,h:number}[]} placed landmarks
 */
export function placeLandmarks(state, map, major, log) {
  const out = placeEnsembles(state, log);
  const covered = new Set(Object.values(LM3D).flatMap((e) => e.covers || [e.id]));
  for (const spec of LANDMARK_SPECS) {
    if (covered.has(spec.id)) continue;
    const p = mapPos(map, spec.mapId, spec.lat, spec.lon);
    if (!p) { log.push(`landmark ${spec.id}: not in baked map`); continue; }
    const ax = p.x + (spec.ox || 0) - Math.floor(spec.w / 2), ay = p.y + (spec.oy || 0) - Math.floor(spec.h / 2);
    const a = fitFootprint(state, spec.w, spec.h, ax, ay, major, spec.shift ?? LANDMARK_SHIFT);
    if (!a || !clearFootprint(state, a.x, a.y, spec.w, spec.h)) {
      log.push(`landmark ${spec.id}: no free ${spec.w}x${spec.h} site near ${p.x},${p.y}`);
      continue;
    }
    stampLandmark(state, spec, a.x, a.y);
    if (a.x !== ax || a.y !== ay) log.push(`landmark ${spec.id}: shifted to ${a.x},${a.y} (avenue or water nearby)`);
    out.push({ id: spec.id, x: a.x, y: a.y, w: spec.w, h: spec.h, title: spec.title });
  }
  const park = mapPos(map, PARK.mapId);
  if (park) {
    const ax = park.x - Math.floor(PARK.w / 2), ay = park.y - Math.floor(PARK.h / 2);
    const a = fitFootprint(state, PARK.w, PARK.h, ax, ay, major, tl(16));
    if (a && clearFootprint(state, a.x, a.y, PARK.w, PARK.h)) {
      for (let yy = a.y; yy < a.y + PARK.h; yy++) for (let xx = a.x; xx < a.x + PARK.w; xx++) {
        state.map.tiles[yy * state.map.width + xx].terrain = 'forest';
      }
      out.push({ id: 'gorky_park', x: a.x, y: a.y, w: PARK.w, h: PARK.h, park: true });
    } else log.push(`park ${PARK.title}: no free site near ${park.x},${park.y}`);
  }
  return out;
}

/** Stamp the landmark building on each footprint tile; the front tile is (w-1, h-1). */
function stampLandmark(state, spec, x0, y0) {
  const { map } = state;
  for (let dy = 0; dy < spec.h; dy++) for (let dx = 0; dx < spec.w; dx++) {
    const t = map.tiles[(y0 + dy) * map.width + x0 + dx];
    t.building = { type: 'landmark', id: spec.id, dx, dy, w: spec.w, h: spec.h };
  }
}

/**
 * Baked OSM 3D ensembles (js/config/landmarks3d.js): exact real footprint tiles (no shifting). Water, station,
 * depot and industry tiles are skipped; the front tile (max x+y) draws the sprite and is always kept.
 * tile.building = {type:'landmark', id, lm3d:1, front:0|1, dx:0, dy:0, w:1, h:1}.
 * @returns {{id:string,x:number,y:number,w:number,h:number,title:string,tiles:number}[]}
 */
function placeEnsembles(state, log) {
  const { map } = state; const out = []; const overlays = [];
  if (globalThis.process?.env?.NO_LM3D) return out; // tools/lm3d/bake.js reads the world without ensembles
  for (const e of Object.values(LM3D)) {
    const placed = [];
    for (const [x, y] of e.tiles) {
      if (!inBounds(map, x, y)) continue;
      const t = map.tiles[y * map.width + x];
      if (t.building && t.building.type === 'landmark') continue; // another ensemble got there first
      if (!clearFootprint(state, x, y, 1, 1)) continue;
      if (t.rail && !t.tunnel) t.rail = 0;
      delete t.avenue; // the road under the ensemble is gone
      t.building = { type: 'landmark', id: e.id, lm3d: 1, front: 0, dx: 0, dy: 0, w: 1, h: 1 };
      placed.push([x, y]);
    }
    if (!placed.length) {
      if (Array.isArray(e.front) && inBounds(map, e.front[0], e.front[1])) {
        overlays.push({ id: e.id, x: e.front[0], y: e.front[1] }); // draw it without demolishing anything
        log.push(`landmark ${e.id}: no footprint tiles (drawn as overlay at ${e.front[0]},${e.front[1]})`);
      } else log.push(`landmark ${e.id}: no footprint tiles`);
      continue;
    }
    // the front-most stamped tile (max x+y, then max x) draws the whole sprite after everything behind it
    const f = placed.reduce((m, q) => (q[0] + q[1] > m[0] + m[1] || (q[0] + q[1] === m[0] + m[1] && q[0] > m[0]) ? q : m));
    map.tiles[f[1] * map.width + f[0]].building.front = 1;
    const xs = placed.map((q) => q[0]), ys = placed.map((q) => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    log.push(`landmark ${e.id}: OSM 3D ensemble on ${placed.length}/${e.tiles.length} tiles, front ${f[0]},${f[1]}`);
    out.push({ id: e.id, x: x0, y: y0, w: Math.max(...xs) - x0 + 1, h: Math.max(...ys) - y0 + 1, title: e.title, tiles: placed.length });
  }
  map.lm3dOverlays = overlays; // drawn by the renderer on top of the map without taking tiles
  for (const t of map.tiles) if (t.avenue !== undefined && !t.road) delete t.avenue; // neighbours cut off by cleared links
  return out;
}
