/**
 * Infrastructure maintenance (OpenTTD economy.infrastructure_maintenance, economy.cpp CompaniesGenStatistics).
 * Monthly fee for the player's track, road, signals, stations and airports, computed from piece counts:
 *   rail:    RailMaintenanceCost   rail.h:503    price * multiplier(8) * num * (1+sqrt(total)) >> 11
 *   signals: SignalMaintenanceCost rail.h:514    price * 15 * num * (1+sqrt(num)) >> 8
 *   road:    RoadMaintenanceCost   road_func.h:107 price * multiplier(16) * num * (1+sqrt(total)) >> 12
 *   station: StationMaintenanceCost station_func.h:60  price * num * (1+sqrt(num)) >> 7
 *   airport: AirportMaintenanceCost station.cpp:548   price * maintenance_cost, >> 3
 * Prices are OpenTTD's base prices (table/pricebase.h): rail 10, road 10, station 100, airport 5000.
 * Counting is one cheap pass over the tiles, run only when the setting is on (no per-tile counters are kept,
 * so there is no state and nothing to keep in sync). Default off: nothing is computed, nothing is charged.
 * Canals are not in TT (no canal count). Rivals' infrastructure is not charged (player only).
 */
import { getSetting } from './settings.js';

const PRICE_RAIL = 10, PRICE_ROAD = 10, PRICE_STATION = 100, PRICE_AIRPORT = 5000;
const MULT_RAIL = 8, MULT_ROAD = 16;
/** Airport maintenance_cost factor (OpenTTD airport spec, 3 bits fraction); TT has one value for all airport types. */
const AIRPORT_MAINT_COST = 8;

const popcount4 = (v) => (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1);

/**
 * Count the player's infrastructure pieces in one pass over the map. Ownership follows economy.js upkeepFor:
 * a company road/rail tile is the player's; a station/depot tile is the player's when its station record is.
 */
export function countInfrastructure(state) {
  let rail = 0, road = 0, signals = 0, stations = 0;
  const airportIds = new Set();
  const stOwner = new Map();
  for (const st of state.stations) if (st.ownerId == null) stOwner.set(st.id, true);
  for (const t of state.map.tiles) {
    const b = t.building;
    const isStop = b && (b.type === 'station' || b.type === 'depot');
    if (isStop && b.type === 'station') {
      if (!stOwner.has(b.stationId)) continue;
      if (b.kind === 'airport') airportIds.add(b.stationId);
      else stations++;
      continue;
    }
    if (t.owner !== 'company') continue;
    if (t.rail) rail += popcount4(t.rail);
    if (t.road) road += popcount4(t.road);
    if (t.signal) signals++;
  }
  return { rail, road, signals, stations, airports: airportIds.size };
}

const isqrt = (n) => Math.floor(Math.sqrt(n));

/** Monthly infrastructure maintenance for the player (0 when the setting is off). */
export function infrastructureMaintenance(state) {
  if (!getSetting(state, 'infraMaintenance')) return 0;
  const c = countInfrastructure(state);
  let cost = 0;
  cost += Math.floor((PRICE_RAIL * MULT_RAIL * c.rail * (1 + isqrt(c.rail))) / 2048);
  cost += Math.floor((PRICE_RAIL * 15 * c.signals * (1 + isqrt(c.signals))) / 256);
  cost += Math.floor((PRICE_ROAD * MULT_ROAD * c.road * (1 + isqrt(c.road))) / 4096);
  cost += Math.floor((PRICE_STATION * c.stations * (1 + isqrt(c.stations))) / 128);
  cost += Math.floor((PRICE_AIRPORT * AIRPORT_MAINT_COST * c.airports) / 8);
  return cost;
}
