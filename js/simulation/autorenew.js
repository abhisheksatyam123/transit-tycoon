/**
 * Autoreplace / autorenew (OpenTTD autoreplace_cmd.cpp, simplified).
 *
 * A vehicle stopped in a depot is replaced by a new vehicle when:
 *  1. a vehicle group rule or the company has an autoreplace rule for its model (state.company.groupAutoreplace /
 *     state.company.autoreplace, see autoreplace.js), any age (or only when old if that rule says so); or
 *  2. setting `autorenew` is on and the vehicle is past its max age (same model).
 * The new vehicle keeps name, unit number, orders, shared order group, service interval, profit history, and for
 * trains the wagons, for road vehicles the cargo. The company pays the new price minus the resale value of the old
 * vehicle. Unaffordable replacements are skipped (news, at most once a month per vehicle).
 */
import { getSetting } from './settings.js';
import { MODEL_BY_ID } from '../config/vehicles.js';
import { resolvePurchase, createVehicle, effectiveMaxAge, isVehicleOld } from './vehicles.js';
import { isReplaceWhenOldFor, autoreplaceTarget, groupProtectBlocksAll } from './autoreplace.js';
import { vehiclePrice } from './prices.js';
import { spend } from './economy.js';
import { checkMoney } from './trackRules.js';
import { companyOf, companyById, stampOwner } from './owner.js';
import { notify } from './news.js';
import { dayNumber } from './date.js';

const NAG_DAYS = 30;

/**
 * OpenTTD company.engine_renew_months (def 6; vehicle.cpp NeedsAutorenewing: age - max_age < months*30 is not old enough).
 * TT default 0 = renew exactly when past max age (current). Returns extra days past max age before renewal.
 */
function renewDelayDays(state) {
  return (Number(getSetting(state, 'engineRenewMonths')) || 0) * 30;
}

/**
 * Replace `v` (stopped in a depot) with a new vehicle of model `newModelId`.
 * @returns {{ok:true,vehicle:object,cost:number}|{ok:false,error:string}}
 */
/** Fields a replacement takes from its own model / purchase (everything else moves over when keepRoute). */
const OWN_FIELDS = new Set(['id', 'name', 'unitNumber', 'kind', 'roadType', 'modelId', 'wagonModelId', 'wagons',
  'cargoId', 'capacity', 'maxSpeed', 'runningCost', 'value', 'age', 'maxAge', 'reliability', 'baseReliability',
  'breakdownTicks', 'depotId', 'orders', 'orderIndex', 'orderGroup', 'profitThisYear', 'profitLastYear', 'alt']);

/**
 * Replacement model for one wagon under the current group/company rules, or undefined when no rule applies.
 * Mirrors the engine lookup: `autoreplaceTarget` gives the group rule precedence and honours replace protection;
 * the same when-old gate and the per-wagon cargo check as `resolveMixed` (vehicles.js) are applied here. Player
 * trains only: a rival's replacement must not read the player's rule table.
 */
function wagonRuleTarget(state, v, wagonModelId, cargoId) {
  if (v.kind !== 'train' || v.ownerId != null || !wagonModelId) return undefined;
  const to = autoreplaceTarget(state, v, wagonModelId);
  if (!to || to === wagonModelId) return undefined;
  const model = MODEL_BY_ID[to];
  if (!model || model.kind !== 'wagon') return undefined;
  if (cargoId && !model.cargos.includes(cargoId)) return undefined;
  if (isReplaceWhenOldFor(state, v, wagonModelId) && !isVehicleOld(state, v)) return undefined;
  return to;
}

/** Does any wagon of `v` (uniform model, or each mixed-consist wagon) have an applicable replacement rule? */
function wagonRuleApplies(state, v) {
  if (v.consist && v.consist.length) return v.consist.some((w) => wagonRuleTarget(state, v, w.modelId, w.cargoId) !== undefined);
  return wagonRuleTarget(state, v, v.wagonModelId, v.cargoId) !== undefined;
}

