/**
 * One-way block signals and path signals with track reservation (T3c; OpenTTD pbs.cpp / signal_type.h).
 *
 * A signal tile carries `tile.signal` (see signals.js): absent = none, `1` = two-way block (the default,
 * unchanged), or the object `{ type: 'oneway' | 'path', dir: <dirBetween bit> }` for the new kinds.
 * `dir` is the one direction a train may pass the signal in (bit 1 N, 2 E, 4 S, 8 W).
 *  - oneway: a block signal that refuses trains coming from the other side (its block rule is in signals.js).
 *  - path: one-way like OpenTTD path signals. A train may enter the tile only when it can reserve the
 *    planned route from there up to the next signal, station or depot; tiles are reserved for it until its
 *    body has left them. Path signals do not split blocks, so trains share a stretch when their routes do not cross.
 *
 * Pre-signals (OpenTTD signal.cpp, simplified; kinds `entry`, `exit`, `combo`, object form `{type, dir}`):
 *  - exit: a block signal (it splits blocks): green when the block beyond it is free of other trains.
 *  - entry: green only when the block it leads into is free AND the wall ending that block (the next block
 *    signal on the planned path) is green: an exit or combo signal whose beyond block is free. A plain
 *    two-way or one-way block signal ahead counts as an exit. A station/depot ends the path: green when the
 *    block up to it is free. A train held by an entry signal waits on the tile before it.
 *  - combo: like entry, but when the wall ahead is another combo/entry it chains: green when its own block
 *    is free and the wall after that is green (depth-limited to 16 signals).
 *  Red (SIGNAL_HOLD) keeps the train before the signal; nothing reserves for pre-signals.
 *
 * Reservations are state data so they save and load: `state.resv` maps tile key -> vehicle id (the field is
 * absent when nothing is reserved), and `v.resv` lists the keys a vehicle holds (absent when none).
 * Everything here is skipped for tiles without an object signal, so default games are unaffected.
 */
import { dirBetween } from './constants.js';
import { connectedNeighbours } from './network.js';
import { vehiclesOn } from './blocking.js';
import { signalDefaultDir, invalidateBlocks, isBlockWall } from './signals.js';

/** Hold result for a train refused by a one-way or path signal (blockedBy -1: no vehicle is waited for). */
export const SIGNAL_HOLD = Object.freeze({ id: -1, state: 'signal' });

/** True when a tile signal value is an object (one-way or path), not the two-way block flag. */
export function isTypedSignal(sig) {
  return !!sig && typeof sig === 'object';
}

/**
 * Gate for a train about to step from a onto b (movement.js nextBlocker, rail only).
 * Refuses a step onto a tile reserved by another live train, the wrong side of a one-way or path signal,
 * and a path signal whose route ahead cannot be reserved. Path signals reserve on approach.
 * @returns {object|null} SIGNAL_HOLD when refused, null when the train may enter the tile
 */
export function typedGate(ctx, v, a, b, force) {
  const { state } = ctx;
  const W = state.map.width;
  const bk = b.y * W + b.x;
  if (state.resv) {
    const owner = state.resv[bk];
    if (owner !== undefined && owner !== v.id && isLive(state, owner)) return SIGNAL_HOLD;
  }
  const sig = state.map.tiles[bk].signal;
  if (!isTypedSignal(sig) || force) return null; // force: forceTrainProceed passes this signal
  if (dirBetween(a.x, a.y, b.x, b.y) !== sig.dir) return SIGNAL_HOLD; // wrong side of a one-way signal
  if (sig.type === 'entry' || sig.type === 'combo') return preGreen(ctx, v, b, sig) ? null : SIGNAL_HOLD;
  if (sig.type === 'exit') return regionFree(ctx, v, regionBeyond(state, b.x, b.y, sig.dir).keys) ? null : SIGNAL_HOLD;
  if (sig.type !== 'path') return null;
  return reserveAhead(ctx, v, v.pathIndex + 1) ? null : SIGNAL_HOLD;
}

/** Step of a dirBetween bit: 1 north, 2 east, 4 south, 8 west. */
const STEP = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };
const MAX_REGION = 96;

