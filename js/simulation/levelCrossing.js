/**
 * Level crossing barring (OpenTTD train_cmd.cpp UpdateLevelCrossing / TrainApproachingCrossing, road_cmd.cpp
 * barred sprite). A crossing (road and rail on one tile, not grade separated or tunnelled) is barred while a
 * train occupies it or its next one or two path tiles. Derived each tick from train positions: the set lives
 * in the per-tick context (ctx.barred, a Set of tile indices), is never saved and never stored on tiles, so the
 * world hash and old saves are unaffected. Road vehicles and background cars stop before a barred crossing and
 * go on once it opens. Trains never wait for road traffic (OpenTTD).
 */
import { getSetting } from './settings.js';

/** Blocker object for a road vehicle held before a barred crossing (blocking.js hold()). */
export const CROSSING_HOLD = Object.freeze({ id: -1, state: 'crossing' });

/** Level crossing tile: road and rail together, not grade separated, not in a tunnel. */
export function isLevelCrossing(t) {
  return !!t && !!t.road && !!t.rail && !t.gradeSep && !t.tunnel;
}

/** True when the level crossing setting is on for this state. */
export function levelCrossingsOn(state) {
  return getSetting(state, 'levelCrossings') === true;
}

/**
 * Tile indices of the crossings barred this tick: body tiles of every train (head and its trailing history)
 * plus the next two path tiles of a running train. Returns null when the setting is off.
 * @param {object} state
 * @returns {Set<number>|null}
 */
export function computeBarred(state) {
  if (!levelCrossingsOn(state)) return null;
  const map = state.map, W = map.width, H = map.height, tiles = map.tiles;
  const set = new Set();
  const mark = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (isLevelCrossing(tiles[i])) set.add(i);
  };
  for (const v of state.vehicles) {
    if (v.kind !== 'train' || v.state === 'depot') continue;
    const h = v.history;
    if (h) for (let k = 0; k < h.length; k++) mark(h[k].x, h[k].y);
    else mark(v.tx, v.ty);
    const p = v.path;
    if (p && v.state === 'running') {
      for (let k = v.pathIndex + 1; k <= v.pathIndex + 2 && k < p.length; k++) mark(p[k].x, p[k].y);
    }
  }
  return set;
}

/**
 * Per-tick refresh (VehicleManager.tick, before any vehicle moves): ctx.barred is the set for this tick and
 * ctx.barredNew the crossings that closed since the last tick (for the closing bell). Both absent when off.
 */
export function refreshBarred(ctx, state) {
  const prev = ctx.barred;
  const now = computeBarred(state);
  if (!now) { ctx.barred = null; ctx.barredNew = null; return; }
  let fresh = null;
  if (ctx.emit && prev) for (const i of now) if (!prev.has(i)) (fresh || (fresh = [])).push(i);
  ctx.barred = now;
  ctx.barredNew = fresh;
}

/** Road traffic entering barred crossing tile bi from a tile ai that is not barred (tile indices). */
export function entersBarred(barred, W, ai, bi) {
  return barred.has(bi) && !barred.has(ai);
}
