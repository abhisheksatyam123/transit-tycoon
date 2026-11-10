/**
 * Industry record logic. Ported from OpenLoco (MIT), src/World/Industry.cpp
 * (Industry::updateDaily, updateMonthly, isMonthlyProduction{Up,Down,Closing}, updateProducedCargoStats)
 * and StationManager::deliverCargoToStations (src/World/StationManager.cpp).
 *
 * Mapping from OpenLoco IndustryObject to js/config/industries.js:
 *  producedCargoType[0..1] = type.produces[0..1]; requiredCargoType[0..2] = type.accepts[0..2];
 *  requiresAllCargo = false (every processor sums its inputs); canIncrease/DecreaseProduction = primary industries
 *  (no accepts); monthlyClosureChance/designedYear/obsoleteYear = type.* (see config).
 * Units: OpenLoco counts daily production in 1/8 cargo units against an 8-unit send threshold; here
 *  dailyProduction and outputBuffer are in eighths of a unit (a coal mine's 110/month ~ 29 per day), the initial target is
 *  derived from the old monthly `production` figure, so balance matches the pre-port game.
 *  Station ratings are 0..100 here and scaled to OpenLoco's 0..255 for the share formula.
 * Deviations: farm tile loop (Industry::tick) is omitted: productionRate is 255 (fields not simulated);
 *  per-industry PRNG is replaced by game.rng; monthly history graphs are not kept.
 */
import { INDUSTRY_BY_ID, CONVERSION_RATIO } from '../../config/industries.js';
import { addWaiting } from '../stations.js';

/**
 * Station cargo rating on OpenLoco's 0..200 scale (StationCargoStats.rating, used raw by
 * StationManager::deliverCargoToStations and the industry stats ranking). Legacy saves only have the 0..100 %
 * value (st.rating = rating200 / 2); a station with no rating yet uses the initial 150.
 */
function stationRating200(st, cargo) {
  if (st.rating200 && st.rating200[cargo] !== undefined) return st.rating200[cargo];
  if (st.rating[cargo] !== undefined) return st.rating[cargo] * 2;
  return 150;
}
import { findStation } from '../state.js';
import { MAX_WAITING } from '../constants.js';
import { getSetting } from '../settings.js';
import { updateFarmMonthly } from '../farmFields.js';
import { recessionHalve } from '../recession.js';

/** Days per month used to turn the monthly production figure into a daily target. */
const DAYS_PER_MONTH = 30;
const MAX_STATIONS = 4;
const u16 = (v) => Math.min(v, 0xffff);

/** @param {object} type industry config @returns {string[]} produced cargo ids (max 2) */
export const producedCargos = (type) => (type.produces || []).slice(0, 2);
/** @param {object} type industry config @returns {string[]} required cargo ids (max 3) */
export const requiredCargos = (type) => (type.accepts || []).slice(0, 3);

/**
 * Initial daily production target (OpenLoco: dailyProductionTarget, 0..100+) for a type slot from its old monthly figure.
 * @param {object} type @param {number} slot @param {number} [factor] 1 = nominal
 */
export function initialTarget(type, slot, factor = 1) {
  const cargo = producedCargos(type)[slot];
  const base = cargo && type.production ? type.production[cargo] || 0 : 0;
  return Math.round((base * 8 * factor) / DAYS_PER_MONTH);
}

/**
 * Create / fill in the OpenLoco-style fields (idempotent; also upgrades old saves).
 * @param {object} ind industry record @param {object} [state] for foundingYear
 * @param {{immediate?:boolean}} [opts] immediate: already running at full output
 */
export function ensureIndustryState(ind, state, opts = {}) {
  if (ind.dailyProductionTarget) return ind;
  const type = INDUSTRY_BY_ID[ind.typeId];
  const t0 = initialTarget(type, 0), t1 = initialTarget(type, 1);
  ind.dailyProductionTarget = [t0, t1];
  ind.dailyProduction = opts.immediate === false ? [0, 0] : [t0, t1];
  ind.productionRate = 255;
  ind.outputBuffer = [0, 0];
  ind.producedMonthly = [0, 0];
  ind.deliveredMonthly = [0, 0];
  ind.producedPrev = [Math.floor(ind.dailyProduction[0] * DAYS_PER_MONTH / 8), Math.floor(ind.dailyProduction[1] * DAYS_PER_MONTH / 8)];
  ind.deliveredPrev = [0, 0];
  ind.percentTransportedPrev = [0, 0];
  ind.receivedDaily = [0, 0, 0];
  ind.receivedMonthly = [0, 0, 0];
  ind.receivedPrev = [0, 0, 0];
  ind.statsStations = [[], []];
  ind.statsRating = [[], []];
  ind.closingDown = false;
  ind.foundingYear = state && state.date ? state.date.year : 0;
  ind.producedThisMonth = ind.producedThisMonth || {};
  ind.transportedThisMonth = ind.transportedThisMonth || {};
  return ind;
}

