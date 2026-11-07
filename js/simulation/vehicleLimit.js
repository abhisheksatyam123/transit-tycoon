/**
 * Max vehicles per company (OpenTTD settings max_trains / max_roadveh / max_aircraft / max_ships).
 * Counted per owner (player = ownerId null, rivals = their id). Checked by buyVehicle, so rivals obey it too.
 */
import { getSetting } from './settings.js';

/** vehicle kind (state.vehicles[].kind) -> setting key */
export const VEHICLE_LIMIT_KEY = { train: 'maxTrains', road: 'maxRoadVeh', aircraft: 'maxAircraft', ship: 'maxShips' };

/** Vehicle kind of a purchasable model (same mapping as createVehicle). */
export function vehicleKindOfModel(model) {
  return model.kind === 'engine' ? 'train' : model.kind === 'aircraft' ? 'aircraft' : model.kind === 'ship' ? 'ship' : 'road';
}

/**
 * Error text when `owner` already has as many vehicles of `kind` as the setting allows, else null.
 * @param {any} state
 * @param {string} kind
 * @param {number|null} owner
 * @returns {string|null}
 */
export function vehicleLimitError(state, kind, owner = null) {
  const key = VEHICLE_LIMIT_KEY[kind];
  if (!key) return null;
  const limit = getSetting(state, key);
  let n = 0;
  for (const v of state.vehicles) if (v.kind === kind && (v.ownerId ?? null) === owner) n++;
  if (n < limit) return null;
  const what = { train: 'trains', road: 'road vehicles', aircraft: 'aircraft', ship: 'ships' }[kind];
  return `Vehicle limit reached: ${limit} ${what} per company`;
}
