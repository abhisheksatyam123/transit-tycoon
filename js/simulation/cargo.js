/**
 * Cargo distribution from industries and town houses to nearby stations.
 * Production is distributed in four chunks per month (days 1, 8, 15, 22).
 */
import { MAX_WAITING } from './constants.js';
import { HOUSE_POP } from './towns.js';
import { addWaiting } from './stations.js';
import { ensureIndustryState } from './loco/industry.js';
import { manhattan, findStation } from './state.js';

/** Days of the month on which a production chunk is distributed. */
export const DISTRIBUTION_DAYS = [1, 8, 15, 22];

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
  const ids = new Set();
  for (const i of tileIdxs) {
    const arr = coverage.get(i);
    if (arr) for (const id of arr) ids.add(id);
  }
  const list = [];
  for (const id of ids) {
    const st = findStation(state, id);
    if (st && st.lastPickup[cargoId] !== undefined) list.push(st);
  }
  list.sort((a, b) => (b.rating[cargoId] ?? 0) - (a.rating[cargoId] ?? 0)
    || manhattan(a.x, a.y, sx, sy) - manhattan(b.x, b.y, sx, sy) || a.id - b.id);
  return list.slice(0, 2);
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
  if (stations.length === 1) return addWaiting(stations[0], cargoId, moved, sx, sy, state.tick, MAX_WAITING);
  const r0 = stations[0].rating[cargoId] ?? 50, r1 = stations[1].rating[cargoId] ?? 50;
  const first = Math.round((moved * r0) / Math.max(1, r0 + r1));
  return addWaiting(stations[0], cargoId, first, sx, sy, state.tick, MAX_WAITING)
    + addWaiting(stations[1], cargoId, moved - first, sx, sy, state.tick, MAX_WAITING);
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
  for (const town of state.towns) {
    for (const h of town.houses) {
      const i = h.y * map.width + h.x;
      const t = map.tiles[i];
      if (!t.building || t.building.type !== 'house') continue;
      const pop = HOUSE_POP[t.building.level];
      const pass = Math.round((pop / 12) * rng.range(0.5, 1.5));
      const mail = rng.chance(0.5) ? Math.round((pop / 30) * rng.range(0.5, 1.5)) : 0;
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
