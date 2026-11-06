/**
 * Ported from OpenLoco (MIT), src/World/TownManager.cpp: tick (0x00496B6D), updateMonthly (0x0049748C);
 * per-town logic in ./town.js. updateDaily() mirrors the town part of StationManager::updateDaily
 * (0x0048B244: ratingAdjusted reset + company rating +1 for a town with a station of good rating); it is
 * called from TileManager.tick on the day change because StationManager (R12a) has no town link.
 */
import { rollTownStats } from '../townGrowth.js';
import { recomputeAllAcceptance } from '../stations.js';
import { manhattan } from '../state.js';
import { tickTown, updateMonthlyTown, adjustCompanyRating, ensureTown } from './town.js';
import { updateAuthorityMonthly, FUND_BUILD_SPEED } from '../townAuthority.js';

/** TownManager::tick: every 8th scenario tick one town (slot (ticks/8) % 0x7F) updates. */
export function tick(game) {
  const ticks = game.state.scenarioTicks || 0;
  if (ticks % 8 !== 0) return;
  const town = game.state.towns[(ticks / 8) % 0x7f];
  if (town) tickTown(game, town);
}

/** TownManager::updateMonthly: Town::updateMonthly for every town. */
export function updateMonthly(game) {
  const s = game.state;
  for (const town of s.towns) {
    updateMonthlyTown(town);
    if (town.fundMonths > 0) town.buildSpeed = FUND_BUILD_SPEED; // fund new buildings (townAuthority.js)
    rollTownStats(s, town);
  }
  updateAuthorityMonthly(s);
  recomputeAllAcceptance(s);
}

/** Station -> closest town (OpenLoco: Station::town), cached on the station. */
function stationTown(state, st) {
  let town = state.towns.find((t) => t.id === st.townId);
  if (!town) {
    let best = Infinity;
    for (const t of state.towns) {
      const d = manhattan(t.x, t.y, st.x, st.y);
      if (d < best) { best = d; town = t; }
    }
    if (town) st.townId = town.id;
  }
  return town;
}

/** Town part of StationManager::updateDaily. */
export function updateDaily(game) {
  const s = game.state;
  for (const t of s.towns) ensureTown(t).ratingAdjusted = false;
  for (const st of s.stations) {
    if (!st.tiles.length) continue;
    const r200 = st.rating200 || {};
    let good = false;
    for (const c of Object.keys(st.lastPickup)) {
      if ((r200[c] ?? (st.rating[c] ?? 0) * 2) >= 100) { good = true; break; }
    }
    if (!good) continue;
    const town = stationTown(s, st);
    if (town && !town.ratingAdjusted) { town.ratingAdjusted = true; adjustCompanyRating(town, 1); }
  }
}
