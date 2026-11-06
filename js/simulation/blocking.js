/**
 * Track and road occupancy for vehicle queueing (stage 1 of OpenTTD-style blocking; no signals).
 *
 * ctx.occupancy is a per-tick index: tile key (y * width + x) -> vehicles covering that tile.
 *  - VehicleManager.tick builds it once from state.vehicles (ascending id order) before any vehicle moves;
 *  - after each vehicle's own tick, syncOccupancy re-indexes just that vehicle, so a vehicle entering a
 *    tile is seen by the vehicles processed after it in the same tick (no two vehicles claim one tile);
 *  - the index is derived data: it is never serialized, and ctx.occupancy is cleared at tick end.
 * Body cells: a train covers its whole history (its trailing segments); a road vehicle covers its head
 * tile and the tile it just left (history[0..1]), so a queued truck stops one empty tile behind.
 *
 * Blocking rules (movement.js move):
 *  - trains: only a train moving the same way blocks (head-on trains pass: no signals / passing loops yet);
 *  - road vehicles: only a vehicle moving the same way blocks (oncoming traffic passes), except on a stop tile;
 *  - a vehicle loading at a stop tile blocks the vehicles behind it until it leaves;
 *  - aircraft and vehicles in a depot are not indexed.
 */
import { TICKS_PER_DAY, dirBetween } from './constants.js';

/** A vehicle blocked this long by a moving (not loading) vehicle turns around / re-plans (3 days). */
export const BLOCK_TIMEOUT_TICKS = 3 * TICKS_PER_DAY;

/** Occupancy layer of a vehicle ('rail' for trains, 'road' for road vehicles) or null. */
export function occupancyLayer(v) {
  if (v.kind === 'train') return 'rail';
  if (v.kind === 'road') return 'road';
  return null;
}

/**
 * Direction (dirBetween bit) a vehicle moves in: from its current path segment while running, else from
 * its last move (history[1] -> history[0]). 0 when unknown.
 */
export function vehicleDir(v) {
  const p = v.path;
  if (v.state === 'running' && p && v.pathIndex < p.length - 1) {
    const a = p[v.pathIndex], b = p[v.pathIndex + 1];
    return dirBetween(a.x, a.y, b.x, b.y);
  }
  const h = v.history;
  if (h && h.length > 1) return dirBetween(h[1].x, h[1].y, h[0].x, h[0].y);
  return 0;
}

/** Body cells of a vehicle as tile keys (see module comment). */
function bodyKeys(state, v) {
  const layer = occupancyLayer(v);
  if (!layer || v.state === 'depot') return null;
  const w = state.map.width;
  const h = v.history && v.history.length ? v.history : [{ x: v.tx, y: v.ty }];
  const n = layer === 'road' ? Math.min(2, h.length) : h.length;
  const keys = new Array(n);
  for (let i = 0; i < n; i++) keys[i] = h[i].y * w + h[i].x;
  return keys;
}

function addTo(map, k, v) {
  const list = map.get(k);
  if (list) list.push(v); else map.set(k, [v]);
}

function removeFrom(map, k, v) {
  const list = map.get(k);
  if (!list) return;
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1);
  if (!list.length) map.delete(k);
}

/**
 * Build the occupancy index for this tick. Called by VehicleManager.tick before vehicles move.
 * @returns {{rail:Map, road:Map, keys:Map}} keys: vehicle -> body keys it is indexed under
 */
export function beginOccupancy(state) {
  const occ = { rail: new Map(), road: new Map(), keys: new Map() };
  for (const v of state.vehicles) {
    const layer = occupancyLayer(v);
    const keys = bodyKeys(state, v);
    if (!keys) continue;
    occ.keys.set(v, keys);
    for (const k of keys) addTo(occ[layer], k, v);
  }
  return occ;
}

/** Re-index one vehicle after its body changed (no-op outside a tick). */
export function syncOccupancy(ctx, v) {
  const occ = ctx.occupancy;
  if (!occ) return;
  const layer = occupancyLayer(v);
  const old = occ.keys.get(v);
  if (old) {
    for (const k of old) removeFrom(occ[layer], k, v);
    occ.keys.delete(v);
  }
  const keys = bodyKeys(ctx.state, v);
  if (!keys) return;
  occ.keys.set(v, keys);
  for (const k of keys) addTo(occ[layer], k, v);
}

/** Index for the current call: the tick index, or a fresh build when called outside a tick. */
function indexOf(ctx) {
  return ctx.occupancy || beginOccupancy(ctx.state);
}

/** Vehicles indexed on tile (x,y) of a layer. */
export function vehiclesOn(ctx, layer, x, y) {
  return indexOf(ctx)[layer].get(y * ctx.state.map.width + x) || null;
}

/**
 * First vehicle that blocks `v` from entering tile (x,y) moving in direction `dir`, or null.
 */
export function blockerOn(ctx, v, layer, x, y, dir) {
  const list = vehiclesOn(ctx, layer, x, y);
  if (!list) return null;
  for (const o of list) {
    if (o === v) continue;
    // only same-way traffic blocks: trains are single track with no signals yet, so head-on trains pass;
    // a road stop tile is one bay, not two lanes: any road vehicle on it blocks
    if (dir && (layer === 'rail' || !isStopTile(ctx.state, x, y))) {
      const od = vehicleDir(o);
      if (od && od !== dir) continue; // oncoming / crossing road traffic does not block
    }
    return o;
  }
  return null;
}

/** True when tile (x,y) belongs to a station (a road stop bay or a rail platform). */
function isStopTile(state, x, y) {
  const b = state.map.tiles[y * state.map.width + x].building;
  return !!b && b.type === 'station';
}

/** True when another road vehicle (not v) is loading on tile (x,y): a stop bay in use. */
export function bayInUse(ctx, v, x, y) {
  const list = vehiclesOn(ctx, 'road', x, y);
  return !!list && list.some((o) => o !== v && o.state === 'loading');
}
