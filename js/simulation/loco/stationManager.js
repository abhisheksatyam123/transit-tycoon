/**
 * Ported from OpenLoco (MIT), src/World/StationManager.cpp: tick (0x0048B1FA), updateDaily (0x0048B244).
 * Per-station logic lives in ./station.js (Station.cpp). See that file for the data-model mapping.
 */
import { tickStation, updateCargo } from './station.js';

/** StationManager::tick: one station per tick (id == ticks & 0x3FF) refreshes its cargo acceptance. */
export function tick(game) {
  const idx = game.state.tick & 0x3ff;
  for (const st of game.state.stations) {
    if ((st.id & 0x3ff) === idx && st.tiles.length) tickStation(game, st);
  }
}

/**
 * StationManager::updateDaily: per station updateCargo (ratings, decay, ageing).
 * noTilesTimeout is not applicable (TT deletes empty stations at once, see station.js). The town
 * company-rating adjustment is in loco/townManager.js updateDaily (ratingAdjusted + adjustCompanyRating).
 */
export function updateDaily(game) {
  for (const st of game.state.stations) updateCargo(game, st);
}