export function replaceVehicle(ctx, v, newModelId, reason = 'autoreplace', opts = {}) {
  const { state } = ctx;
  // keepRoute: a vehicle on a service visit to a depot (not stopped in it) is replaced in its current position
  const depot = state.depots.find((d) => d.id === (opts.keepRoute ? v.goingToDepot : v.depotId));
  if (!depot) return { ok: false, error: 'No depot' };
  // Wagon-kind autoreplace (opt-in): map the plain train's wagon model through its group/company rule when one is
  // set, and (D5) remap every wagon of a mixed consist the same way. The count and each wagon's cargo stay the same;
  // with no rule this is exactly the old wagon fields. Applies to the player's trains only (rival AI replacements
  // must not read the player's rule table). Protect/when-old semantics live inside wagonRuleTarget.
  const remapWagon = wagonRuleTarget(state, v, v.wagonModelId, v.cargoId);
  const consist = v.consist ? v.consist.map((w) => ({ ...w })) : undefined;
  if (consist) {
    for (const w of consist) w.modelId = wagonRuleTarget(state, v, w.modelId, w.cargoId) || w.modelId;
  }
  const spec = {
    modelId: newModelId,
    wagonModelId: (remapWagon || v.wagonModelId) || undefined,
    wagons: v.wagons || 0,
    cargoId: v.cargoId || undefined,
    consist,
  };
  // road vehicles keep their cargo when the new model carries it; otherwise the model's default cargo
  if (v.kind === 'road' && MODEL_BY_ID[newModelId] && !MODEL_BY_ID[newModelId].cargos.includes(v.cargoId)) spec.cargoId = undefined;
  // A wagon-only rule keeps the engine, so an out-of-production engine may still be rebuilt (the wagon models have no
  // obsolete year); same-model autorenew keeps the old purchasable check.
  const neverExpire = getSetting(state, 'neverExpireVehicles')
    || (reason === 'autoreplace' && newModelId === v.modelId && v.kind === 'train');
  const r = resolvePurchase(depot, spec, state.date.year, neverExpire, getSetting(state, 'maxTrainWagons'));
  if (!r.ok) return { ok: false, error: r.error };
  const price = vehiclePrice(state, r.cost);
  const diff = price - (v.value || 0);
  // OpenTTD company.engine_renew_money (def 100000; vehicle.cpp NeedsServicing): the company must hold this much. TT default 0 = off (current)
  const renewMoney = Number(getSetting(state, 'engineRenewMoney')) || 0;
  if (checkMoney(state, diff, companyOf(state, v)) || (renewMoney > 0 && checkMoney(state, renewMoney, companyOf(state, v)))) {
    const last = v.autoreplaceNagDay;
    if (last == null || dayNumber(state.date) - last >= NAG_DAYS) {
      v.autoreplaceNagDay = dayNumber(state.date);
      notify(ctx, `${v.name} could not afford its replacement (${MODEL_BY_ID[newModelId].name}).`, 'bad', v.tx, v.ty, 'advice');
    }
    return { ok: false, error: 'Cannot afford' };
  }
  const idx = state.vehicles.indexOf(v);
  if (idx < 0) return { ok: false, error: 'Unknown vehicle' };
  const nv = createVehicle(state, depot, r.template, price);
  state.vehicles.pop(); // createVehicle appends; put the new one in the old slot (keeps the caller's loop stable)
  state.vehicles[idx] = nv;
  // a rival's replacement stays the rival's (owner stamp and its vehicle list); the player's stays untagged
  if (v.ownerId != null) {
    stampOwner(state, nv, v.ownerId);
    const rv = companyById(state, v.ownerId);
    if (rv) rv.vehicles = rv.vehicles.map((id) => (id === v.id ? nv.id : id));
  }
  nv.name = v.name;
  nv.unitNumber = v.unitNumber;
  nv.orders = v.orders.map((o) => ({ ...o }));
  nv.orderIndex = v.orderIndex || 0;
  if (v.orderGroup != null) nv.orderGroup = v.orderGroup;
  if (v.groupId != null) nv.groupId = v.groupId; // the replacement stays in the vehicle group
  if (v.serviceIntervalDays) { nv.serviceIntervalDays = v.serviceIntervalDays; nv.lastServiceDay = v.lastServiceDay; }
  nv.profitThisYear = v.profitThisYear || 0;
  nv.profitLastYear = v.profitLastYear || 0;
  if (opts.keepRoute) {
    // the replacement continues the old vehicle's route: position, path, state, load and timetable carry over
    for (const k of Object.keys(v)) if (!OWN_FIELDS.has(k)) nv[k] = v[k];
    nv.depotId = v.depotId;
    if (v.alt !== undefined) nv.alt = v.alt;
    // the load stays only when the replacement carries the same cargo, capped at its capacity
    if (v.load) {
      nv.load = { ...v.load };
      if (nv.cargoId !== v.cargoId || JSON.stringify(nv.consist || null) !== JSON.stringify(v.consist || null)) nv.load.amount = 0;
      else if (nv.load.amount > nv.capacity) nv.load.amount = nv.capacity;
    }
  }
  // only the difference is paid; the resale value of the old vehicle is credited inside it
  spend(companyOf(state, v), 'vehicles', diff);
  const oldName = MODEL_BY_ID[v.modelId] ? MODEL_BY_ID[v.modelId].name : v.modelId;
  const msg = reason === 'autorenew'
    ? `${v.name} was renewed (autorenew, ${oldName}).`
    : newModelId === v.modelId
      ? `${v.name}'s wagons were replaced (${oldName}).`
      : `${v.name} was replaced (${oldName} -> ${MODEL_BY_ID[newModelId].name}).`;
  notify(ctx, msg, 'info', v.tx, v.ty, 'advice');
  return { ok: true, vehicle: nv, cost: diff };
}

