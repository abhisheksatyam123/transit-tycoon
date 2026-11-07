/**
 * Plane crashes on landing (OpenTTD aircraft_cmd.cpp MaybeCrashAirplane / CrashAirplane).
 * Setting planeCrashes: 'off' (default: nothing is rolled, so no random draws), 'reduced' or 'normal'.
 * Chance per landing (out of 2^22, OpenTTD GB(Random(), 0, 22)): jets (shape jet/widebody) at a small
 * (short-strip) airport use 3276 at either level; helicopters never crash; other aircraft use (0x4000 << level) / 1500 (reduced 21, normal 43).
 * A crash: passengers on board die, the airport loses its waiting cargo (ratings reset to 1), the vehicle is
 * removed (orders, groups, reservations, rival lists), a news item is posted (accident category), and the
 * nearest town's company rating drops by 160 (OpenTTD ModifyStationRatingAround -160). Emits 'crash'.
 */
import { getSetting } from './settings.js';
import { notify } from './news.js';
import { leaveOrderGroup } from './sharedOrders.js';
import { nearestTown } from './state.js';
import { adjustCompanyRating } from './loco/town.js';
import { vehicleModel } from './vehicles.js';
import { createRng } from './rng.js';
import { noJetCrash } from './cheats.js';
import { airportTypeId, isHelicopter } from './airportTypes.js';
import { getTile } from './map.js';

/** OpenTTD MaybeCrashAirplane: crash threshold out of 2^22 for this landing (0 = cannot crash). */
export function crashChance(state, v, st) {
  const level = getSetting(state, 'planeCrashes');
  if (level !== 'reduced' && level !== 'normal') return 0;
  if (isHelicopter(v)) return 0; // OTTD: helicopters land on helipads, never MaybeCrashAirplane
  const model = vehicleModel(v);
  // OTTD: the 3276 jet value applies only on SHORT_STRIP airports (small); elsewhere the level formula
  const b = st ? getTile(state.map, st.x, st.y)?.building : null;
  const shortStrip = b && b.kind === 'airport' && (airportTypeId(b) === 'small' || airportTypeId(b) === 'commuter');
  // OpenTTD no_jetcrash cheat: jets skip the short-strip rule and use the level formula below
  if (shortStrip && model && (model.shape === 'jet' || model.shape === 'widebody') && !noJetCrash(state)) return 3276;
  return Math.floor((0x4000 << (level === 'normal' ? 2 : 1)) / 1500);
}

/** Remove a vehicle from the game state: orders, groups, reservations, rival lists. */
export function removeVehicle(state, v) {
  leaveOrderGroup(state, v);
  if (v.resv && state.resv) {
    for (const k of v.resv) if (state.resv[k] === v.id) delete state.resv[k];
    if (!Object.keys(state.resv).length) delete state.resv;
  }
  delete v.resv;
  for (const r of state.rivals || []) if (r.vehicles) r.vehicles = r.vehicles.filter((id) => id !== v.id);
  state.vehicles = state.vehicles.filter((x) => x !== v);
}

/**
 * Roll for a crash as aircraft v lands at station st (called once at the landing step).
 * @param {{state:object, emit?:Function}} ctx (the vehicle tick context)
 * @returns {boolean} true when the aircraft crashed and was removed; the caller must stop handling it
 */
export function maybeCrashLanding(ctx, v, st) {
  const { state } = ctx;
  const chance = crashChance(state, v, st);
  if (!chance) return false;
  if (Math.floor(createRng(state).next() * 4194304) > chance) return false; // same stream as game.rng (state.rngState)
  const victims = v.load && v.cargoId === 'PASS' ? v.load.amount || 0 : 0;
  for (const cargoId of Object.keys(st.cargo || {})) st.cargo[cargoId] = [];
  for (const cargoId of Object.keys(st.rating || {})) st.rating[cargoId] = 1;
  const { x, y } = st;
  const town = nearestTown(state, x, y);
  if (town) adjustCompanyRating(town, -160);
  removeVehicle(state, v);
  notify(ctx, `Plane crashes! ${victims} die in fireball at ${st.name}`, 'bad', x, y, 'accident');
  if (ctx.emit) ctx.emit('crash', { x, y, victims });
  return true;
}