/** Record cargo delivered by a vehicle (VehicleHead.cpp: receivedCargoQuantityDailyTotal/MonthlyTotal). */
export function receiveCargo(ind, cargoId, amount) {
  const type = INDUSTRY_BY_ID[ind.typeId];
  const i = requiredCargos(type).indexOf(cargoId);
  if (i < 0 || amount <= 0) return false;
  ensureIndustryState(ind);
  ind.receivedDaily[i] = u16(ind.receivedDaily[i] + amount);
  ind.receivedMonthly[i] = u16(ind.receivedMonthly[i] + amount);
  ind.deliveredThisMonth[cargoId] = (ind.deliveredThisMonth[cargoId] || 0) + amount;
  return true;
}

/** Industry::updateProducedCargoStats: the up-to-4 best-rated stations in range that serve each produced cargo. */
export function updateProducedCargoStats(state, ind) {
  ensureIndustryState(ind, state);
  const type = INDUSTRY_BY_ID[ind.typeId];
  const prod = producedCargos(type);
  const inRange = [];
  for (const st of state.stations) {
    if (!st.tiles || !st.tiles.length) continue;
    for (const t of st.tiles) {
      const r = t.radius ?? ({ rail: 4, bus: 3, truck: 3, airport: 6 }[t.kind] ?? 3);
      if (t.x + r >= ind.x && t.x - r <= ind.x + ind.w - 1 && t.y + r >= ind.y && t.y - r <= ind.y + ind.h - 1) { inRange.push(st); break; }
    }
  }
  for (let c = 0; c < 2; c++) {
    const stations = [null, null, null, null], ratings = [0, 0, 0, 0];
    const cargo = prod[c];
    if (cargo) {
      for (const st of inRange) {
        if (st.lastPickup[cargo] === undefined) continue; // acceptedFromProducer: a vehicle has loaded this cargo here
        const rating = stationRating200(st, cargo);
        for (let index = 0; index < MAX_STATIONS; index++) {
          if (stations[index] === null || ratings[index] <= rating) { // insertion sort, dropping the last entry
            stations.splice(index, 0, st.id); stations.pop();
            ratings.splice(index, 0, rating); ratings.pop();
            break;
          }
        }
      }
      let fraction = 0xff;
      for (let i = 0; i < MAX_STATIONS; i++) {
        ratings[i] = Math.floor((ratings[i] * fraction) / 256);
        fraction = (256 - ratings[i]) & 0xff;
      }
    }
    ind.statsStations[c] = stations.filter((s) => s !== null);
    ind.statsRating[c] = ratings;
  }
}

/**
 * StationManager::deliverCargoToStations: split quantity between stations by rating^2.
 * @returns {number} quantity actually placed in stations
 */
export function deliverCargoToStations(state, stationIds, cargoId, qty, sx, sy) {
  const found = [];
  for (const id of stationIds) {
    const st = findStation(state, id);
    if (st) found.push([st, stationRating200(st, cargoId)]);
  }
  const ratingTotal = found.reduce((a, [, r]) => a + r * r, 0);
  if (ratingTotal === 0) return 0;
  let delivered = 0;
  for (const [st, rating] of found) {
    const defaultShare = Math.floor((rating * rating * qty) / ratingTotal);
    const alternateShare = Math.floor((rating * qty) / 256);
    let share = Math.min(defaultShare, alternateShare);
    if (rating > 66) share++;
    delivered += addWaiting(st, cargoId, share, sx, sy, state.tick, MAX_WAITING); // Station::deliverCargoToStation
  }
  return Math.min(delivered, qty);
}

