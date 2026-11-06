/**
 * Autorenew (OpenTTD company setting "autorenew" / OpenLoco autoreplace-by-age, simplified): a vehicle
 * stopped in a depot whose age exceeds its max age is replaced by a new vehicle of the same model,
 * wagons and cargo. Orders, shared order group, name, service interval and profit history carry over.
 * The company pays the new price minus the resale value of the old vehicle. Off by default
 * (setting `autorenew`), so existing simulations are unchanged.
 */
import { getSetting } from './settings.js';
import { MODEL_BY_ID } from '../config/vehicles.js';
import { resolvePurchase, createVehicle } from './vehicles.js';
import { vehiclePrice } from './prices.js';
import { spend } from './economy.js';
import { checkMoney } from './trackRules.js';
import { notify } from './news.js';

/**
 * Replace `v` (stopped in a depot, past max age) with a new vehicle of its model, if autorenew is on,
 * the model is still purchasable and the company can pay the difference.
 * @returns {object|null} the new vehicle, or null when nothing happened
 */
export function autorenewVehicle(ctx, v) {
  const { state } = ctx;
  if (!getSetting(state, 'autorenew') || v.state !== 'depot' || !(v.age > v.maxAge)) return null;
  const depot = state.depots.find((d) => d.id === v.depotId);
  if (!depot) return null;
  const spec = {
    modelId: v.modelId,
    wagonModelId: v.wagonModelId || undefined,
    wagons: v.wagons || 0,
    cargoId: v.cargoId || undefined,
  };
  const r = resolvePurchase(depot, spec, state.date.year);
  if (!r.ok) return null; // model obsolete (or unavailable): keep the old vehicle
  const price = vehiclePrice(state, r.cost);
  const diff = price - (v.value || 0);
  if (checkMoney(state, diff)) return null;
  const idx = state.vehicles.indexOf(v);
  if (idx < 0) return null;
  const nv = createVehicle(state, depot, r.template, price);
  state.vehicles.pop(); // createVehicle appends; put the new one in the old slot (keeps the caller's loop stable)
  state.vehicles[idx] = nv;
  nv.name = v.name;
  nv.unitNumber = v.unitNumber;
  nv.orders = v.orders.map((o) => ({ ...o }));
  nv.orderIndex = v.orderIndex || 0;
  if (v.orderGroup != null) nv.orderGroup = v.orderGroup;
  if (v.serviceIntervalDays) { nv.serviceIntervalDays = v.serviceIntervalDays; nv.lastServiceDay = v.lastServiceDay; }
  nv.profitThisYear = v.profitThisYear || 0;
  nv.profitLastYear = v.profitLastYear || 0;
  // only the difference is paid; the resale value of the old vehicle is credited inside it
  spend(state.company, 'vehicles', diff);
  notify(ctx, `${v.name} was renewed (autorenew, ${MODEL_BY_ID[v.modelId] ? MODEL_BY_ID[v.modelId].name : v.modelId}).`, 'info', v.tx, v.ty);
  return nv;
}
