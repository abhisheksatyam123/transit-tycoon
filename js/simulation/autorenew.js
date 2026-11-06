/**
 * Autoreplace / autorenew (OpenTTD autoreplace_cmd.cpp, simplified).
 *
 * A vehicle stopped in a depot is replaced by a new vehicle when:
 *  1. the company has an autoreplace rule for its model (state.company.autoreplace, see autoreplace.js), any age; or
 *  2. setting `autorenew` is on and the vehicle is past its max age (same model).
 * The new vehicle keeps name, unit number, orders, shared order group, service interval, profit history, and for
 * trains the wagons, for road vehicles the cargo. The company pays the new price minus the resale value of the old
 * vehicle. Unaffordable replacements are skipped (news, at most once a month per vehicle).
 */
import { getSetting } from './settings.js';
import { MODEL_BY_ID } from '../config/vehicles.js';
import { resolvePurchase, createVehicle } from './vehicles.js';
import { vehiclePrice } from './prices.js';
import { spend } from './economy.js';
import { checkMoney } from './trackRules.js';
import { notify } from './news.js';
import { dayNumber } from './date.js';

const NAG_DAYS = 30;

/**
 * Replace `v` (stopped in a depot) with a new vehicle of model `newModelId`.
 * @returns {{ok:true,vehicle:object,cost:number}|{ok:false,error:string}}
 */
export function replaceVehicle(ctx, v, newModelId, reason = 'autoreplace') {
  const { state } = ctx;
  const depot = state.depots.find((d) => d.id === v.depotId);
  if (!depot) return { ok: false, error: 'No depot' };
  const spec = {
    modelId: newModelId,
    wagonModelId: v.wagonModelId || undefined,
    wagons: v.wagons || 0,
    cargoId: v.cargoId || undefined,
  };
  // road vehicles keep their cargo when the new model carries it; otherwise the model's default cargo
  if (v.kind === 'road' && MODEL_BY_ID[newModelId] && !MODEL_BY_ID[newModelId].cargos.includes(v.cargoId)) spec.cargoId = undefined;
  const r = resolvePurchase(depot, spec, state.date.year);
  if (!r.ok) return { ok: false, error: r.error };
  const price = vehiclePrice(state, r.cost);
  const diff = price - (v.value || 0);
  if (checkMoney(state, diff)) {
    const last = v.autoreplaceNagDay;
    if (last == null || dayNumber(state.date) - last >= NAG_DAYS) {
      v.autoreplaceNagDay = dayNumber(state.date);
      notify(ctx, `${v.name} could not afford its replacement (${MODEL_BY_ID[newModelId].name}).`, 'bad', v.tx, v.ty);
    }
    return { ok: false, error: 'Cannot afford' };
  }
  const idx = state.vehicles.indexOf(v);
  if (idx < 0) return { ok: false, error: 'Unknown vehicle' };
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
  const oldName = MODEL_BY_ID[v.modelId] ? MODEL_BY_ID[v.modelId].name : v.modelId;
  const msg = reason === 'autorenew'
    ? `${v.name} was renewed (autorenew, ${oldName}).`
    : `${v.name} was replaced (${oldName} -> ${MODEL_BY_ID[newModelId].name}).`;
  notify(ctx, msg, 'info', v.tx, v.ty);
  return { ok: true, vehicle: nv, cost: diff };
}

/**
 * Hook for a vehicle stopped in a depot (loco/vehicle.js vehicleDaily). Applies the company's autoreplace rule
 * for its model first, else autorenew (setting, past max age).
 * @returns {object|null} the new vehicle, or null when nothing happened
 */
export function autorenewVehicle(ctx, v) {
  const { state } = ctx;
  if (v.state !== 'depot') return null;
  const rules = state.company && state.company.autoreplace;
  const target = rules && rules[v.modelId];
  if (target && MODEL_BY_ID[target] && target !== v.modelId) {
    const r = replaceVehicle(ctx, v, target, 'autoreplace');
    if (r.ok) return r.vehicle;
  }
  if (!getSetting(state, 'autorenew') || !(v.age > v.maxAge)) return null;
  const r = replaceVehicle(ctx, v, v.modelId, 'autorenew');
  return r.ok ? r.vehicle : null;
}