/**
 * Rail tiles of the block beyond tile (x,y) when travelling in dir from it (flood fill over rail, stopping at
 * walls, stations and depots). `keys` are the free-or-not block tiles, `walls` the wall signal tile keys met.
 */
function regionBeyond(state, x, y, dir) {
  const map = state.map, W = map.width;
  const keys = [], walls = [], seen = new Set([y * W + x]);
  const st = STEP[dir];
  if (!st) return { keys, walls };
  const stack = [{ x: x + st[0], y: y + st[1], from: null }];
  while (stack.length && keys.length < MAX_REGION) {
    const c = stack.pop();
    if (c.x < 0 || c.y < 0 || c.x >= W || c.y >= map.height) continue;
    const k = c.y * W + c.x;
    if (seen.has(k)) continue;
    seen.add(k);
    const t = map.tiles[k];
    if (!t.rail) continue;
    if (t.signal && isBlockWall(t.signal)) {
      // a wall ends this block; `out` is the way the train would leave the block through it
      if (c.from) walls.push({ k, out: dirBetween(c.from.x, c.from.y, c.x, c.y) });
      continue;
    }
    if (t.building) continue; // station or depot: the block ends there
    keys.push(k);
    for (const nb of connectedNeighbours(map, 'rail', c.x, c.y)) stack.push({ x: nb.x, y: nb.y, from: c });
  }
  return { keys, walls };
}

/** True when no other train has a body cell on any of the keys. */
function regionFree(ctx, v, keys) {
  const W = ctx.state.map.width;
  for (const k of keys) {
    const cx = k % W, cy = (k - cx) / W;
    const list = vehiclesOn(ctx, 'rail', cx, cy);
    if (list) for (const o of list) if (o !== v) return false;
  }
  return true;
}

/**
 * Whether wall w ({k, out}: tile key, direction a train leaves the block through it) lets a train through into
 * the block beyond it. Exit/block/one-way: green when that block is free. Combo: also needs a green wall beyond
 * (chains; depth-limited). Entry: never leads out.
 */
function wallGreen(ctx, v, w, depth) {
  const W = ctx.state.map.width;
  const sig = ctx.state.map.tiles[w.k].signal;
  if (!sig || sig.type === 'entry') return false;
  if (isTypedSignal(sig) && sig.dir !== w.out) return false; // one-way/path wall facing the other way
  const r = regionBeyond(ctx.state, w.k % W, (w.k - (w.k % W)) / W, w.out);
  if (!regionFree(ctx, v, r.keys)) return false;
  if (sig.type !== 'combo') return true;
  if (!r.walls.length || depth >= 16) return true;
  return r.walls.some((n) => wallGreen(ctx, v, n, depth + 1));
}

/**
 * Pre-signal gate for entry/combo signal tile b (entered in its dir): its block beyond must be free and one of
 * the walls ending that block must be green. A block with no wall ahead (station or depot end) is green when free.
 * @returns {boolean}
 */
function preGreen(ctx, v, b, sig) {
  const W = ctx.state.map.width;
  const r = regionBeyond(ctx.state, b.x, b.y, sig.dir);
  if (!regionFree(ctx, v, r.keys)) return false;
  if (!r.walls.length) return true;
  return r.walls.some((w) => wallGreen(ctx, v, w, 0));
}

/**
 * Reserve the planned route from path[si] (the signal tile) up to, not including, the next signal or
 * station/depot tile. Fails (reserving nothing) when a tile holds another train or another live train's
 * reservation. On success the tiles are recorded in state.resv and v.resv.
 * @returns {boolean}
 */