/** Industry::updateDaily. */
export function updateDaily(game, ind) {
  const state = game.state;
  ensureIndustryState(ind, state);
  const type = INDUSTRY_BY_ID[ind.typeId];
  const req = requiredCargos(type), prod = producedCargos(type);
  // OpenTTD economy.industry_cargo_scale (percent, def 100): scales production. 100 is the exact old path
  // (no extra rounding), so default games keep their world hash.
  const scale = Number(getSetting(state, 'industryCargoScale'));
  const scaled = (n) => (Number.isFinite(scale) && scale !== 100 ? Math.round((n * scale) / 100) : n);

  // received cargo -> output (requiresAllCargo is false: all inputs are summed)
  let amountToProduce = 0;
  for (let i = 0; i < req.length; i++) {
    amountToProduce = u16(amountToProduce + ind.receivedDaily[i]);
    ind.receivedDaily[i] = 0;
  }
  if (amountToProduce !== 0) {
    const eighths = scaled(Math.round(amountToProduce * 8 * CONVERSION_RATIO));
    for (let i = 0; i < prod.length; i++) ind.outputBuffer[i] = u16(ind.outputBuffer[i] + eighths);
  }
  for (let i = 0; i < 3; i++) ind.receivedDaily[i] -= Math.floor(u16(ind.receivedDaily[i] + 15) / 16);

  const sx = ind.x + (ind.w >> 1), sy = ind.y + (ind.h >> 1);
  for (let i = 0; i < prod.length; i++) {
    const target = Math.floor((ind.dailyProductionTarget[i] * ind.productionRate) / 256);
    if (target < ind.dailyProduction[i]) ind.dailyProduction[i]--;
    else if (target > ind.dailyProduction[i]) ind.dailyProduction[i]++;
    ind.outputBuffer[i] = u16(scaled(ind.dailyProduction[i]) + ind.outputBuffer[i]);
    if (ind.outputBuffer[i] >= 8) {
      let qty = Math.min(Math.floor(ind.outputBuffer[i] / 8), 255);
      ind.outputBuffer[i] -= qty * 8;
      qty = recessionHalve(state, qty); // economyRecessions: half the output during a recession (OpenTTD industry_cmd)
      ind.producedMonthly[i] = u16(ind.producedMonthly[i] + qty);
      const delivered = deliverCargoToStations(state, ind.statsStations[i], prod[i], qty, sx, sy);
      ind.deliveredMonthly[i] = u16(ind.deliveredMonthly[i] + delivered);
      ind.producedThisMonth[prod[i]] = ind.producedMonthly[i];
      ind.transportedThisMonth[prod[i]] = ind.deliveredMonthly[i];
    }
  }
  // UI: cargo waiting to be processed
  for (let i = 0; i < req.length; i++) ind.stock[req[i]] = ind.receivedDaily[i];
}

/** Industry::isMonthlyProductionUp. */
export function isMonthlyProductionUp(rng, ind) {
  const type = INDUSTRY_BY_ID[ind.typeId];
  if (requiredCargos(type).length) return false; // canIncreaseProduction: primary industries only
  return ind.percentTransportedPrev[0] > 70 && rng.int(0, 31) === 0
    && ind.dailyProductionTarget[0] < 100 && ind.dailyProductionTarget[1] < 100;
}

/** Industry::isMonthlyProductionDown. */
export function isMonthlyProductionDown(rng, ind) {
  const type = INDUSTRY_BY_ID[ind.typeId];
  if (requiredCargos(type).length) return false;
  const pct = ind.percentTransportedPrev[0], t = ind.dailyProductionTarget[0];
  return (pct > 50 && t > 20 && rng.int(0, 31) === 0) || (pct <= 50 && t > 10 && rng.int(0, 15) === 0);
}

/** Industry::isMonthlyProductionClosing: obsolete or random closure chance (out of 65535). */
export function isMonthlyProductionClosing(rng, state, ind) {
  const type = INDUSTRY_BY_ID[ind.typeId];
  const obsolete = type.obsoleteYear ?? 9999;
  return (state.date.year > obsolete && rng.int(0, 0xffff) < 102)
    || ((type.monthlyClosureChance || 0) !== 0 && type.monthlyClosureChance > rng.int(0, 0xffff));
}

