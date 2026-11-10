/**
 * Ported from OpenLoco (MIT), src/World/Station.cpp: Station::updateCargo (0x00492793),
 * Station::calculateCargoRating (0x004927F6), Station::tick/updateCargoAcceptance (0x00492640).
 *
 * Mapping to the transit-tycoon station record (js/simulation/stations.js):
 *  - OpenLoco keeps the rating on a 0..200 scale (UI shows rating/2 %). We keep that scale internally in
 *    st.rating200[cargoId] and publish the 0..100 % value in st.rating[cargoId] (what UI/cargo.js read).
 *  - StationCargoStats.age -> st.cargoAge[cargoId] (days since the last pickup; clamped to the loading
 *    vehicle's type value at pickup by clampCargoAgeOnPickup, called from orders.js loadSlice).
 *  - vehicleSpeed / vehicleAge -> st.carrier[cargoId] (km/h, 256-day units): the last carrier's max speed and age,
 *    averaged (old+new)>>1 over pickups (VehicleHead.cpp:3466-3478, see stations.js recordCarrier).
 *  - quantity -> sum of packet amounts (waitingAmount); decay removes cargo via takeWaiting.
 *  - StationManager::updateDaily's company/town rating bonus is not here: it lives in loco/townManager.js
 *    updateDaily (st.rating200 >= 100 -> town.ratingAdjusted -> adjustCompanyRating(town, 1), lines ~54-67).
 *  - Not ported (no TT counterpart): noTilesTimeout (TT deletes empty stations at once), cargo density/
 *    viewport, station flags 7/8 (player always owns stations), statue/HQ bonus (not part of this OpenLoco
 *    version's cargo rating).
 */
import { waitingAmount, takeWaiting, recomputeAcceptance } from '../stations.js';
import { stationRatingFixed } from '../cheats.js';
import { notify } from '../news.js';
import { CARGO_BY_ID } from '../../config/cargos.js';
import { advertBonus } from '../townAuthority.js';

export const MIN_CARGO_RATING = 0;
export const MAX_CARGO_RATING = 200;
export const INITIAL_CARGO_RATING = 150;
const MAX_SPEED_MPH = 250;
const KMH_TO_MPH = 0.621371;
/** VehicleHead.cpp typeAgeMap {train 0, bus 5, truck 3, tram 2, aircraft 0, ship 0}. */
export const TYPE_AGE = { rail: 0, bus: 5, truck: 3, tram: 2, aircraft: 0, ship: 0 };

/**
 * Station::calculateCargoRating. `c` = { age, quantity, vehicleSpeed(mph), vehicleAge, npc? }.
 * npc: station owned by an AI rival (Station.cpp:790-793): rating is forced to 120 after the quantity terms
 * and before the speed/vehicle-age terms. The player's stations (npc false) are unaffected.
 */
/**
 * OL Station.cpp:790 override gate: a non-player station has its cargo rating forced to 120 only while it has
 * neither StationFlags::flag_7 (cargo picked up here, VehicleHead.cpp:3464) nor flag_8 (cargo delivered here,
 * VehicleHead.cpp:3134). Lazy TT flags: st.pickedUp / st.delivered, absent until set (old saves = override active).
 */
export function rivalRatingOverride(st) {
  return st.ownerId != null && !st.pickedUp && !st.delivered;
}

export function calculateCargoRating(c) {
  let rating = 0;
  if (c.age <= 7) rating += 165;
  else if (c.age <= 15) rating += 130;
  else if (c.age <= 30) rating += 85;
  else if (c.age <= 45) rating += 40;

  rating -= 130;
  if (c.quantity <= 100) rating += 130;
  else if (c.quantity <= 200) rating += 110;
  else if (c.quantity <= 300) rating += 90;
  else if (c.quantity <= 500) rating += 60;
  else if (c.quantity <= 1000) rating += 30;

  if (c.npc) rating = 120;

  const speed = Math.min(c.vehicleSpeed, MAX_SPEED_MPH);
  if (speed > 35) rating += Math.trunc((speed - 35) / 4);

  if (c.vehicleAge < 1) rating += 33;
  else if (c.vehicleAge < 2) rating += 20;
  else if (c.vehicleAge < 4) rating += 10;
  return Math.max(MIN_CARGO_RATING, Math.min(MAX_CARGO_RATING, rating));
}