export function reserveAhead(ctx, v, si) {
  const { state } = ctx;
  const W = state.map.width, tiles = state.map.tiles, p = v.path;
  const keys = [];
  for (let j = si; j < p.length; j++) {
    const c = p[j];
    const t = tiles[c.y * W + c.x];
    if (j > si && (t.signal || t.building)) break;
    keys.push(c.y * W + c.x);
  }
  const resv = state.resv;
  for (let j = 0; j < keys.length; j++) {
    const k = keys[j];
    const cx = k % W, cy = (k - cx) / W;
    const list = vehiclesOn(ctx, 'rail', cx, cy);
    if (list) for (const o of list) if (o !== v) return false;
    const owner = resv ? resv[k] : undefined;
    if (owner !== undefined && owner !== v.id && isLive(state, owner)) return false;
  }
  if (!state.resv) state.resv = {};
  for (const k of keys) state.resv[k] = v.id;
  if (!v.resv) v.resv = [];
  for (const k of keys) if (!v.resv.includes(k)) v.resv.push(k);
  return true;
}

/** True when a vehicle with this id is still in the game (a sold vehicle's reservations are stale). */
function isLive(state, id) {
  for (const o of state.vehicles) if (o.id === id) return true;
  return false;
}

/**
 * Release the reserved tiles a vehicle no longer needs: those neither ahead on its path nor still under its
 * body (history). Removes state.resv and v.resv again once empty, so an unreserved game stays unchanged.
 */
export function releaseReservations(state, v) {
  const list = v.resv;
  if (!list) return;
  const W = state.map.width;
  const keep = new Set();
  const p = v.path || [];
  for (let j = v.pathIndex || 0; j < p.length; j++) keep.add(p[j].y * W + p[j].x);
  for (const c of v.history || []) keep.add(c.y * W + c.x);
  const left = [];
  for (const k of list) {
    if (keep.has(k)) { left.push(k); continue; }
    if (state.resv && state.resv[k] === v.id) delete state.resv[k];
  }
  if (left.length) v.resv = left;
  else delete v.resv;
  if (state.resv) {
    let any = false;
    for (const k in state.resv) { any = true; break; }
    if (!any) delete state.resv;
  }
}

/** Signal kinds in tool cycle order (block = two-way, the default). */
export const SIGNAL_TYPES = ['block', 'oneway', 'path'];

/**
 * Cycle the kind of an existing typed signal (oneway <-> path) keeping its direction; a two-way block signal
 * becomes one-way in its default direction. Free of charge (only the signal's rules change).
 */
export function cycleSignalType(state, x, y, opts = {}) {
  const W = state.map.width;
  if (x < 0 || y < 0 || x >= W || y >= state.map.height) return { ok: false, error: 'Out of bounds' };
  const t = state.map.tiles[y * W + x];
  if (!t.signal) return { ok: false, error: 'No signal here' };
  const cur = isTypedSignal(t.signal) ? t.signal.type : 'block';
  const next = cur === 'block' ? 'oneway' : cur === 'oneway' ? 'path' : 'block';
  if (opts.dryRun) return { ok: true, tiles: 1 };
  if (next === 'block') t.signal = 1;
  else t.signal = { type: next, dir: isTypedSignal(t.signal) ? t.signal.dir : signalDefaultDir(state, x, y) };
  invalidateBlocks(state); // path signals do not split blocks: the block index changes with the type
  return { ok: true, tiles: 1, type: next };
}

/** Opposite pass direction (dirBetween bits: 1<->4, 2<->8). */
const OPPOSITE = { 1: 4, 4: 1, 2: 8, 8: 2 };

/**
 * Reverse the pass direction of a one-way/path signal (OpenTTD: clicking a signal cycles its direction).
 * @returns {{ok:true,tiles:1,dir:number}|{ok:false,error:string}}
 */
export function flipSignal(state, x, y, opts = {}) {
  const W = state.map.width;
  if (x < 0 || y < 0 || x >= W || y >= state.map.height) return { ok: false, error: 'Out of bounds' };
  const t = state.map.tiles[y * W + x];
  if (!isTypedSignal(t.signal)) return { ok: false, error: 'Not a one-way or path signal' };
  const dir = OPPOSITE[t.signal.dir];
  if (!dir) return { ok: false, error: 'Bad signal direction' };
  if (opts.dryRun) return { ok: true, tiles: 1, dir };
  t.signal = { type: t.signal.type, dir };
  invalidateBlocks(state);
  return { ok: true, tiles: 1, dir };
}