/**
 * OpenTTD economy.type 'smooth' (ChangeIndustryProduction, industry_cmd.cpp:2943-2990), primary industries.
 * Per produced cargo: 1 in 22 chance per month to move its rate by max(10..59 % of the rate, 1); direction is up with
 * chance 1/3 when last month's transported share is <=60 %, 2/3 when <=80 %, else 5/6. Rates stay in 1..100 (TT scale).
 * The industry closes when every produced rate is at the minimum (1). No draws when the industry has no produced cargo.
 * @returns {{changed:boolean, pct:number, up:boolean, close:boolean}} pct = largest absolute rate change in percent; up = its direction
 */
export function smoothMonthlyChange(rng, ind, type) {
  const prod = producedCargos(type);
  const out = { changed: false, pct: 0, up: false, close: false };
  if (!prod.length) return out;
  let closeit = true;
  for (let c = 0; c < prod.length; c++) {
    const old = ind.dailyProductionTarget[c];
    if (!(old > 0)) continue; // no output on this slot: nothing to move (never raised from 0)
    let nw = old;
    if (rng.int(0, 21) === 0) {
      const pct = ind.percentTransportedPrev[c];
      const up = pct <= 60 ? rng.int(0, 2) === 0 : pct <= 80 ? rng.int(0, 2) !== 0 : rng.int(0, 5) !== 0;
      nw = old + (up ? 1 : -1) * Math.max(Math.floor(((rng.int(0, 49) + 10) * old) / 256), 1);
    }
    nw = Math.max(1, Math.min(100, nw));
    if (nw === old && old > 1) { closeit = false; continue; } // OpenTTD: a steady rate above the minimum keeps the industry open
    if (nw !== old) {
      out.changed = true;
      const p = Math.abs(Math.round(((nw - old) * 100) / old));
      if (p > out.pct) { out.pct = p; out.up = nw > old; }
      ind.dailyProductionTarget[c] = nw;
    }
    if (nw > 1) closeit = false;
  }
  out.close = closeit;
  return out;
}

/**
 * Industry::updateMonthly (the closure removal itself is done by the manager).
 * @returns {'remove'|null}
 */
export function updateMonthly(game, ind, notify) {
  const state = game.state, rng = game.rng;
  ensureIndustryState(ind, state);
  const type = INDUSTRY_BY_ID[ind.typeId];
  if (ind.closingDown && ind.dailyProduction[0] === 0 && ind.dailyProduction[1] === 0) return 'remove';
  let hasEvent = false;
  if (getSetting(state, 'farmFields')) updateFarmMonthly(game, ind); // T29 opt-in: fields grow, productionRate follows
  const primary = requiredCargos(type).length === 0;
  const at = (text, kind, cat) => notify && notify(text, kind, ind.x + (ind.w >> 1), ind.y + (ind.h >> 1), cat);
  // EF economyType 'frozen' (OpenTTD ET_FROZEN, industry_cmd.cpp:2926): no production changes and no closures; no draws.
  const frozen = getSetting(state, 'economyType') === 'frozen';
  const smooth = !frozen && getSetting(state, 'economyType') === 'smooth';
  if (smooth && !ind.closingDown && primary) {
    const sm = smoothMonthlyChange(rng, ind, type);
    if (sm.changed && sm.pct >= 10) {
      at(`Production at ${ind.name} has ${sm.up ? 'increased' : 'decreased'}.`, sm.up ? 'good' : 'bad', 'production');
    }
    if (sm.changed) hasEvent = true;
    if (sm.close) {
      ind.closingDown = true;
      ind.dailyProductionTarget = [0, 0];
      at(`${ind.name} is going to close down.`, 'bad', 'industryClose');
    }
  } else if (!frozen && !ind.closingDown && primary) {
    if (isMonthlyProductionUp(rng, ind)) {
      ind.dailyProductionTarget[0] = Math.min(100, ind.dailyProductionTarget[0] * 2);
      ind.dailyProductionTarget[1] = Math.min(100, ind.dailyProductionTarget[1] * 2);
      at(`Production at ${ind.name} has increased.`, 'good', 'production');
      hasEvent = true;
    } else if (isMonthlyProductionDown(rng, ind)) {
      ind.dailyProductionTarget[0] = Math.floor(ind.dailyProductionTarget[0] / 2);
      ind.dailyProductionTarget[1] = Math.floor(ind.dailyProductionTarget[1] / 2);
      at(`Production at ${ind.name} has decreased.`, 'bad', 'production');
      hasEvent = true;
    }
  }
  if (!frozen && !hasEvent && !state.disallowIndustriesCloseDown && !ind.closingDown) {
    if (isMonthlyProductionClosing(rng, state, ind)) {
      ind.closingDown = true;
      ind.dailyProductionTarget = [0, 0];
      at(`${ind.name} is going to close down.`, 'bad', 'industryClose');
    }
  }
  const prod = producedCargos(type), req = requiredCargos(type);
  for (let c = 0; c < 2; c++) {
    ind.producedPrev[c] = ind.producedMonthly[c]; ind.producedMonthly[c] = 0;
    ind.deliveredPrev[c] = ind.deliveredMonthly[c]; ind.deliveredMonthly[c] = 0;
    let transported = Math.min(ind.producedPrev[c], ind.deliveredPrev[c]);
    if (ind.producedPrev[c] !== 0) transported = Math.floor((transported * 100) / ind.producedPrev[c]);
    ind.percentTransportedPrev[c] = transported;
  }
  for (let i = 0; i < 3; i++) { ind.receivedPrev[i] = ind.receivedMonthly[i]; ind.receivedMonthly[i] = 0; }
  // UI/stat mirrors keyed by cargo id
  ind.producedLastMonth = {}; ind.transportedLastMonth = {}; ind.deliveredLastMonth = {};
  prod.forEach((c, i) => { ind.producedLastMonth[c] = ind.producedPrev[i]; ind.transportedLastMonth[c] = Math.min(ind.producedPrev[i], ind.deliveredPrev[i]); });
  req.forEach((c, i) => { ind.deliveredLastMonth[c] = ind.receivedPrev[i]; });
  ind.producedThisMonth = {}; ind.transportedThisMonth = {}; ind.deliveredThisMonth = {};
  pushIndustryHistory(ind, prod, state.date);
  return null;
}

