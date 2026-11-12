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
 *  - aircraft and vehicles in a depot are not indexed;
 *  - trams are unindexed on their own tram layer, unless the opt-in `tramQueue` setting puts them on the road layer.
 */
import { TICKS_PER_DAY, dirBetween } from './constants.js';
import { blockIndex, guardedBlock } from './signals.js';
import { articSpan } from './articulated.js';
import { getSetting } from './settings.js';

/** A vehicle blocked this long by a moving (not loading) vehicle turns around / re-plans (3 days). */
export const BLOCK_TIMEOUT_TICKS = 3 * TICKS_PER_DAY;

/**
 * OpenTTD anti-deadlock backup: a road vehicle blocked by a moving vehicle for 1480 OpenTTD ticks drives
 * through it instead of turning around (roadveh_cmd.cpp:698). 1480 ticks / 74 ticks-per-day = 20 OpenTTD
 * days, so in TT ticks (96/day) the equivalent is 20 * TICKS_PER_DAY = 1920 (see the `roadvehDriveThrough`
 * setting; off by default keeps the 3-day turn-around above).
 */
export const DRIVE_THROUGH_TICKS = 20 * TICKS_PER_DAY;

/**
 * Occupancy layer of a vehicle ('rail' for trains, 'road' for road vehicles) or null.
 * Trams are normally unindexed (own tram layer); with `tramQueue` on they join the road layer, so they queue
 * behind buses/trams in the same lane and use the bay logic like any road vehicle (roadveh_cmd.cpp:634-701).
 * Default off = no extra map work for trams (today's behaviour).
 */
export function occupancyLayer(v, state) {
  if (v.kind === 'train') return 'rail';
  if (v.kind !== 'road') return null;
  if (v.roadType !== 'tram') return 'road';
  return getSetting(state, 'tramQueue') === true ? 'road' : null; // trams: own unindexed layer unless opted in
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

/**
 * Body-key array of exactly `n` slots from the index's scratch pool, or null. Only same-length arrays are
 * taken back: a key array's length is fixed once allocated, so reusing it keeps allocation/order unchanged.
 */
function takeKeyArray(pool, n) {
  for (let i = pool.length - 1; i >= 0; i--) {
    if (pool[i].length !== n) continue;
    const arr = pool[i];
    pool[i] = pool[pool.length - 1]; // swap-pop: no splice result array allocated
    pool.pop();
    return arr;
  }
  return null;
}

/** Empty scratch array for a tile's vehicle list (lists are cleared on release, never shared while live). */
function takeList(pool) {
  const a = pool.length ? pool.pop() : [];
  a.length = 0;
  return a;
}

/**
 * Body cells of a vehicle as tile keys (see module comment). `pool` (the occupancy index's scratch pool)
 * supplies a same-length array no longer indexed, so re-indexing a moving vehicle does not allocate; `layer`
 * is the caller's occupancyLayer result (one settings read per vehicle per tick).
 */
function bodyKeys(state, v, pool, layer) {
  if (!layer || v.state === 'depot') return null;
  const w = state.map.width;
  const h = v.history && v.history.length ? v.history : null;
  // no history yet (e.g. just built): a single head cell; both cases below give n = 1 when h.length is 1
  if (!h) {
    const keys = takeKeyArray(pool, 1) || new Array(1);
    keys[0] = v.ty * w + v.tx;
    return keys;
  }
  // articulated road vehicles cover every tile their parts span (articulated.js); plain ones the head and the tile behind
  const n = layer === 'road' ? Math.min(articSpan(v) ? Math.ceil(articSpan(v)) + 2 : 2, h.length) : h.length;
  const keys = takeKeyArray(pool, n) || new Array(n);
  for (let i = 0; i < n; i++) keys[i] = h[i].y * w + h[i].x;
  return keys;
}

function addTo(map, k, v, pool) {
  const list = map.get(k);
  if (list) { list.push(v); return; }
  const fresh = takeList(pool);
  fresh.push(v);
  map.set(k, fresh);
}

function removeFrom(map, k, v, pool) {
  const list = map.get(k);
  if (!list) return;
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1);
  // the list is empty and no longer reachable from the map: recycle it for a tile added later this tick
  if (!list.length) { map.delete(k); pool.push(list); }
}

/**
 * Pool of occupancy index objects reused across ticks and path searches (this module's only per-tick
 * structure that would otherwise allocate fresh Maps/arrays every time). An index is derived, single-owner
 * scratch data: the tick owns it from beginOccupancy until VehicleManager.tick ends, and a path search owns
 * the search-local index until findPath returns. releaseOccupancy is called at those two points only, so a
 * live index is never handed to anyone else. On release the scratch arrays are harvested and the Maps are
 * cleared in place; the next build re-inserts the same keys in the same order, so reuse cannot change the
 * index (iteration order included) and nothing can leak between ticks or games.
 */
