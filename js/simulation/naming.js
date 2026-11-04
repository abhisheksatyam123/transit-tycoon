/**
 * Procedural names for towns, industries and stations.
 */
import { TOWN_PREFIX, TOWN_MIDDLE, TOWN_SUFFIX, STATION_SUFFIX, INDUSTRY_SUFFIX } from '../config/names.js';
import { nearestTown } from './state.js';

/**
 * Generate a unique town name.
 * @param {object} rng
 * @param {Set<string>} used names already taken (updated)
 */
export function townName(rng, used) {
  for (let i = 0; i < 200; i++) {
    const n = rng.pick(TOWN_PREFIX) + rng.pick(TOWN_MIDDLE) + rng.pick(TOWN_SUFFIX);
    const name = n.charAt(0).toUpperCase() + n.slice(1);
    if (!used.has(name)) { used.add(name); return name; }
  }
  const fallback = `Town ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

/**
 * Industry name: "<Nearest town> <Type name>" (+ suffix when duplicated).
 */
export function industryName(state, type, x, y) {
  const town = nearestTown(state, x, y);
  const base = `${town ? town.name : 'Remote'} ${type.name}`;
  const used = new Set(state.industries.map((i) => i.name));
  for (const s of INDUSTRY_SUFFIX) {
    if (!used.has(base + s)) return base + s;
  }
  return `${base} ${state.industries.length + 1}`;
}

/**
 * Station name from nearest town plus a unique suffix.
 */
export function stationName(state, x, y) {
  const town = nearestTown(state, x, y);
  const base = town ? town.name : 'Station';
  const used = new Set(state.stations.map((s) => s.name));
  for (const s of STATION_SUFFIX) {
    if (!used.has(base + s)) return base + s;
  }
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`;
}
