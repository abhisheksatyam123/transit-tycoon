/**
 * AI rival fleet renewal (OpenTTD AI behaviour: an AI renews vehicles past their max age and replaces models
 * that are no longer offered). Called monthly for each rival (aiCompanies.updateMonthly).
 *
 * A rival vehicle is renewed when it is past its max age, or its model is obsolete (no longer purchasable).
 * The replacement is the best model of the same kind that is available now (same cargo for road vehicles;
 * for aircraft, a plane the depot's airport type accepts and the same helicopter/plane class). Stopped in a
 * depot it is replaced at once (replaceVehicle keeps name, orders and route; the new vehicle stays the rival's).
 * Running, it is sent to the nearest depot (sendToDepot, owner-checked) and replaced there on the next monthly
 * pass. Trains: the engine is renewed with the fastest non-electric one on sale; the wagons stay (replaceVehicle).
 * Nothing draws from the rng (determinism): candidates are chosen by capacity, then id.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { listModels } from './queries.js';
import { getSetting } from './settings.js';
import { replaceVehicle } from './autorenew.js';
import { sendToDepot, startVehicle } from './cmdVehicle.js';
import { purchasable, isVehicleOld } from './vehicles.js';
import { vehiclePrice } from './prices.js';
import { airportTypeId, vehicleFitsAirport } from './airportTypes.js';
import { findDepot } from './state.js';
import { railEngineModel } from './aiRail.js';

/** The best model a rival may renew this vehicle with now (null when none). */
export function renewalModel(state, v, ownerId = null) {
  const cur = MODEL_BY_ID[v.modelId];
  if (!cur) return null;
  if (v.kind === 'train') return trainRenewalModel(state, cur, ownerId);
  const kind = v.kind === 'road' ? cur.kind : v.kind === 'aircraft' ? 'aircraft' : null;
  if (!kind || kind === 'engine' || kind === 'wagon') return null;
  let models = listModels(state, kind, ownerId);
  if (v.kind === 'aircraft') {
    const depot = findDepot(state, v.depotId);
    const typeId = depot ? airportTypeId(depot) : 'small';
    models = models.filter((m) => !!m.helicopter === !!cur.helicopter && vehicleFitsAirport(m, typeId));
  } else if (v.cargoId) {
    models = models.filter((m) => m.cargos && m.cargos.includes(v.cargoId));
  }
  models.sort((a, b) => b.capacity - a.capacity || (a.id < b.id ? -1 : 1));
  return models[0] || null;
}

/**
 * Train renewal: the fastest non-electric engine on sale (railEngineModel, the rival's own choice). The wagons
 * are kept by replaceVehicle (same consist). Returns the engine or null.
 */
function trainRenewalModel(state, cur, ownerId = null) {
  if (cur.kind !== 'engine') return null;
  return railEngineModel(state, ownerId);
}

/** Renew this rival's old or obsolete vehicles (see file comment). */
export function renewRivalFleet(ctx, r) {
  const { state } = ctx;
  const year = state.date.year;
  for (const v of state.vehicles.filter((x) => x.ownerId === r.id)) {
    const cur = MODEL_BY_ID[v.modelId];
    if (!cur) continue;
    const old = isVehicleOld(state, v); // effective max age, like the player's autorenew (extendVehicleLife)
    if (!old && purchasable(cur, year, getSetting(state, 'neverExpireVehicles'))) continue;
    const target = renewalModel(state, v, r.id);
    if (!target) continue;
    const cost = vehiclePrice(state, target.cost);
    if (r.money < cost) continue; // cannot pay the price difference yet: try again next month
    if (v.state === 'depot') {
      const res = replaceVehicle(ctx, v, target.id, 'autorenew', {});
      if (res.ok) continue;
      startVehicle(ctx, v.id, { owner: r.id }); // could not replace: back on its orders (no idle parked plane)
    } else if (v.goingToDepot == null) {
      sendToDepot(ctx, v.id, { owner: r.id });
    }
  }
}