const occPool = [];

/** Empty index with its scratch pools: freed body-key arrays and freed tile vehicle lists. */
function createOcc() {
  return {
    rail: new Map(), road: new Map(), keys: new Map(), blocks: new Map(), blockIds: new Map(),
    keyPool: [], listPool: [],
  };
}

/** Take a pooled (already cleared) index, or a fresh one when no index has been released yet. */
function acquireOccupancy() {
  const occ = occPool.pop();
  if (!occ) return createOcc();
  occ.released = false;
  return occ;
}

/**
 * Return an index once nothing references it any more: harvest its scratch arrays for the next acquire and
 * clear the Maps in place (keeping their capacity). Idempotent; safe to call on a null index.
 */
export function releaseOccupancy(occ) {
  if (!occ || occ.released) return;
  occ.released = true;
  // movement.breaksCycle lazily caches vehicle-id -> vehicle on the index (movement.js blockTS); that cache is
  // only valid for the state snapshot it was built from, so drop it with the rest of the scratch data.
  occ.byId = null;
  for (const keys of occ.keys.values()) occ.keyPool.push(keys);
  for (const ids of occ.blockIds.values()) occ.listPool.push(ids);
  for (const map of [occ.rail, occ.road, occ.blocks]) {
    for (const list of map.values()) { list.length = 0; occ.listPool.push(list); }
    map.clear();
  }
  occ.keys.clear();
  occ.blockIds.clear();
  occPool.push(occ);
}

/**
 * Build the occupancy index for this tick. Called by VehicleManager.tick before vehicles move.
 * @returns {{rail:Map, road:Map, keys:Map}} keys: vehicle -> body keys it is indexed under
 */
export function beginOccupancy(state) {
  const occ = acquireOccupancy();
  for (const v of state.vehicles) {
    const layer = occupancyLayer(v, state);
    const keys = bodyKeys(state, v, occ.keyPool, layer);
    if (!keys) continue;
    occ.keys.set(v, keys);
    for (const k of keys) addTo(occ[layer], k, v, occ.listPool);
    indexBlocks(state, occ, v, keys);
  }
  return occ;
}

/**
 * Signal blocks (signals.js) occupied by a train: occ.blocks maps block id -> trains with a body cell in it,
 * occ.blockIds maps train -> its block ids. Only blocks bounded by a signal are indexed (others: no rule).
 */
function indexBlocks(state, occ, v, keys) {
  if (v.kind !== 'train' || !blockIndex(state)) return;
  const ids = takeList(occ.listPool);
  for (const k of keys) {
    const b = guardedBlock(state, k);
    if (b >= 0 && !ids.includes(b)) ids.push(b);
  }
  if (!ids.length) { occ.listPool.push(ids); return; }
  occ.blockIds.set(v, ids);
  for (const b of ids) addTo(occ.blocks, b, v, occ.listPool);
}

/** Train (not v) with a body cell in signal block `b`, or null. */
export function trainInBlock(ctx, v, b) {
  const occ = indexOf(ctx);
  const list = occ.blocks.get(b);
  if (!list) return null;
  for (const o of list) if (o !== v) return o;
  return null;
}

/** Re-index one vehicle after its body changed (no-op outside a tick). */
export function syncOccupancy(ctx, v) {
  const occ = ctx.occupancy;
  if (!occ) return;
  const layer = occupancyLayer(v, ctx.state);
  const old = occ.keys.get(v);
  if (old) {
    for (const k of old) removeFrom(occ[layer], k, v, occ.listPool);
    occ.keys.delete(v);
    occ.keyPool.push(old); // no longer indexed: its array can hold the new body cells
  }
  const keys = bodyKeys(ctx.state, v, occ.keyPool, layer);
  const oldBlocks = occ.blockIds.get(v);
  if (oldBlocks) {
    for (const b of oldBlocks) removeFrom(occ.blocks, b, v, occ.listPool);
    occ.blockIds.delete(v);
    occ.listPool.push(oldBlocks);
  }
  if (!keys) return;
  occ.keys.set(v, keys);
  for (const k of keys) addTo(occ[layer], k, v, occ.listPool);
  indexBlocks(ctx.state, occ, v, keys);
}

/**
 * Index for the current call: the tick index, or one built on demand when called outside a tick. The
 * on-demand build is not released (the caller keeps the returned list); it is a one-off derived index, the
 * same as before pooling, and never enters the pool so it cannot be mistaken for a free index.
 */
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
  return !!b && b.type === 'station' && b.kind !== 'waypoint'; // a waypoint is passed through, not a bay
}

/** True when another road vehicle (not v) is loading on tile (x,y): a stop bay in use. */
export function bayInUse(ctx, v, x, y) {
  const list = vehiclesOn(ctx, 'road', x, y);
  return !!list && list.some((o) => o !== v && o.state === 'loading');
}
