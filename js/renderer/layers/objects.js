/**
 * Object layer: buildings, trees, station canopies, depots, vehicles.
 * Objects are depth-sorted by diagonal (x+y) in the renderer.
 */
import { houseSprite, STYLES, industrySprite, industryStyle, industryPiece, railStationCanopy, roadStopSprite, depotSprite } from '../sprites/buildings.js';
import { treeCluster } from '../sprites/terrain.js';
import { metroEntranceSprite } from '../sprites/metro.js';
import { drawLandmark } from '../sprites/landmarks.js';
import { drawLm3d } from '../sprites/lm3d.js';
import { airportObject } from '../sprites/airport.js';
import { hqSprite } from '../sprites/hq.js';
import { vehicleSprite } from '../sprites/vehicles.js';
import { drawPackSegment } from '../pack/vehicles.js';
import { getPoseMap, smoothPose, angleFromBit, poseCovered } from '../net/pose.js';
import { HALF_W, HALF_H } from '../iso.js';
import { blit, tileHash } from '../sprites/canvas.js';
import { packActive } from '../pack/state.js';
import { drawOgfxBuilding } from '../pack/objects.js';
import { drawOgfxTrees } from '../pack/trees.js';

/** Array memos for the hottest sprites (avoid string keys per tile per frame). */
const houses = new Array(5 * 16);
const trees = new Array(12);
/** @type {Map<number, any>} industry sprite memo keyed by numeric hash */
const industries = new Map();
const PIECE_IDS = new Map();

/**
 * @param {string} style
 * @param {string} piece
 * @param {number} variant
 */
function industryMemo(style, piece, variant) {
  const key = `${style}:${piece}`;
  let pid = PIECE_IDS.get(key);
  if (pid === undefined) { pid = PIECE_IDS.size; PIECE_IDS.set(key, pid); }
  const k = pid * 4 + (variant & 3);
  let spr = industries.get(k);
  if (!spr) { spr = industrySprite(style, piece, variant & 3); industries.set(k, spr); }
  return spr;
}

/**
 * Draw the static object (if any) standing on a tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} tile
 * @param {number} x
 * @param {number} y
 * @param {number} sx
 * @param {number} sy
 * @param {(id:number)=>any} industryById
 * @returns {string|null} industry piece name (for smoke emitters) or null
 */
export function drawObject(ctx, tile, x, y, sx, sy, industryById) {
  const b = tile.building;
  if (b && (b.type === 'house' || b.type === 'industry') && packActive()) {
    const r = drawOgfxBuilding(ctx, tile, x, y, sx, sy, industryById);
    if (r !== false) return r;
  }
  if (!b) {
    if (tile.terrain === 'forest' && !tile.rail && !tile.road) {
      if (packActive() && drawOgfxTrees(ctx, x, y, tileHash(x, y), sx, sy)) return null;
      const i = (tileHash(x, y) % 6) * 2 + (tile.height >= 6 ? 1 : 0);
      blit(ctx, trees[i] || (trees[i] = treeCluster(i >> 1, (i & 1) === 1)), sx, sy);
    }
    return null;
  }
  switch (b.type) {
    case 'house':
      const lv = Math.max(1, Math.min(4, b.level | 0));
      const v = Math.abs((b.variant ?? tileHash(x, y)) | 0) % 16;
      const si = b.style ? Math.max(0, STYLES.indexOf(b.style)) : 0;
      const i = si * 64 + lv * 16 + v;
      blit(ctx, houses[i] || (houses[i] = houseSprite(lv, v, b.style)), sx, sy);
      return null;
    case 'industry': {
      const ind = industryById(b.industryId);
      const style = industryStyle(ind ? ind.typeId : '');
      let dx = 0, dy = 0, w = 1;
      if (ind) { dx = x - ind.x; dy = y - ind.y; w = ind.w || 1; }
      else if (typeof b.part === 'number') dx = b.part;
      const piece = industryPiece(style, dx, dy, w);
      blit(ctx, industryMemo(style, piece, (b.industryId | 0) + dx + dy), sx, sy);
      return piece;
    }
    case 'station':
      if (b.kind === 'airport') {
        if (b.part === 'terminal' || b.part === 'tower' || b.part === 'hangar') blit(ctx, airportObject(b.part, (x + y) | 0), sx, sy);
        return null;
      }
      if (b.kind === 'rail' && b.metro && tile.tunnel) blit(ctx, metroEntranceSprite(b.axis === 'y' ? 'y' : 'x', b.color), sx, sy);
      else if (b.kind === 'rail') blit(ctx, railStationCanopy(b.axis === 'y' ? 'y' : 'x'), sx, sy);
      else blit(ctx, roadStopSprite(b.kind === 'truck' ? 'truck' : 'bus', b.axis === 'y' ? 'y' : 'x'), sx, sy);
      return null;
    case 'landmark':
      if (b.lm3d) { if (b.front) drawLm3d(ctx, b.id, x, y, sx, sy); }
      else if ((b.dx | 0) === (b.w | 0) - 1 && (b.dy | 0) === (b.h | 0) - 1) drawLandmark(ctx, b, sx, sy);
      return null;
    case 'hq': // T31: drawn once from the front tile (dx=dy=1); footprint centre sits half a tile up-screen
      if ((b.dx | 0) === 1 && (b.dy | 0) === 1) blit(ctx, hqSprite(b.level | 0), sx, sy - HALF_H);
      return null;
    case 'depot':
      if (b.kind === 'air') { blit(ctx, airportObject('hangar', (x + y) | 0), sx, sy); return null; }
      blit(ctx, depotSprite(b.kind === 'road' ? 'road' : 'rail', b.dir || 4), sx, sy);
      return null;
    default:
      return null;
  }
}

/**
 * Draw one vehicle segment.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{part:string,dir:number,cargoId:string,loaded:boolean,fill?:number}} seg
 * @param {number} sx
 * @param {number} sy
 * @param {boolean} [selected]
 */
export function drawSegment(ctx, seg, sx, sy, selected) {
  const fill = seg.fill !== undefined ? seg.fill : seg.loaded ? 1 : 0;
  const map = getPoseMap();
  const kind = seg.part === 'loco' || seg.part === 'wagon' ? 'rail' : 'road';
  if (map && seg.x !== undefined && poseCovered(map, kind, seg.x, seg.y)) {
    // smooth ribbon pose: shift the sprite onto the centreline and use its tangent heading
    const p = smoothPose(map, kind, seg.x, seg.y, angleFromBit(seg.dir));
    if (p) {
      const dx = p.x - seg.x, dy = p.y - seg.y;
      sx += (dx - dy) * HALF_W; sy += (dx + dy) * HALF_H;
      seg = { ...seg, ang: p.angle };
    }
  }
  const s = vehicleSprite(seg.part, seg.dir, seg.cargoId, fill, seg._info);
  if (selected) {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 14, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (!(packActive() && drawPackSegment(ctx, seg, sx, sy, fill))) blit(ctx, s, sx, sy);
}