/** Months of production history kept per industry (OpenTTD industry window graph shows up to 2 years). */
export const INDUSTRY_HISTORY_MONTHS = 24;

/**
 * Append this month's produced / transported amounts to ind.hist, capped at INDUSTRY_HISTORY_MONTHS.
 * Lazy and compact: the field appears at the first month end of an industry that produces and is saved with
 * the game (small int tuples, max 24 months), and each
 * entry is a tuple [monthIndex, produced0, transported0, produced1, transported1] (cargo ids come from
 * the industry type, so no keys are stored). monthIndex = year*12 + month (game date, month 0-based).
 */
export function pushIndustryHistory(ind, prod, date) {
  if (!prod.length || !date) return;
  const row = [date.year * 12 + date.month];
  for (let i = 0; i < prod.length; i++) row.push(ind.producedPrev[i] || 0, Math.min(ind.producedPrev[i] || 0, ind.deliveredPrev[i] || 0));
  if (!Array.isArray(ind.hist)) ind.hist = []; // lazy; saved with the game (old saves: absent = no history)
  ind.hist.push(row);
  if (ind.hist.length > INDUSTRY_HISTORY_MONTHS) ind.hist.splice(0, ind.hist.length - INDUSTRY_HISTORY_MONTHS);
}

/**
 * Set industry production targets (OpenTTD CmdIndustrySetProduction, industry_cmd.cpp:2846; command_type.h:266).
 * Clamps each target to 0..255. dryRun only validates. By default also updates dailyProduction immediately.
 */
export function setIndustryProduction(ctx, id, targets, opts = {}) {
  const ind = (ctx.state.industries || []).find((i) => i.id === id);
  if (!ind) return { ok: false, error: 'Unknown industry' };
  const p0 = Math.max(0, Math.min(255, Math.round(Number(targets && targets[0]) || 0)));
  const p1 = Math.max(0, Math.min(255, Math.round(Number(targets && targets[1]) || 0)));
  if (opts.dryRun) return { ok: true, cost: 0, targets: [p0, p1] };
  if (!ind.dailyProductionTarget) ind.dailyProductionTarget = [0, 0];
  if (!ind.dailyProduction) ind.dailyProduction = [0, 0];
  ind.dailyProductionTarget = [p0, p1];
  if (opts.immediate !== false) ind.dailyProduction = [p0, p1];
  return { ok: true, cost: 0, targets: [p0, p1] };
}