/**
 * Hook for a vehicle stopped in a depot (loco/vehicle.js vehicleDaily), or on an automatic service visit to a depot
 * (opts.serviceVisit, movement.js serviceAtDepot: the replacement keeps the route). Applies the company's autoreplace
 * rule for its model first, else autorenew (setting, past max age).
 * @returns {object|null} the new vehicle, or null when nothing happened
 */
export function autorenewVehicle(ctx, v, opts = {}) {
  const { state } = ctx;
  // Default TT semantics: a protected group blocks everything. With the OpenTTD opt-in only the company rule is
  // blocked (inside autoreplaceTarget), so the group's own rule and autorenew still run.
  if (groupProtectBlocksAll(state, v)) return null;
  if (v.state !== 'depot' && !opts.serviceVisit) return null;
  const ro = { keepRoute: !!opts.serviceVisit };
  const target = autoreplaceTarget(state, v);
  // replace-when-old rules (autoreplace.js) wait until the vehicle is old; default rules replace at any age
  if (target && MODEL_BY_ID[target] && target !== v.modelId && (!isReplaceWhenOldFor(state, v, v.modelId) || isVehicleOld(state, v))) {
    const r = replaceVehicle(ctx, v, target, 'autoreplace', ro);
    if (r.ok) return r.vehicle;
  } else if (wagonRuleApplies(state, v)) {
    // D4: no engine rule (or it is waiting for old age), but a wagon rule applies: keep the engine, replace the wagons.
    const r = replaceVehicle(ctx, v, v.modelId, 'autoreplace', ro);
    if (r.ok) return r.vehicle;
  }
  if (!getSetting(state, 'autorenew') || !(v.age > effectiveMaxAge(state, v) + renewDelayDays(state))) return null;
  const r = replaceVehicle(ctx, v, v.modelId, 'autorenew', ro);
  return r.ok ? r.vehicle : null;
}

/** Is `v` eligible for mass autoreplace (rule for its model, or autorenew past max age)? */
export function isAutoreplaceEligible(state, v) {
  if (groupProtectBlocksAll(state, v)) return false;
  const target = autoreplaceTarget(state, v);
  if (target && MODEL_BY_ID[target] && target!==v.modelId
    && (!isReplaceWhenOldFor(state, v, v.modelId) || isVehicleOld(state, v))) return true;
  if (wagonRuleApplies(state, v)) return true;
  return !!getSetting(state,'autorenew') && v.age>effectiveMaxAge(state, v) + renewDelayDays(state);
}
/**
 * Mass autoreplace for a depot: apply autorenewVehicle to every eligible vehicle stopped inside it.
 * Non-eligible (and unaffordable / failed) vehicles are skipped silently (aside from the usual news nag).
 * @returns {{ok:true,replaced:number,skipped:number,cost:number}}
 */
export function massAutoreplace(ctx, depotId, opts={}) {
  const {state}=ctx;
  if (!state.depots.find((d)=>d.id===depotId)) return {ok:false,error:'No depot'};
  const ids=state.vehicles.filter((v)=>v.depotId===depotId&&v.state==='depot').map((v)=>v.id);
  let replaced=0,skipped=0,cost=0;
  for (const id of ids) {
    const v=state.vehicles.find((x)=>x.id===id);
    if (!v||v.state!=='depot'||!isAutoreplaceEligible(state,v)) {skipped++;continue;}
    const before=v.value||0;
    const nv=autorenewVehicle(ctx,v);
    if (nv) {replaced++; cost+=Math.max(0,(nv.value||0)-before);} else skipped++;
  }
  return {ok:true,replaced,skipped,cost};
}