/**
 * UI-only: the rating components of calculateCargoRating for context `c` (same inputs), as ordered steps.
 * Does not change the simulation: calculateCargoRating stays the hot-path authority and is unchanged.
 * Each step = { key, label, delta, running } where running is the sum after the step (before clamping).
 * @returns {{steps:Array<{key:string,label:string,delta:number,running:number}>, total:number}}
 */
export function cargoRatingBreakdown(c) {
  const steps = [];
  let running = 0;
  const add = (key, label, delta) => { running += delta; steps.push({ key, label, delta, running }); };
  const age = c.age;
  const ageTerm = age <= 7 ? 165 : age <= 15 ? 130 : age <= 30 ? 85 : age <= 45 ? 40 : 0;
  add('age', `Days since last pickup: ${age}`, ageTerm);
  add('base', 'Base', -130);
  const q = c.quantity;
  const qTerm = q <= 100 ? 130 : q <= 200 ? 110 : q <= 300 ? 90 : q <= 500 ? 60 : q <= 1000 ? 30 : 0;
  add('waiting', `Waiting cargo: ${q}`, qTerm);
  if (c.npc) add('npc', 'AI-owned station: rating forced to 120', 120 - running);
  const speed = Math.min(c.vehicleSpeed, MAX_SPEED_MPH);
  const sTerm = speed > 35 ? Math.trunc((speed - 35) / 4) : 0;
  add('speed', `Max speed of last vehicle: ${Math.round(c.vehicleSpeed)} mph`, sTerm);
  const va = c.vehicleAge;
  const vTerm = va < 1 ? 33 : va < 2 ? 20 : va < 4 ? 10 : 0;
  add('vehicleAge', `Average vehicle age: ${va} yr`, vTerm);
  return { steps, total: Math.max(MIN_CARGO_RATING, Math.min(MAX_CARGO_RATING, running)) };
}

/**
 * UI-only: live inputs for cargoRatingBreakdown at station `st` (what updateCargo feeds calculateCargoRating),
 * plus the published rating. The breakdown is the rating target for the next daily step.
 */
export function stationCargoRatingDetail(state, st, cargoId) {
  const age = (st.cargoAge && st.cargoAge[cargoId]) || 0;
  const quantity = waitingAmount(st, cargoId);
  const bd = cargoRatingBreakdown({
    age, quantity,
    vehicleSpeed: carrierStats(st, cargoId).speed * KMH_TO_MPH,
    vehicleAge: carrierStats(st, cargoId).age,
    npc: rivalRatingOverride(st),
  });
  const cur200 = st.rating200 && st.rating200[cargoId] !== undefined ? st.rating200[cargoId] : null;
  return { ...bd, age, quantity, current: st.rating ? st.rating[cargoId] : undefined, current200: cur200 };
}

/**
 * Carrier stats of the last vehicle that picked up cargoId here (OpenLoco StationCargoStats vehicleSpeed/vehicleAge,
 * averaged over pickups by stations.js recordCarrier). Returns {speed (km/h), age (256-day units)}.
 * Old saves (no st.carrier record yet): speed falls back to the last pickup speed, age to 0 (new vehicle).
 */
function carrierStats(st, cargoId) {
  const c = st.carrier && st.carrier[cargoId];
  if (c) return c;
  return { speed: st.lastSpeed || 0, age: 0 };
}

/**
 * VehicleHead.cpp:3460-3461: when a vehicle loads cargo, stationCargo.age = min(age, typeAgeMap[vehicleType]).
 * Called by orders.js loadSlice at pickup time (after the room check, before the transfer), with the
 * loading vehicle's type (TYPE_AGE key). Lazy: no-op when the cargo has no age record yet (it starts at 0).
 */
export function clampCargoAgeOnPickup(st, cargoId, type) {
  const ages = st.cargoAge;
  if (!ages || ages[cargoId] === undefined) return;
  const cap = TYPE_AGE[type] || 0;
  if (ages[cargoId] > cap) ages[cargoId] = cap;
}

