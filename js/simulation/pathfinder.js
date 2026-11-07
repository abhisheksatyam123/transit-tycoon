/**
 * A* pathfinder over the rail or road graph using a binary heap.
 * Depot tiles are endpoints only: they may be the start or a goal but are never passed through.
 */
import { DIRS, OPPOSITE, dirBetween } from './constants.js';
import { oneWayAllows } from './network.js';
import { vehiclesOn, trainInBlock, beginOccupancy } from './blocking.js';
import { guardedBlock, isBlockWall } from './signals.js';
import { isTypedSignal } from './pathSignals.js';

/**
 * OpenTTD YAPF-like rail cost constants.
 * In OpenTTD, YAPF_TILE_LENGTH = 100:
 *   rail_slope_penalty: 2 * YAPF_TILE_LENGTH (2 tiles)
 *   rail_curve45_penalty: 1 * YAPF_TILE_LENGTH (1 tile)
 *   rail_curve90_penalty: 6 * YAPF_TILE_LENGTH (6 tiles)
 *   rail_station_penalty: 10 * YAPF_TILE_LENGTH (10 tiles)
 *   rail_firstred_penalty: 10 * YAPF_TILE_LENGTH (10 tiles)
 *   rail_firstred_exit_penalty: 100 * YAPF_TILE_LENGTH (100 tiles)
 *   rail_pbs_cross_penalty: 3 * YAPF_TILE_LENGTH (3 tiles)
 * In our grid, turns are 90-degree. With base straight cost = 1.0:
 */
export const RAIL_COSTS = {
  STRAIGHT: 1.0,
  CURVE: 1.0,            // OpenTTD rail_curve90_penalty = 6 * YAPF_TILE_LENGTH
  SLOPE_UP: 2.0,         // OpenTTD rail_slope_penalty = 2 * YAPF_TILE_LENGTH
  STATION_PASS: 10.0,    // OpenTTD rail_station_penalty = 10 * YAPF_TILE_LENGTH
  OCCUPIED_BLOCK: 10.0,  // OpenTTD rail_firstred_penalty = 10 * YAPF_TILE_LENGTH
  RESERVED_TILE: 3.0,    // OpenTTD rail_pbs_cross_penalty = 3 * YAPF_TILE_LENGTH
};


/** Minimal binary min-heap of node indices keyed by an external score array. */
class MinHeap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const a = this.items, k = this.keys;
    let i = a.length;
    a.push(item); k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      a[i] = a[p]; k[i] = k[p];
      i = p;
    }
    a[i] = item; k[i] = key;
  }
  pop() {
    const a = this.items, k = this.keys;
    const top = a[0];
    const lastItem = a.pop(), lastKey = k.pop();
    const n = a.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lastKey;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (r < n && k[r] < mk) { m = r; mk = k[r]; }
        if (m === i) break;
        a[i] = a[m]; k[i] = k[m];
        i = m;
      }
      a[i] = lastItem; k[i] = lastKey;
    }
    return top;
  }
}

/**
 * Find a path on a layer from start to any goal tile.
 * @param {{width:number,height:number,tiles:object[]}} map
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}[]} goals
 * @param {'rail'|'road'|'tram'} layer
 * @param {{maxNodes?:number, avoidFirst?:{x:number,y:number}, electric?:boolean}} [opts] electric: rail only over electrified tiles (elec)
 * @returns {{x:number,y:number}[]|null} tiles from start to goal inclusive
 */
