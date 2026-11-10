/**
 * order.gradual_loading (OpenTTD economy.cpp LoadUnloadVehicle, GetLoadAmount, gradual_loading_wait_time).
 * Opt-in in TT (default off, so the world hash and existing saves are unchanged). When on, a vehicle loads
 * in cycles: each cargo-carrying part takes at most its load amount per cycle, and cycles are spaced by the
 * OpenTTD wait time for the vehicle class.
 *
 * Load amounts: OpenTTD's base table (src/table/engines.h macro notes) sets them per class: trains, carriages
 * and road vehicles 5, ships 10, aeroplanes 20; air mail uses a quarter (economy.cpp GetLoadAmount). NewGRF
 * callbacks 12/36 and the NoDefaultCargoMultiplier flag are not modelled.
 *
 * Wait times are OpenTTD ticks (74 per day, timer_game_tick.h DAY_TICKS). TT has TICKS_PER_DAY ticks per day,
 * so the wait is converted to keep real time.
 */
import { getSetting } from './settings.js';
import { TICKS_PER_DAY } from './constants.js';
import { articParts } from './articulated.js';

/** OpenTTD gradual_loading_wait_time (economy.cpp), in OpenTTD ticks: train, road, ship, aircraft. */
export const GRADUAL_WAIT_OTTD = { train: 40, road: 20, ship: 10, aircraft: 20 };
/** OpenTTD ticks per day (timer_game_tick.h DAY_TICKS). */
export const OTTD_TICKS_PER_DAY = 74;
/** Load amount per part per cycle (OpenTTD base table, per vehicle class). */
export const GRADUAL_LOAD_AMOUNT = { train: 5, road: 5, ship: 10, aircraft: 20 };

/** OpenTTD vehicle class of a TT vehicle. */
export function gradualClass(v) {
  if (v.kind === 'train') return 'train';
  if (v.kind === 'ship') return 'ship';
  if (v.kind === 'aircraft') return 'aircraft';
  return 'road';
}

export function gradualLoadingOn(state) {
  return getSetting(state, 'gradualLoading') === true;
}

/** Units a part may load per cycle (air mail: a quarter of the aircraft amount, OpenTTD GetLoadAmount). */
export function loadAmountFor(v, cargoId = v.cargoId) {
  const base = GRADUAL_LOAD_AMOUNT[gradualClass(v)];
  return v.kind === 'aircraft' && cargoId === 'MAIL' ? Math.ceil(base / 4) : base;
}

/** Wait between two gradual cycles, in TT ticks (OpenTTD wait x 96/74, at least 1). */
export function gradualWaitTicks(v) {
  const w = GRADUAL_WAIT_OTTD[gradualClass(v)];
  return Math.max(1, Math.round((w * TICKS_PER_DAY) / OTTD_TICKS_PER_DAY));
}

/** Cargo-carrying parts of a whole (non-consist) vehicle; a train counts its wagons, inside the platform when cut. */
export function plainParts(v) {
  if (v.kind === 'train') return v.platFit != null ? v.platFit : (v.wagons || 0);
  const parts = articParts(v);
  if (!parts) return 1;
  return parts.filter((p) => p.capacity > 0).length || 1;
}