/**
 * Station::updateCargo, run once per day.
 * @returns {boolean} true if at least one cargo has a good (>=100/200) rating
 */
export function updateCargo(game, st) {
  const { state, rng } = game;
  let good = false;
  const stationRatingCheat = stationRatingFixed(state) && !(st.ownerId !== undefined && st.ownerId !== null); // cheats.js: player stations only
  st.rating200 = st.rating200 || {};
  st.cargoAge = st.cargoAge || {};
  // OpenLoco Station::updateCargo loops every cargo slot that is not empty. Transfer-only cargo (unloaded by
  // transferUnits, never picked up here) has no lastPickup entry, so also rate cargo with waiting units.
  // Daily loop only; lastPickup cargo first (unchanged order), then transfer-only cargo.
  const cargoIds = Object.keys(st.lastPickup);
  for (const k of Object.keys(st.cargo)) {
    if (st.lastPickup[k] === undefined && waitingAmount(st, k) > 0) cargoIds.push(k);
  }
  for (const cargoId of cargoIds) {
    if (st.rating200[cargoId] === undefined) {
      // legacy saves store only the % rating
      st.rating200[cargoId] = st.rating[cargoId] !== undefined ? st.rating[cargoId] * 2 : INITIAL_CARGO_RATING;
    }
    if (st.cargoAge[cargoId] === undefined) st.cargoAge[cargoId] = 0;
    st.cargoAge[cargoId] = Math.min(st.cargoAge[cargoId] + 1, 255);
    let quantity = waitingAmount(st, cargoId);
    const base = calculateCargoRating({
      age: st.cargoAge[cargoId], quantity,
      vehicleSpeed: carrierStats(st, cargoId).speed * KMH_TO_MPH,
      vehicleAge: carrierStats(st, cargoId).age,
      npc: rivalRatingOverride(st),
    });
    // town advertising campaign (townAuthority.js): +N % points while active = +2N on the 0..200 scale
    const adBoost = 2 * advertBonus(state, st);
    const target = adBoost ? Math.min(MAX_CARGO_RATING, base + adBoost) : base;
    const delta = Math.max(-2, Math.min(2, target - st.rating200[cargoId]));
    let r = (st.rating200[cargoId] += delta);
    if (stationRatingCheat) r = st.rating200[cargoId] = MAX_CARGO_RATING; // OpenTTD station_rating cheat (station_cmd.cpp:4016)

    if (r <= 50) {
      if (quantity >= 400) { takeWaiting(st, cargoId, rng.int(1, 32)); quantity = waitingAmount(st, cargoId); }
      else if (quantity >= 200) { takeWaiting(st, cargoId, rng.int(1, 8)); quantity = waitingAmount(st, cargoId); }
    }
    if (r >= 100) good = true;
    if (r <= 100 && quantity !== 0) {
      if (r <= rng.int(0, 127)) takeWaiting(st, cargoId, rng.int(1, 4));
    }
    st.rating[cargoId] = Math.round(st.rating200[cargoId] / 2);
  }
  return good;
}

/** Station::tick -> updateCargoAcceptance. */
export function tickStation(game, st) {
  const before = st.accepts || {};
  recomputeAcceptance(game.state, st);
  alertCargoAcceptanceChange(game, st, before);
}

/**
 * OL Station::alertCargoAcceptanceChange (Station.cpp:225-262, msgs 401/402): news when a cargo flips acceptance at a
 * player station. Category 'acceptance' so the player can mute it. Only the player's stations (rivals are silent).
 */
function alertCargoAcceptanceChange(game, st, before) {
  if (st.ownerId != null) return;
  const after = st.accepts || {};
  for (const c of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = !!before[c], now = !!after[c];
    if (was === now) continue;
    const name = CARGO_BY_ID[c]?.name || c;
    notify(game.ctx, now ? `${st.name} now accepts ${name}` : `${st.name} no longer accepts ${name}`,
      'info', st.x, st.y, 'acceptance');
  }
}
