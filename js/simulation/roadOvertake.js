/**
 * Road vehicle overtaking (OpenTTD roadveh_cmd.cpp RoadVehCheckOvertake / CheckRoadBlockedForOvertaking /
 * IndividualRoadVehicleController abort). Behind the `roadOvertaking` setting (default off).
 *
 * A road vehicle v about to be held by a same-way road vehicle u may overtake when:
 *  - v is not a tram, and u is not a tram (trams never overtake);
 *  - v has no articulated part (OpenTTD roadveh_cmd.cpp:828-829: articulated road vehicles can't overtake anything);
 *  - v is faster than u (u's max speed below v's, or u stopped: OTTD RoadVehCheckOvertake speed test);
 *  - the lane ahead is straight plain road for OVERTAKE_WINDOW_TILES tiles: no junction, station, depot,
 *    level crossing, bridge/tunnel end or one-way tile (no legal opposite lane);
 *  - no road vehicle other than v and u is on those tiles (OTTD HasVehicleOnTile).
 * While overtaking, v ignores u in blocking (it passes through u's tile). The overtake ends after
 * OVERTAKE_TIMEOUT_TICKS on a straight road (OTTD: abort only on straight road), at once on a station tile,
 * or when the setting is switched off. When u is stopped the timeout is halved (OTTD).
 *
 * State is lazy on the vehicle: `overtakeId` (overtaken vehicle id) and `overtakeCtr` (ticks), both absent
 * unless overtaking. No allocation per tick.
 */
import { dirBetween, AXIS_BITS } from './constants.js';
import { vehiclesOn, vehicleDir } from './blocking.js';
import { straightAxis } from './network.js';
import { articSpan } from './articulated.js';
import { getSetting } from './settings.js';

/** OpenTTD RV_OVERTAKE_TIMEOUT (35), in TT ticks. */
export const OVERTAKE_TIMEOUT_TICKS = 35;
/** Tiles of opposite lane (from the vehicle's own tile onwards) that must be free to start an overtake. */
const OVERTAKE_WINDOW_TILES = 3;

/** True when the roadOvertaking setting is on. */
export function overtakeEnabled(state) {
  return getSetting(state, 'roadOvertaking') === true;
}

/** Plain straight road tile on the given axis: no station/depot, crossing, bridge, tunnel or one-way. */
function plainRoadTile(t, axis) {
  return !!t && !!t.road && !t.rail && !t.building && !t.overBridge && t.bridgeDeck === undefined
    && !t.playerBridge && !t.playerTunnel && !t.oneWay && straightAxis(t.road) === axis;
}

/** Vehicle ahead on the same way that blocks v at tile (x,y) while v is overtaking (skips the overtaken one). */
export function overtakeBlocker(ctx, v, x, y, dir) {
  const list = vehiclesOn(ctx, 'road', x, y);
  if (!list) return null;
  const t = ctx.state.map.tiles[y * ctx.state.map.width + x];
  const station = !!t && !!t.building && t.building.type === 'station';
  for (const o of list) {
    if (o === v || o.id === v.overtakeId) continue;
    const od = vehicleDir(o);
    if (od && od !== dir && !station) continue; // oncoming traffic does not block
    return o;
  }
  return null;
}

/**
 * Try to start overtaking u (the same-way vehicle blocking v). Sets v.overtakeId / v.overtakeCtr.
 * @returns {boolean} true when the overtake started
 */
export function tryOvertake(ctx, v, u) {
  if (v.roadType === 'tram' || u.roadType === 'tram' || u.kind !== 'road') return false;
  // OpenTTD roadveh_cmd.cpp:828-829 RoadVehCheckOvertake: "For now, articulated road vehicles can't overtake anything."
  if (articSpan(v) > 0) return false;
  // OTTD: u_speed = max speed of u; no overtake of a vehicle that is at least as fast and moving
  if (u.maxSpeed >= v.maxSpeed && u.state !== 'stopped' && u.speed !== 0) return false;
  const path = v.path, i = v.pathIndex;
  if (!path || i + 1 >= path.length) return false;
  const a = path[i], b = path[i + 1];
  const dir = dirBetween(a.x, a.y, b.x, b.y);
  if (!dir) return false;
  const axis = dir & AXIS_BITS.x ? 'x' : 'y';
  const state = ctx.state, W = state.map.width, tiles = state.map.tiles;
  const last = Math.min(path.length - 1, i + OVERTAKE_WINDOW_TILES);
  for (let j = i; j <= last; j++) {
    const p = path[j];
    if (!plainRoadTile(tiles[p.y * W + p.x], axis)) return false;
    if (j < path.length - 1) {
      const q = path[j + 1];
      if (dirBetween(p.x, p.y, q.x, q.y) !== dir) return false; // lane must stay straight
    }
    const list = vehiclesOn(ctx, 'road', p.x, p.y);
    if (list) for (const o of list) if (o !== v && o !== u) return false; // opposite lane / lane ahead not free
  }
  v.overtakeId = u.id;
  v.overtakeCtr = u.speed === 0 || u.state === 'stopped' ? OVERTAKE_TIMEOUT_TICKS / 2 : 0;
  return true;
}

/** End an overtake: drop the lazy fields. */
function clearOvertake(v) {
  delete v.overtakeId;
  delete v.overtakeCtr;
}

/**
 * Per-tick overtake bookkeeping (called while v.overtakeId is set). Aborts when the setting is off, on a
 * station tile, or after the timeout on a straight road.
 */
export function overtakeTick(ctx, v) {
  const state = ctx.state;
  if (!overtakeEnabled(state)) { clearOvertake(v); return; }
  const t = state.map.tiles[v.ty * state.map.width + v.tx];
  if (t && t.building && t.building.type === 'station') { clearOvertake(v); return; }
  v.overtakeCtr = (v.overtakeCtr || 0) + 1;
  if (v.overtakeCtr >= OVERTAKE_TIMEOUT_TICKS && t && t.road && straightAxis(t.road) !== null) clearOvertake(v);
}

/** OpenTTD RoadVehicle::UpdateSpeed: overtaking acceleration 512 vs 256 (roadveh_cmd.cpp:751). */
const OVERTAKE_ACCEL_MULT = 2;

/**
 * Speed of v after a land speed step while overtaking: the acceleration delta is doubled (OTTD 512 vs 256),
 * capped at the target speed. Only called/affected when v.overtakeId is set; otherwise `next` is returned.
 * @param {object} v road vehicle (overtakeId lazy)
 * @param {number} prev speed before the step (tiles/tick)
 * @param {number} next speed after the normal step (tiles/tick)
 * @param {number} targetTiles max speed (tiles/tick)
 */
export function overtakeSpeed(v, prev, next, targetTiles) {
  if (v.overtakeId === undefined || next <= prev) return next;
  return Math.min(targetTiles, prev + OVERTAKE_ACCEL_MULT * (next - prev));
}
