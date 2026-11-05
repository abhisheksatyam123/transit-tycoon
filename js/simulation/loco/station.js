/**
 * Ported from OpenLoco (MIT), src/World/Station.cpp: Station::updateCargo (0x00492793),
 * Station::calculateCargoRating (0x004927F6), Station::tick/updateCargoAcceptance (0x00492640).
 *
 * Mapping to the transit-tycoon station record (js/simulation/stations.js):
 *  - OpenLoco keeps the rating on a 0..200 scale (UI shows rating/2 %). We keep that scale internally in
 *    st.rating200[cargoId] and publish the 0..100 % value in st.rating[cargoId] (what UI/cargo.js read).
 *  - StationCargoStats.age -> st.cargoAge[cargoId] (days since the last pickup; reset to the vehicle-type
 *    value on pickup, detected through st.lastPickup[cargoId] which orders.js/markPickup updates).
 *  - vehicleSpeed -> st.lastSpeed (km/h, converted to mph); vehicleAge -> avg age of vehicles that load the cargo
 *    here, in 256-day units (OpenLoco: (today - creationDay) / 256).
 *  - quantity -> sum of packet amounts (waitingAmount); decay removes cargo via takeWaiting.
 *  - Not ported (no TT counterpart): company/town rating bonus, noTilesTimeout (TT deletes empty stations
 *    at once), cargo density/ viewport, station flags 7/8 (player always owns stations), statue/HQ bonus
 *    (not part of this OpenLoco version's cargo rating).
 */
import { waitingAmount, takeWaiting, recomputeAcceptance } from '../stations.js';

export const MIN_CARGO_RATING = 0;
export const MAX_CARGO_RATING = 200;
export const INITIAL_CARGO_RATING = 150;
const MAX_SPEED_MPH = 250;
const KMH_TO_MPH = 0.621371;
/** VehicleHead.cpp typeAgeMap {train 0, bus 5, truck 3, tram 2, aircraft 0, ship 0}. */
const TYPE_AGE = { rail: 0, bus: 5, truck: 3 };

/** Station::calculateCargoRating. `c` = { age, quantity, vehicleSpeed(mph), vehicleAge }. */
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

  const speed = Math.min(c.vehicleSpeed, MAX_SPEED_MPH);
  if (speed > 35) rating += Math.trunc((speed - 35) / 4);

  if (c.vehicleAge < 1) rating += 33;
  else if (c.vehicleAge < 2) rating += 20;
  else if (c.vehicleAge < 4) rating += 10;
  return Math.max(MIN_CARGO_RATING, Math.min(MAX_CARGO_RATING, rating));
}

/** Average age (256-day units) of vehicles whose orders visit st and that carry cargoId. */
function vehicleAgeFactor(state, st, cargoId) {
  let sum = 0, n = 0;
  for (const v of state.vehicles) {
    if (v.cargoId !== cargoId || !v.orders || !v.orders.some((o) => o.stationId === st.id)) continue;
    sum += Math.min(255, Math.floor((v.age || 0) / 256)); n++;
  }
  return n ? Math.floor(sum / n) : 0;
}

function typeAge(state, st) {
  return st.kinds.rail ? TYPE_AGE.rail : st.kinds.truck ? TYPE_AGE.truck : st.kinds.bus ? TYPE_AGE.bus : 0;
}

/**
 * Station::updateCargo, run once per day.
 * @returns {boolean} true if at least one cargo has a good (>=100/200) rating
 */
export function updateCargo(game, st) {
  const { state, rng } = game;
  let good = false;
  st.rating200 = st.rating200 || {};
  st.cargoAge = st.cargoAge || {};
  st.pickupSeen = st.pickupSeen || {};
  for (const cargoId of Object.keys(st.lastPickup)) {
    if (st.rating200[cargoId] === undefined) {
      // legacy saves store only the % rating
      st.rating200[cargoId] = st.rating[cargoId] !== undefined ? st.rating[cargoId] * 2 : INITIAL_CARGO_RATING;
    }
    if (st.cargoAge[cargoId] === undefined) st.cargoAge[cargoId] = 0;
    // pickup since last day -> age reset (VehicleHead: age = min(age, typeAgeMap[type]))
    if (st.pickupSeen[cargoId] !== st.lastPickup[cargoId]) {
      st.pickupSeen[cargoId] = st.lastPickup[cargoId];
      st.cargoAge[cargoId] = Math.min(st.cargoAge[cargoId], typeAge(state, st));
    }
    st.cargoAge[cargoId] = Math.min(st.cargoAge[cargoId] + 1, 255);
    let quantity = waitingAmount(st, cargoId);
    const target = calculateCargoRating({
      age: st.cargoAge[cargoId], quantity,
      vehicleSpeed: (st.lastSpeed || 0) * KMH_TO_MPH,
      vehicleAge: vehicleAgeFactor(state, st, cargoId),
    });
    const delta = Math.max(-2, Math.min(2, target - st.rating200[cargoId]));
    let r = (st.rating200[cargoId] += delta);

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
  recomputeAcceptance(game.state, st);
}
