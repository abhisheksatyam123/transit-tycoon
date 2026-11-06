/**
 * Two-way block signals (stage 2 of OpenTTD-style blocking; OpenTTD CMD_BUILD_SIGNALS / CMD_REMOVE_SIGNALS).
 *
 * A signal is a flag on a plain straight rail tile: `tile.signal = 1` (lazy field: only signalled tiles carry
 * it, so saves without signals are unchanged). A signal tile belongs to no block; the rail network is split
 * into blocks at signal tiles. Blocks are derived data: computed by a flood fill over rail connectivity,
 * cached per map (WeakMap, never saved) and dropped by invalidateBlocks() whenever rail or signals change.
 *
 * Rule (movement.js nextBlocker): a train may enter a block that touches a signal only when no OTHER train
 * has a body cell in that block. A train already inside a block is never stopped by it, and blocks with no
 * signal behave exactly as before (head-on trains pass), so unsignalled networks are unchanged.
 */
import { COSTS } from '../config/costs.js';
import { straightAxis, connectedNeighbours } from './network.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { ERR, checkMoney, coordsOk } from './trackRules.js';

/** Derived block data per map: { blockOf: Int32Array (-1 = signal or no rail), bounded: Set<id>, count }. */
const cache = new WeakMap();

/** Drop cached blocks for this state (call after any rail or signal change). */
export function invalidateBlocks(state) {
  if (state && state.map) cache.delete(state.map);
}

/**
 * Why a signal cannot be built on (x,y), or null when it can.
 * Signals sit on plain straight rail: no junction, station, depot, road, bridge deck or tunnel.
 */
export function signalRefusal(state, x, y) {
  const map = state.map;
  if (!coordsOk(map, x, y)) return ERR.bounds;
  const t = map.tiles[y * map.width + x];
  if (t.signal) return 'Already has a signal';
  if (!t.rail) return 'No rail here';
  if (straightAxis(t.rail) === null || t.rail === 0) return 'Signals go on straight track';
  if (t.road) return 'Signals cannot share a road crossing';
  if (t.building) return 'Signals cannot go on stations or depots';
  if (t.terrain === 'water' || t.tunnel) return 'Signals cannot go on bridges or tunnels';
  return null;
}

/** Build a two-way block signal on a straight rail tile. opts.dryRun: check and price only. */
export function buildSignal(ctx, x, y, opts = {}) {
  const { state } = ctx;
  const err = signalRefusal(state, x, y);
  if (err) return { ok: false, error: err };
  const cost = constructionTotal(state, COSTS.signal);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, tiles: 1 };
  state.map.tiles[y * state.map.width + x].signal = 1;
  invalidateBlocks(state);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, tiles: 1 };
}

/** Remove the signal from (x,y). Charged like other removals (COSTS.demolishSignal). */
export function removeSignal(ctx, x, y, opts = {}) {
  const { state } = ctx;
  if (!coordsOk(state.map, x, y)) return { ok: false, error: ERR.bounds };
  const t = state.map.tiles[y * state.map.width + x];
  if (!t.signal) return { ok: false, error: 'No signal here' };
  const cost = constructionTotal(state, COSTS.demolishSignal);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, tiles: 1 };
  delete t.signal;
  invalidateBlocks(state);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, tiles: 1 };
}

/**
 * Block index of a state's rail network (cached). Returns null when the map has no signal.
 * @returns {{blockOf:Int32Array, bounded:Set<number>, count:number}|null}
 */
export function blockIndex(state) {
  const map = state.map;
  let idx = cache.get(map);
  if (idx === undefined) {
    idx = buildBlocks(map);
    cache.set(map, idx);
  }
  return idx;
}

function buildBlocks(map) {
  const W = map.width, n = map.width * map.height;
  const signals = [];
  for (let i = 0; i < n; i++) if (map.tiles[i].signal) signals.push(i);
  if (!signals.length) return null;
  const blockOf = new Int32Array(n).fill(-1);
  const isWall = (k) => !!map.tiles[k].signal;
  let count = 0;
  const stack = [];
  for (let k = 0; k < n; k++) {
    if (blockOf[k] !== -1 || !map.tiles[k].rail || isWall(k)) continue;
    const id = count++;
    blockOf[k] = id;
    stack.push(k);
    while (stack.length) {
      const c = stack.pop();
      const x = c % W, y = (c - x) / W;
      for (const nb of connectedNeighbours(map, 'rail', x, y)) {
        const nk = nb.y * W + nb.x;
        if (blockOf[nk] !== -1 || isWall(nk)) continue;
        blockOf[nk] = id;
        stack.push(nk);
      }
    }
  }
  // a block is bounded when a signal sits on one of its rail ends
  const bounded = new Set();
  for (const s of signals) {
    const x = s % W, y = (s - x) / W;
    for (const nb of connectedNeighbours(map, 'rail', x, y)) {
      const b = blockOf[nb.y * W + nb.x];
      if (b >= 0) bounded.add(b);
    }
  }
  return { blockOf, bounded, count };
}

/** Block id of tile key k that a signal rule applies to, or -1 (no signals, signal tile, or unbounded). */
export function guardedBlock(state, k) {
  const idx = blockIndex(state);
  if (!idx) return -1;
  const b = idx.blockOf[k];
  return b >= 0 && idx.bounded.has(b) ? b : -1;
}

