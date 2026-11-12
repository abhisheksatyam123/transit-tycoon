/**
 * Vehicle collisions (OpenTTD train_cmd.cpp CheckTrainCollision / TrainCrashed, roadveh_cmd.cpp RoadVehCrash).
 * Setting vehicleCollisions (default off: nothing is checked, no random draws). Called from movement.js move()
 * when a train's head has just entered a tile (ctx.collide = setting on).
 *
 *  - Train vs train: a head entering a tile where another train's body covers it, moving the OTHER way, crashes
 *    both trains (head-on). Same-direction trains never crash (blocking.js holds the follower). Trains in a
 *    station (state 'loading') and in depots are not part of this check (not indexed / skipped).
 *  - Train vs road vehicle at a barred level crossing (OpenTTD TrainCollideWithRoadVehicle): a road vehicle whose
 *    body covers the crossing is destroyed (trainEntersCrossing; on a level crossing tile).
 *
 * Crashed vehicles are only marked (v.wrecked) and removed by vehicleManager.tick after the vehicle loop, because
 * removeVehicle replaces state.vehicles mid-loop. A crash posts one news item and emits 'crash' at the tile.
 * Simplifications: no wreck delay, no company rating change (opt-in trainCrashStationRating: station ratings within
 * 30 tiles of the crash lose 160, OpenTTD ModifyStationRatingAround), a third train passing a wreck is not crashed.
 * Trains of different owners never crash each other (OpenTTD train_cmd.cpp ~3296-3300).
 * Cost: O(vehicles indexed on one tile) per train head step, only with the setting on.
 */
import { notify } from './news.js';
import { isLevelCrossing } from './levelCrossing.js';
import { getTile } from './map.js';
import { vehiclesOn, vehicleDir } from './blocking.js';
import { dirBetween } from './constants.js';
import { getSetting } from './settings.js';

/** OpenTTD ModifyStationRatingAround(tile, owner, -160, 30) (train_cmd.cpp ~3360), used by trainCrashStationRating. */
const CRASH_RATING_PENALTY = 160;
const CRASH_RATING_RADIUS = 30;

/** Mark v as wrecked (once) and queue it for removal after the vehicle loop. Returns its passengers. */
function wreck(ctx, v) {
  v.wrecked = true;
  (ctx.wrecked || (ctx.wrecked = [])).push(v);
  return v.load && v.cargoId === 'PASS' ? v.load.amount || 0 : 0;
}

/**
 * Called from movement.js move() when train v's head has just entered tile (x,y): crashes it head-on with another
 * train whose body covers the tile, then checks a barred level crossing.
 */
export function trainEnters(ctx, v, x, y) {
  if (ctx.occupancy) {
    const list = vehiclesOn(ctx, 'rail', x, y);
    if (list && v.state !== 'loading') {
      const dir = trainDir(v, x, y);
      for (const o of list) {
        if (o === v || o.kind !== 'train' || o.wrecked || o.state === 'loading' || o.state === 'depot') continue;
        // OpenTTD train_cmd.cpp ~3296-3300: no crash between vehicles of different owners (AI rivals vs player)
        if ((o.ownerId ?? null) !== (v.ownerId ?? null)) continue;
        const od = vehicleDir(o);
        if (!od || !dir || od === dir) continue; // same way (follower at blocking distance) or unknown: no crash
        const victims = wreck(ctx, v) + wreck(ctx, o);
        if (getSetting(ctx.state, 'trainCrashStationRating')) crashStationRating(ctx.state, v.ownerId, x, y);
        notify(ctx, `Train crash! ${victims} die in collision`, 'bad', x, y, 'accident');
        if (ctx.emit) ctx.emit('crash', { x, y, victims });
        return;
      }
    }
  }
  trainEntersCrossing(ctx, v, x, y);
}

/**
 * Setting trainCrashStationRating (OpenTTD ModifyStationRatingAround -160, radius 30): every station of the crashed
 * train's company within Manhattan 30 tiles of the crash loses 160 points on each cargo rating (0..200 scale,
 * clamped at 0), and the published % rating is refreshed. Cargo ratings then recover through the normal daily step.
 */
function crashStationRating(state, ownerId, x, y) {
  for (const st of state.stations || []) {
    if ((st.ownerId ?? null) !== (ownerId ?? null)) continue;
    if (Math.abs(st.x - x) + Math.abs(st.y - y) > CRASH_RATING_RADIUS) continue;
    st.rating200 = st.rating200 || {};
    st.rating = st.rating || {};
    for (const c of new Set([...Object.keys(st.rating200), ...Object.keys(st.rating)])) {
      const cur = st.rating200[c] !== undefined ? st.rating200[c] : st.rating[c] * 2; // legacy saves: % only
      if (!Number.isFinite(cur)) continue;
      const r = Math.max(0, cur - CRASH_RATING_PENALTY);
      st.rating200[c] = r;
      st.rating[c] = Math.round(r / 2);
    }
  }
}

/** Direction bit of train v's head moving onto (x,y) along its path (0 if unknown). */
function trainDir(v, x, y) {
  const p = v.path, i = v.pathIndex;
  if (!p || i < 1) return 0;
  const a = p[i - 1];
  return dirBetween(a.x, a.y, x, y);
}

/**
 * Called from trainEnters when train v's head has just entered tile (x,y). Cheap: only a level crossing tile
 * (isLevelCrossing) reaches the occupancy lookup; the caller already needs ctx.collide.
 */
export function trainEntersCrossing(ctx, v, x, y) {
  const { state } = ctx;
  const tile = getTile(state.map, x, y);
  if (!isLevelCrossing(tile)) return;
  // road layer of the per-tick occupancy index (blocking.js): O(vehicles on this tile), not O(all vehicles)
  const list = ctx.occupancy ? vehiclesOn(ctx, 'road', x, y) : null; // null: nothing on the tile
  if (!list) return;
  for (const r of list) {
    if (r.kind !== 'road' || r.wrecked || r.state === 'depot') continue;
    const victims = wreck(ctx, r);
    notify(ctx, 'Road vehicle destroyed in collision with train', 'bad', x, y, 'accident');
    if (ctx.emit) ctx.emit('crash', { x, y, victims });
  }
}
