/**
 * Transport ground layer: rail, road, level crossings, grade separations, tunnels, rail station
 * platforms, and road under stops/depots. Drawn right after the terrain of each tile.
 * Diagonal staircases: a 2-bit corner that has a corner neighbour across a connected edge is drawn
 * as a 45° chamfer (see sprites/roadDiag.js); isolated turns stay arcs.
 */
import { railSprite, roadSprite, crossingSprite, V_CHAMFER, V_BRIDGE, V_SEP, V_RCHAMFER } from '../sprites/transport.js';
import { railStationGround } from '../sprites/buildings.js';
import { drawSloped } from '../slope.js';
import { drawPackTransport } from '../pack/transport.js';
import { landmarkGround, landmarkGroundKind } from '../sprites/landmarks.js';
import { airportGround } from '../sprites/airport.js';
import { CORNER, BITS, reflectMask } from '../sprites/roadDiag.js';
import { netDrawsSurface } from '../net/drawTile.js';
import { gradeSepSprite } from '../sprites/gradeSep.js';
import { metroPlazaGround } from '../sprites/metroPlaza.js';
import { metroEntranceSprite } from '../sprites/metro.js';
import { blit } from '../sprites/canvas.js';

/** Array memos indexed by mask/class/variant (no per-frame string keys). */
const rails = new Array(16 * 2);
const roads = new Array(16 * 64 * 4);
const crossings = new Array(16 * 256 * 4 * 16);
const stationGround = { x: null, y: null };

/** Direction offsets per bit: N, E, S, W. */
const DX = { 1: 0, 2: 1, 4: 0, 8: -1 };
const DY = { 1: -1, 2: 0, 4: 1, 8: 0 };

/**
 * Road class of a tile for drawing: 1 avenue (motorway), 2 primary, 3 secondary/standard,
 * 0 local street (no avenue field).
 * @param {any} tile
 * @returns {number}
 */
export function roadClassOf(tile) {
  const a = tile.avenue | 0;
  return a === 1 || a === 2 || a === 3 ? a : 0;
}

/**
 * Whether the road corner at (x,y) is a staircase step: a connected neighbour is its point reflection
 * (N+E pairs with S+W across the shared edge midpoint), so both chamfers form one straight line.
 * @param {any} map
 * @param {number} x
 * @param {number} y
 * @param {number} mask road mask of the tile (a 2-bit corner)
 * @returns {boolean}
 */
export function isStaircaseCorner(map, x, y, mask) {
  if (CORNER[mask] === undefined) return false;
  for (const b of BITS) {
    if (!(mask & b)) continue;
    const nx = x + DX[b], ny = y + DY[b];
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    if ((map.tiles[ny * map.width + nx].road | 0) === reflectMask(mask)) return true;
  }
  return false;
}

/**
 * Draw rail/road for a tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} tile
 * @param {number} sx
 * @param {number} sy
 * @param {number[]} c corner heights [hN,hE,hS,hW] (levels)
 * @param {any} [map] map (for neighbour-based corner smoothing and terrain)
 * @param {number} [x] tile x
 * @param {number} [y] tile y
 */
export function drawTransport(ctx, tile, sx, sy, c, map = null, x = 0, y = 0) {
  // smooth net ribbons draw this road/rail surface (drawNetTile); terrain already drew the ground
  if (map && netDrawsSurface(map, tile, x, y)) return;
  const b = tile.building;
  const r = tile.road | 0;
  const diag = !!map && !tile.rail && CORNER[r] !== undefined && isStaircaseCorner(map, x, y, r);
  if (b && b.type === 'station' && b.kind === 'rail' && b.metro && tile.tunnel) {
    // Moscow metro entrance: paved plaza, no rail; the pavilion is drawn by layers/objects.js
    drawSloped(ctx, metroPlazaGround(), sx, sy, c);
    if (tile.road | 0) drawTransportRoad(ctx, tile, sx, sy, c, map, x, y);
    return;
  }
  if (drawPackTransport(ctx, tile, sx, sy, c, diag)) return;
  drawTransportRoad(ctx, tile, sx, sy, c, map, x, y, diag);
}

/**
 * Procedural road/rail/station ground of a tile (after the OpenGFX attempt).
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} tile
 * @param {number} sx
 * @param {number} sy
 * @param {number[]} c
 * @param {any} map
 * @param {number} x
 * @param {number} y
 * @param {boolean} [diag]
 */
function drawTransportRoad(ctx, tile, sx, sy, c, map, x, y, diag = false) {
  const b = tile.building;
  if (b && b.type === 'station' && b.kind === 'rail') {
    const a = b.axis === 'y' ? 'y' : 'x';
    drawSloped(ctx, stationGround[a] || (stationGround[a] = railStationGround(a)), sx, sy, c);
    return;
  }
  if (b && b.type === 'landmark') {
    const k = landmarkGroundKind(b.id);
    drawSloped(ctx, landmarkGround(k), sx, sy, c);
    return;
  }
  if (b && b.type === 'station' && b.kind === 'airport') {
    drawSloped(ctx, airportGround(b.part === 'runway' ? 'runway' : 'apron', 'x'), sx, sy, c);
    return;
  }
  if (b && b.type === 'depot' && b.kind === 'air') {
    drawSloped(ctx, airportGround('apron', 'x'), sx, sy, c);
    return;
  }
  if (b && b.type === 'depot') return; // depot sprite includes its own apron
  const tunnel = tile.tunnel | 0;
  const sep = tile.gradeSep | 0;
  let rail = tile.rail | 0;
  const road = tile.road | 0;
  if (tunnel) rail = 0; // underground rail: no surface rails, ties or barriers
  const cls = roadClassOf(tile);
  let v = 0;
  if (road && map) {
    if (isStaircaseCorner(map, x, y, road)) v |= V_CHAMFER;
    if (tile.terrain === 'water') v |= V_BRIDGE;
  }
  if (rail && road && sep) {
    drawSloped(ctx, gradeSepSprite(road, rail, cls), sx, sy, c);
    return;
  }
  if (rail && road) {
    if (CORNER[rail] !== undefined && map && isRailStaircase(map, x, y, rail)) {
      v |= V_RCHAMFER;
    }
    const i = (((v * 256 + road) * 16 + rail) * 4) + cls;
    drawSloped(ctx, crossings[i] || (crossings[i] = crossingSprite(road, rail, cls, v)), sx, sy, c);
  } else if (road || (b && b.type === 'station')) {
    const m = road || (b.axis === 'y' ? 5 : 10);
    const i = ((v * 64 + m) * 4) + cls;
    drawSloped(ctx, roads[i] || (roads[i] = roadSprite(m, cls, v)), sx, sy, c);
  } else if (rail) {
    const rv = map && CORNER[rail] !== undefined && isRailStaircase(map, x, y, rail) ? 1 : 0;
    const i = rail * 2 + rv;
    drawSloped(ctx, rails[i] || (rails[i] = railSprite(rail, rv === 1)), sx, sy, c);
  }
}

/**
 * Rail staircase test: a rail corner with a rail corner neighbour across a connected edge.
 * @param {any} map
 * @param {number} x
 * @param {number} y
 * @param {number} mask
 */
function isRailStaircase(map, x, y, mask) {
  for (const b of BITS) {
    if (!(mask & b)) continue;
    const nx = x + DX[b], ny = y + DY[b];
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    if ((map.tiles[ny * map.width + nx].rail | 0) === reflectMask(mask)) return true;
  }
  return false;
}
