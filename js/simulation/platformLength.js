/**
 * Platform length vs train length (OpenTTD: a train longer than its platform only loads and unloads the
 * wagons that stand inside the platform; economy.cpp LoadUnloadVehicle, train_cmd.cpp stop position).
 *
 * Model: each train vehicle (engine or wagon) occupies SEGMENT_SPACING tiles, the same spacing that draws
 * the consist (vehicles.js getVehicleSegments), i.e. 2 vehicles per tile (OpenTTD: 8 length units per
 * vehicle, 16 per tile). The head stops at the far end of the platform run, so the FIRST wagons from the
 * head are inside the platform and the rest hang outside it.
 *
 * Lazy: v.platFit is set on arrival only when the train is too long (number of wagons inside, < wagons).
 * Absent = the whole train fits, or the setting is off. Computed once per arrival (no station cache to
 * invalidate: each arrival reads the current platform).
 */
import { SEGMENT_SPACING } from './constants.js';
import { getSetting } from './settings.js';
import { getTile, inBounds } from './map.js';
import { consistUnits, extraEngineCount } from './consistEngines.js';

const MAX_RUN = 64;

/** Train length in tiles: all engines plus its wagons (v.wagons), SEGMENT_SPACING tiles each. */
export function trainLengthTiles(v) {
  return ((v.wagons || 0) + 1 + extraEngineCount(v)) * SEGMENT_SPACING;
}

/** Maximum allowed train length in tiles from settings (OpenTTD vehicle.max_train_length). */
export function maxTrainLengthTiles(state) {
  return getSetting(state, 'maxTrainLength');
}

/**
 * Length in tiles of the rail platform run of station `st` that contains tile (x,y): contiguous station
 * tiles of the same station and axis. 0 when (x,y) is not a rail tile of that station.
 */
export function platformRun(state, st, x, y) {
  const map = state.map;
  if (!inBounds(map, x, y)) return 0;
  const b0 = getTile(map, x, y).building;
  if (!b0 || b0.type !== 'station' || b0.stationId !== st.id || b0.kind !== 'rail') return 0;
  const axis = b0.axis;
  const dx = axis === 'x' ? 1 : 0, dy = axis === 'y' ? 1 : 0;
  let n = 1;
  for (const sign of [1, -1]) {
    for (let i = 1; i <= MAX_RUN; i++) {
      const nx = x + dx * i * sign, ny = y + dy * i * sign;
      if (!inBounds(map, nx, ny)) break;
      const b = getTile(map, nx, ny).building;
      if (!b || b.type !== 'station' || b.stationId !== st.id || b.kind !== 'rail' || b.axis !== axis) break;
      n++;
    }
  }
  return n;
}

/** Longest rail platform run of a station (0 when it has no rail tiles). */
export function stationMaxPlatform(state, st) {
  let best = 0;
  for (const p of st.tiles || []) {
    if (p.kind !== 'rail') continue;
    const n = platformRun(state, st, p.x, p.y);
    if (n > best) best = n;
  }
  return best;
}

/**
 * OpenTTD order.station_length_loading_penalty (economy.cpp UpdateLoadUnloadTicks): a train longer than its
 * platform waits longer per stop. Overhang in OpenTTD length units (8 per vehicle, 16 per tile): ticks <<= 1,
 * then ticks += overhang * ticks / 8. Whole train length counts (not only the wagons inside). TT applies it to
 * the fixed stop time. Off, not a train, or no rail platform at the stop: base unchanged.
 * @returns {number} loading ticks (>= 1)
 */
export function loadingTicksFor(state, v, st, base) {
  if (!getSetting(state, 'stationLengthLoadingPenalty') || v.kind !== 'train') return base;
  const plat = platformRun(state, st, v.tx, v.ty);
  if (plat <= 0) return base;
  const overhang = Math.round((trainLengthTiles(v) - plat) * 16);
  if (overhang <= 0) return base;
  let t = base * 2;
  t += Math.floor((overhang * t) / 8);
  return Math.max(1, t);
}

/** Wagons (of `wagons`) that fit in a platform of `platTiles` tiles; the engines take the first slots. */
export function wagonsFitting(wagons, platTiles, engineCount = 1) {
  const vehicles = Math.floor(platTiles / SEGMENT_SPACING + 1e-9);
  return Math.max(0, Math.min(wagons, vehicles - engineCount));
}

/**
 * Arrival check: wagons inside the platform at (v.tx,v.ty), or null when the whole train fits (or not a
 * train / no rail platform there).
 * @returns {number|null}
 */
function platformFitOnArrival(state, v, st) {
  if (v.kind !== 'train') return null;
  const wagons = v.wagons || 0;
  const plat = platformRun(state, st, v.tx, v.ty);
  if (plat <= 0) return null;
  const fit = wagonsFitting(wagons, plat, consistUnits(v) - wagons);
  return fit < wagons ? fit : null;
}

/**
 * Arrival bookkeeping: sets or drops v.platFit. Off = nothing is computed or stored.
 */
export function updatePlatFit(state, v, st) {
  if (!getSetting(state, 'platformLength')) { if (v.platFit !== undefined) delete v.platFit; return; }
  const fit = platformFitOnArrival(state, v, st);
  if (fit == null) { if (v.platFit !== undefined) delete v.platFit; } else v.platFit = fit;
}

/** Warning text when the train of v is longer than the platform of station st (null = fits or setting off). */
export function platformWarning(state, v, st) {
  if (!getSetting(state, 'platformLength') || v.kind !== 'train' || !st) return null;
  const plat = stationMaxPlatform(state, st);
  if (!plat) return null;
  return trainLengthTiles(v) > plat + 1e-9 ? 'Train longer than platform' : null;
}

/** Longest rail platform among all stations (buy-window warning; 0 when none). */
export function longestPlatform(state) {
  let best = 0;
  for (const st of state.stations || []) {
    const n = stationMaxPlatform(state, st);
    if (n > best) best = n;
  }
  return best;
}