export function findPath(map, start, goals, layer, opts = {}) {
  if (!goals || goals.length === 0) return null;
  const { width, height, tiles } = map;
  const n = width * height;
  const startIdx = start.y * width + start.x;
  const goalSet = new Set();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of goals) {
    goalSet.add(g.y * width + g.x);
    if (g.x < minX) minX = g.x;
    if (g.x > maxX) maxX = g.x;
    if (g.y < minY) minY = g.y;
    if (g.y > maxY) maxY = g.y;
  }
  if (goalSet.has(startIdx)) return [{ x: start.x, y: start.y }];
  const h = (x, y) => (x < minX ? minX - x : x > maxX ? x - maxX : 0) + (y < minY ? minY - y : y > maxY ? y - maxY : 0);
  const sc = scratchFor(n);
  const gen = ++sc.gen;
  const { g, came, closed, seen } = sc;
  const heap = new MinHeap();
  seen[startIdx] = gen;
  g[startIdx] = 0;
  came[startIdx] = -1;
  heap.push(startIdx, h(start.x, start.y));
  const maxNodes = opts.maxNodes ?? n;
  const avoid = opts.avoidFirst ? opts.avoidFirst.y * width + opts.avoidFirst.x : -1;
  const electric = !!opts.electric && layer === 'rail';
  // monorail / maglev trains (config/railTypes.js): only track of their own type (tile.trk, absent = 0)
  const trkReq = layer === 'rail' && opts.trk !== undefined ? opts.trk : -1;
  const pathCostsActive = !!opts.pathCosts && layer === 'rail';
  const simState = opts.state || null;
  // occupancy index: the tick index when called from the vehicle tick, else built once for this search
  const simCtx = pathCostsActive && simState ? (opts.ctx || { state: simState, occupancy: beginOccupancy(simState) }) : null;
  const currentVeh = opts.vehicle || null;
  const currentVehId = currentVeh ? currentVeh.id : -1;
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur] === gen) continue;
    if (goalSet.has(cur)) return reconstruct(came, cur, width);
    closed[cur] = gen;
    if (++expanded > maxNodes) break;
    const cx = cur % width, cy = (cur - cx) / width;
    const tile = tiles[cur];
    if (cur !== startIdx && isDepot(tile)) continue; // depots are endpoints only
    const bits = tile[layer];
    if (!bits) continue;
    for (let i = 0; i < 4; i++) {
      const d = DIRS[i];
      if (!(bits & d.bit)) continue;
      const nx = cx + d.dx, ny = cy + d.dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (closed[ni] === gen) continue;
      if (cur === startIdx && ni === avoid) continue;
      const nt = tiles[ni];
      if (!(nt[layer] & OPPOSITE[d.bit])) continue;
      if (electric && !nt.elec) continue; // electric locomotives: non-electrified track is impassable
      if (trkReq >= 0 && (nt.trk | 0) !== trkReq) continue; // wrong track type for this train
      // one-way roads (T42): both the tile left and the tile entered must allow this travel direction
      if (layer === 'road' && (tile.oneWay || nt.oneWay) && !(oneWayAllows(tile, d.dx, d.dy) && oneWayAllows(nt, d.dx, d.dy))) continue;
      const prev = came[cur];
      let step = 1;
      if (!pathCostsActive) {
        if (prev >= 0 && prev !== cur - (ni - cur)) step = 1.2;
      } else {
        // YAPF-like cost model for rail
        if (prev >= 0 && prev !== cur - (ni - cur)) {
          step += RAIL_COSTS.CURVE;
        }
        // Uphill slope penalty
        const curH = tile.height || 0;
        const nxtH = nt.height || 0;
        if (nxtH > curH) {
          step += (nxtH - curH) * RAIL_COSTS.SLOPE_UP;
        }
        // Station penalty for passing THROUGH a station that is not the goal
        if (nt.building && nt.building.type === 'station' && nt.building.kind !== 'waypoint' && !goalSet.has(ni)) {
          step += RAIL_COSTS.STATION_PASS;
        }
        // Occupied-block and red signal penalties
        if (simCtx) {
          let tileOccupied = false;
          // Path-signal reservations
          if (simState && simState.resv) {
            const owner = simState.resv[ni];
            if (owner !== undefined && owner !== currentVehId) {
              tileOccupied = true;
              step += RAIL_COSTS.RESERVED_TILE;
            }
          }
          // Direct vehicle occupancy on tile
          const vList = vehiclesOn(simCtx, 'rail', nx, ny);
          if (vList) {
            for (const o of vList) {
              if (o.id !== currentVehId) {
                tileOccupied = true;
                break;
              }
            }
          }
          // Signal block occupancy / red signal ahead
          const toB = simState ? guardedBlock(simState, ni) : -1;
          const fromB = simState ? guardedBlock(simState, cur) : -1;
          let blockOccupied = false;
          if (toB >= 0 && toB !== fromB) {
            // Train entering a guarded signal block from outside or another block
            const blocker = trainInBlock(simCtx, currentVeh, toB);
            if (blocker) {
              blockOccupied = true;
            }
          }
          if (blockOccupied || tileOccupied) {
            step += RAIL_COSTS.OCCUPIED_BLOCK;
          }
        }
      }
      const ng = g[cur] + step;
      if (seen[ni] !== gen || ng < g[ni]) {
        seen[ni] = gen;
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + h(nx, ny));
      }
    }
  }
  return null;
}

/** Reusable per-map search buffers; `gen` stamps avoid clearing 76k entries per call. */
let scratch = null;
function scratchFor(n) {
  if (!scratch || scratch.g.length !== n) {
    scratch = { gen: 0, g: new Float64Array(n), came: new Int32Array(n), closed: new Uint32Array(n), seen: new Uint32Array(n) };
  }
  return scratch;
}

function isDepot(tile) {
  return tile.building !== null && tile.building !== undefined && tile.building.type === 'depot';
}

function reconstruct(came, end, width) {
  const out = [];
  let c = end;
  while (c >= 0) {
    const x = c % width;
    out.push({ x, y: (c - x) / width });
    c = came[c];
  }
  return out.reverse();
}
