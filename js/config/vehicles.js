import { AIRCRAFT_MODELS } from './aircraft.js';
import { SHIP_MODELS } from './ships.js';

/**
 * Vehicle models. kind: 'engine' | 'wagon' | 'bus' | 'truck'.
 * speed in km/h, cost in money, running = yearly running cost, reliability 0..1.
 * Wagons/trucks/buses list `cargos` they can carry (first = default).
 * obsoleteYear (optional): from that year the model is no longer offered for purchase (existing vehicles keep
 * running). Set only when a successor carrying the same cargo exists (successor intro + 10), so every cargo
 * always has a buyable model; the last model of each line and wagons never go obsolete.
 */
export const VEHICLE_MODELS = [
  // --- locomotives ---
  { id: 'eng_puffer', name: 'Puffer 2-4-0 Steam', kind: 'engine', introYear: 1920, obsoleteYear: 1955, speed: 64, capacity: 0, cost: 6000, running: 1800, reliability: 0.78, power: 600 },
  { id: 'eng_comet', name: 'Comet 4-6-2 Steam', kind: 'engine', introYear: 1945, obsoleteYear: 1968, speed: 96, capacity: 0, cost: 9500, running: 2600, reliability: 0.82, power: 1100 },
  { id: 'eng_thunder', name: 'Thunder Diesel', kind: 'engine', introYear: 1958, obsoleteYear: 1985, speed: 128, capacity: 0, cost: 15000, running: 3800, reliability: 0.88, power: 1800 },
  { id: 'eng_arrow', name: 'Arrow Express Diesel', kind: 'engine', introYear: 1975, obsoleteYear: 2002, speed: 160, capacity: 0, cost: 24000, running: 5200, reliability: 0.9, power: 2600 },
  { id: 'eng_bolt', name: 'Bolt HST', kind: 'engine', introYear: 1992, speed: 200, capacity: 0, cost: 36000, running: 7000, reliability: 0.93, power: 3800 },
  // --- wagons ---
  { id: 'wag_coach', name: 'Passenger Coach', kind: 'wagon', introYear: 1900, speed: 0, capacity: 40, cost: 1200, running: 150, reliability: 1, cargos: ['PASS'] },
  { id: 'wag_mail', name: 'Mail Van', kind: 'wagon', introYear: 1900, speed: 0, capacity: 30, cost: 1100, running: 150, reliability: 1, cargos: ['MAIL'] },
  { id: 'wag_hopper', name: 'Hopper Wagon', kind: 'wagon', introYear: 1900, speed: 0, capacity: 30, cost: 1000, running: 120, reliability: 1, cargos: ['COAL', 'IORE', 'GRAI'] },
  { id: 'wag_tanker', name: 'Tank Wagon', kind: 'wagon', introYear: 1900, speed: 0, capacity: 28, cost: 1100, running: 120, reliability: 1, cargos: ['OIL'] },
  { id: 'wag_flat', name: 'Flat Wagon', kind: 'wagon', introYear: 1900, speed: 0, capacity: 30, cost: 1000, running: 120, reliability: 1, cargos: ['WOOD', 'STEL'] },
  { id: 'wag_box', name: 'Box Van', kind: 'wagon', introYear: 1900, speed: 0, capacity: 28, cost: 1100, running: 120, reliability: 1, cargos: ['GOOD', 'GRAI'] },
  { id: 'wag_cattle', name: 'Livestock Van', kind: 'wagon', introYear: 1900, speed: 0, capacity: 25, cost: 1100, running: 120, reliability: 1, cargos: ['LVST'] },
  // --- road: buses ---
  { id: 'bus_city', name: 'City Omnibus', kind: 'bus', introYear: 1920, obsoleteYear: 1972, speed: 56, capacity: 31, cost: 4200, running: 900, reliability: 0.8, cargos: ['PASS'] },
  { id: 'bus_express', name: 'Express Coach', kind: 'bus', introYear: 1962, obsoleteYear: 1995, speed: 88, capacity: 37, cost: 6500, running: 1200, reliability: 0.87, cargos: ['PASS'] },
  { id: 'bus_modern', name: 'Metro Bus', kind: 'bus', introYear: 1985, speed: 112, capacity: 45, cost: 9000, running: 1500, reliability: 0.92, cargos: ['PASS'] },
  // --- road: trucks ---
  { id: 'trk_mail', name: 'Mail Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 22, cost: 4000, running: 850, reliability: 0.8, cargos: ['MAIL'] },
  { id: 'trk_bulk', name: 'Bulk Truck', kind: 'truck', introYear: 1920, obsoleteYear: 1975, speed: 48, capacity: 20, cost: 4300, running: 900, reliability: 0.8, cargos: ['COAL', 'IORE', 'GRAI'] },
  { id: 'trk_tanker', name: 'Tanker Truck', kind: 'truck', introYear: 1920, speed: 48, capacity: 21, cost: 4500, running: 900, reliability: 0.8, cargos: ['OIL'] },
  { id: 'trk_log', name: 'Log Truck', kind: 'truck', introYear: 1920, obsoleteYear: 1975, speed: 48, capacity: 22, cost: 4300, running: 900, reliability: 0.8, cargos: ['WOOD'] },
  { id: 'trk_goods', name: 'Goods Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 18, cost: 4600, running: 950, reliability: 0.82, cargos: ['GOOD'] },
  { id: 'trk_steel', name: 'Steel Truck', kind: 'truck', introYear: 1920, obsoleteYear: 1975, speed: 48, capacity: 20, cost: 4500, running: 900, reliability: 0.8, cargos: ['STEL'] },
  { id: 'trk_cattle', name: 'Livestock Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 16, cost: 4400, running: 900, reliability: 0.8, cargos: ['LVST'] },
  { id: 'trk_heavy', name: 'Heavy Hauler', kind: 'truck', introYear: 1965, speed: 88, capacity: 30, cost: 7800, running: 1300, reliability: 0.88, cargos: ['COAL', 'IORE', 'GRAI', 'WOOD', 'STEL'] },
];

/** Road/rail models plus aircraft (lookup and purchase only; VEHICLE_MODELS keeps its news list). */
/**
 * T29 optional models (OpenTTD temperate armoured truck, Uhl). Kept out of VEHICLE_MODELS so obsoleteYear() and the
 * yearly news of default games do not change. optIn: only offered when extraIndustries is on or a valuables source exists.
 */
export const EXTRA_VEHICLE_MODELS = [
  { id: 'trk_armoured', name: 'Armoured Truck', kind: 'truck', introYear: 1950, speed: 56, capacity: 12, cost: 5200, running: 1000, reliability: 0.85, cargos: ['VALU'], optIn: 'valuables', news: false },
];

/**
 * Electric locomotives (electrified track, see cmdElectrify.js). Gated by modelAvailable(): offered only
 * once some tile of the map carries catenary, so default games never see them (hashes unchanged).
 * Electric trains only route over electrified rail (pathfinder opts.electric).
 */
export const ELECTRIC_VEHICLE_MODELS = [
  { id: 'eng_volt', name: 'Volt Electric', kind: 'engine', traction: 'electric', optIn: 'electric', introYear: 1955, obsoleteYear: 1995, speed: 144, capacity: 0, cost: 17000, running: 4200, reliability: 0.89, power: 2400, news: false },
  { id: 'eng_spark', name: 'Spark Electric', kind: 'engine', traction: 'electric', optIn: 'electric', introYear: 1985, speed: 200, capacity: 0, cost: 30000, running: 6000, reliability: 0.92, power: 3400, news: false },
];

export const ALL_VEHICLE_MODELS = [...VEHICLE_MODELS, ...AIRCRAFT_MODELS, ...SHIP_MODELS, ...EXTRA_VEHICLE_MODELS, ...ELECTRIC_VEHICLE_MODELS];

/** Lookup by id. */
export const MODEL_BY_ID = Object.fromEntries(ALL_VEHICLE_MODELS.map((m) => [m.id, m]));

/** Ticks a vehicle needs to reach max speed from standstill. */
export const ACCEL_TICKS = { train: 90, road: 40, aircraft: 30 };
