/**
 * Cargo distribution from industries and town houses to nearby stations.
 * Production is distributed in four chunks per month (days 1, 8, 15, 22).
 */
import { MAX_WAITING } from './constants.js';
import { HOUSE_POP } from './towns.js';
import { addWaiting, acceptsFromSource } from './stations.js';
import { ensureIndustryState } from './loco/industry.js';
import { manhattan } from './state.js';
import { cdApplies, splitByDest, noteSupply, splitVia } from './cargodist.js';
import { getSetting } from './settings.js';

/** Days of the month on which a production chunk is distributed. */

/**
 * Pick up to 2 stations (best rating first) covering any of the given tile indices
 * that have had a vehicle loading `cargoId`.
 * @param {object} state
 * @param {Map<number,number[]>} coverage tile index -> station ids
 * @param {number[]} tileIdxs
 * @param {string} cargoId
 * @param {number} sx source x (for tie-breaking by distance)
 * @param {number} sy
 */
export function servingStations(state, coverage, tileIdxs, cargoId, sx, sy) {
  // Fast path for the single-tile call every in-tree caller makes: per-tile coverage ids are unique,
  // so a one-candidate tile needs neither the Set nor the sort (the result is the same one station).
  if (tileIdxs.length === 1) {
    const arr = coverage.get(tileIdxs[0]);
    if (!arr || arr.length === 0) return [];
    if (arr.length === 1) {
      const st = stationById(state, coverage).get(arr[0]);
      return st && acceptsFromSource(state, st, cargoId) ? [st] : [];
    }
  }
  const ids = new Set();
  for (const i of tileIdxs) {
    const arr = coverage.get(i);
    if (arr) for (const id of arr) ids.add(id);
  }
  const byId = stationById(state, coverage);
  const list = [];
  for (const id of ids) {
    const st = byId.get(id);
    if (st && acceptsFromSource(state, st, cargoId)) list.push(st);
  }
  list.sort((a, b) => (b.rating[cargoId] ?? 0) - (a.rating[cargoId] ?? 0)
    || manhattan(a.x, a.y, sx, sy) - manhattan(b.x, b.y, sx, sy) || a.id - b.id);
  return list.slice(0, 2);
}

/**
 * id -> station map beside a coverage index. buildCoverage attaches one; a hand-built coverage Map
 * (tests, tools) gets a lazy map cached on the Map, invalidated when state.stations is replaced or
 * grows/shrinks (station ids are unique, so size is a sufficient length check).
 */
function stationById(state, coverage) {
  let byId = coverage.stationById;
  if (byId && coverage.stationByIdOf === state.stations && byId.size === state.stations.length) return byId;
  byId = new Map();
  for (const st of state.stations) if (!byId.has(st.id)) byId.set(st.id, st);
  if (coverage instanceof Map) { coverage.stationById = byId; coverage.stationByIdOf = state.stations; }
  return byId;
}

/**
 * Move `amount` units of cargo to the serving stations, scaled by the best rating.
 * @returns {number} amount actually moved to stations
 */
export function deliverToStations(state, stations, cargoId, amount, sx, sy) {
  if (amount <= 0 || stations.length === 0) return 0;
  const best = stations[0].rating[cargoId] ?? 50;
  const moved = Math.floor((amount * best) / 100);
  if (moved <= 0) return 0;
  if (stations.length === 1) return addToStation(state, stations[0], cargoId, moved, sx, sy);
  const r0 = stations[0].rating[cargoId] ?? 50, r1 = stations[1].rating[cargoId] ?? 50;
  const first = Math.round((moved * r0) / Math.max(1, r0 + r1));
  // Offer the first station's rejected part (it may be at MAX_WAITING) to the second one, so production is not
  // lost while station 1 still has room. Identical whenever station 0 accepts its full share.
  const got0 = addToStation(state, stations[0], cargoId, first, sx, sy);
  return got0 + addToStation(state, stations[1], cargoId, Math.max(0, moved - got0), sx, sy);
}

/**
 * Add generated cargo to one station. With cargodist (passengers/mail, setting on) the units are split over
 * the destinations of the station's demand (parcel.dest); otherwise one parcel per source (classic).
 */
function addToStation(state, st, cargoId, amount, sx, sy) {
  if (!cdApplies(state, cargoId)) return addWaiting(st, cargoId, amount, sx, sy, state.tick, MAX_WAITING);
  noteSupply(st, cargoId, amount);
  let added = 0;
  for (const part of splitByDest(state, st, cargoId, amount)) {
    const dest = part.dest === undefined ? null : part.dest;
    // several flow vias to the destination: the units are split over them now (one packet per via)
    const vias = dest == null ? [{ via: undefined, amount: part.amount }] : splitVia(state, st, cargoId, dest, part.amount);
    for (const v of vias) added += addWaiting(st, cargoId, v.amount, sx, sy, state.tick, MAX_WAITING, 0, dest, v.via);
  }
  return added;
}

/**
 * World creation: set up the OpenLoco-style production state of every industry
 * (daily production itself lives in loco/industryManager.js + loco/industry.js).
 */
export function industriesMonthStart(state, _rng) {
  for (const ind of state.industries) ensureIndustryState(ind, state);
}

/**
 * Distribute one chunk of passengers and mail from every town house.
 */
export function distributeTownCargo(state, rng, coverage) {
  const { map } = state;
  // OpenTTD economy.town_cargo_scale (percent, def 100): applied after the original rng draws so the
  // default path (100) is unchanged in both rng consumption and rounding.
  const scale = Number(getSetting(state, 'townCargoScale'));
  for (const town of state.towns) {
    for (const h of town.houses) {
      const i = h.y * map.width + h.x;
      const t = map.tiles[i];
      if (!t.building || t.building.type !== 'house') continue;
      const pop = HOUSE_POP[t.building.level];
      let pass = Math.round((pop / 12) * rng.range(0.5, 1.5));
      let mail = rng.chance(0.5) ? Math.round((pop / 30) * rng.range(0.5, 1.5)) : 0;
      if (Number.isFinite(scale) && scale !== 100) {
        pass = Math.max(0, Math.round((pass * scale) / 100));
        mail = Math.max(0, Math.round((mail * scale) / 100));
      }
      town.passengersThisMonth += pass;
      town.mailThisMonth += mail;
      if (!coverage.has(i)) continue;
      const sp = servingStations(state, coverage, [i], 'PASS', h.x, h.y);
      town.transportedThisMonth += deliverToStations(state, sp, 'PASS', pass, h.x, h.y);
      if (mail > 0) {
        const sm = servingStations(state, coverage, [i], 'MAIL', h.x, h.y);
        deliverToStations(state, sm, 'MAIL', mail, h.x, h.y);
      }
    }
  }
}
