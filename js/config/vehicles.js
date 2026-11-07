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

/**
 * Trams (OpenTTD tram vehicles): run only on tram track (tile.tram), stop at bus stations on tram track.
 * Gated by modelAvailable(): offered only once some tile carries tram track, and news:false.
 */
export const TRAM_VEHICLE_MODELS = [
  { id: 'tram_horse', name: 'Horse Tram', kind: 'tram', optIn: 'tram', introYear: 1900, obsoleteYear: 1935, speed: 35, capacity: 36, cost: 3000, running: 600, reliability: 0.8, cargos: ['PASS'], news: false },
  { id: 'tram_electric', name: 'Electric Tram', kind: 'tram', optIn: 'tram', introYear: 1925, speed: 60, capacity: 40, cost: 6000, running: 900, reliability: 0.88, cargos: ['PASS'], news: false },
];

/**
 * Articulated road vehicles (OpenTTD articulated_vehicles.cpp). Part lengths equal the drawn body length (buses 0.5 tile = busBody L 0.25 x2, trams 0.72 = drawTram 2 x 0.36; OpenTTD VEHICLE_LENGTH 8/16). `parts` (head first, length in tiles) makes one vehicle
 * with several segments; `capacity` is the sum of the parts. optIn 'articulated': offered only when the
 * articulatedRV setting is on (default off, so default games and hashes are unchanged).
 */
export const ARTIC_VEHICLE_MODELS = [
  { id: 'bus_artic', name: 'Articulated City Bus', kind: 'bus', optIn: 'articulated', introYear: 1968, speed: 64, capacity: 60, cost: 9800, running: 1400, reliability: 0.85, cargos: ['PASS'], news: false, parts: [{ capacity: 30, length: 0.5 }, { capacity: 30, length: 0.5 }] },
  { id: 'trk_artic', name: 'Articulated Bulk Lorry', kind: 'truck', optIn: 'articulated', introYear: 1958, speed: 72, capacity: 40, cost: 8600, running: 1600, reliability: 0.84, cargos: ['COAL', 'IORE', 'GRAI'], news: false, parts: [{ capacity: 20, length: 0.5 }, { capacity: 20, length: 0.5 }] },
  { id: 'tram_artic', name: 'Articulated Tram', kind: 'tram', optIn: 'articulated', introYear: 1935, speed: 60, capacity: 80, cost: 12000, running: 1200, reliability: 0.86, cargos: ['PASS'], news: false, parts: [{ capacity: 40, length: 0.72 }, { capacity: 40, length: 0.72 }] },
];

/** Road/rail models plus aircraft (lookup and purchase only; VEHICLE_MODELS keeps its news list). */
/**
 * T29 optional models (OpenTTD temperate armoured truck, Uhl). Kept out of VEHICLE_MODELS so obsoleteYear() and the
 * yearly news of default games do not change. optIn: only offered when extraIndustries is on or a valuables source exists.
 */
export const EXTRA_VEHICLE_MODELS = [
  { id: 'trk_armoured', name: 'Armoured Truck', kind: 'truck', introYear: 1950, speed: 56, capacity: 12, cost: 5200, running: 1000, reliability: 0.85, cargos: ['VALU'], optIn: 'valuables', news: false },
  // TP: sub-tropical water tanker (road) and water tanker wagon (rail), offered only in tropic games (modelAvailable)
  { id: 'trk_water', name: 'Water Tanker', kind: 'truck', introYear: 1920, speed: 56, capacity: 20, cost: 4500, running: 900, reliability: 0.82, cargos: ['WATER'], optIn: 'tropic', news: false },
  { id: 'wag_water', name: 'Water Tanker Wagon', kind: 'wagon', introYear: 1900, speed: 0, capacity: 30, cost: 1100, running: 120, reliability: 1, cargos: ['WATER'], optIn: 'tropic', news: false },
  // TP sub-tropical chain vehicles (tropic games only): road trucks and rail wagons for RUBBER, FRUIT, MAIZE, COPPER_ORE, DIAMONDS
  { id: 'trk_rubber', name: 'Rubber Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 20, cost: 4300, running: 900, reliability: 0.82, cargos: ['RUBBER'], optIn: 'tropic', news: false },
  { id: 'trk_fruit', name: 'Fruit Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 16, cost: 4200, running: 900, reliability: 0.82, cargos: ['FRUIT'], optIn: 'tropic', news: false },
  { id: 'trk_maize', name: 'Maize Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 20, cost: 4000, running: 900, reliability: 0.82, cargos: ['MAIZE'], optIn: 'tropic', news: false },
  { id: 'trk_copper', name: 'Copper Ore Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 20, cost: 4600, running: 950, reliability: 0.82, cargos: ['COPPER_ORE'], optIn: 'tropic', news: false },
  { id: 'trk_diamonds', name: 'Diamond Truck', kind: 'truck', introYear: 1930, speed: 56, capacity: 10, cost: 5200, running: 1000, reliability: 0.85, cargos: ['DIAMONDS'], optIn: 'tropic', news: false },
  { id: 'wag_rubber', name: 'Rubber Wagon', kind: 'wagon', introYear: 1900, speed: 0, capacity: 30, cost: 1100, running: 120, reliability: 1, cargos: ['RUBBER'], optIn: 'tropic', news: false },
  { id: 'wag_fruit', name: 'Fruit Wagon', kind: 'wagon', introYear: 1900, speed: 0, capacity: 28, cost: 1100, running: 120, reliability: 1, cargos: ['FRUIT'], optIn: 'tropic', news: false },
  { id: 'wag_maize', name: 'Maize Wagon', kind: 'wagon', introYear: 1900, speed: 0, capacity: 30, cost: 1000, running: 120, reliability: 1, cargos: ['MAIZE'], optIn: 'tropic', news: false },
  { id: 'wag_copper', name: 'Copper Ore Wagon', kind: 'wagon', introYear: 1900, speed: 0, capacity: 30, cost: 1100, running: 120, reliability: 1, cargos: ['COPPER_ORE'], optIn: 'tropic', news: false },
  { id: 'wag_diamonds', name: 'Diamond Wagon', kind: 'wagon', introYear: 1910, speed: 0, capacity: 15, cost: 1300, running: 120, reliability: 1, cargos: ['DIAMONDS'], optIn: 'tropic', news: false },
  // T-IN: chain vehicles, offered only when extraIndustries is on (modelAvailable)
  { id: 'wag_stone', name: 'Stone Hopper', kind: 'wagon', introYear: 1900, speed: 0, capacity: 30, cost: 1000, running: 120, reliability: 1, cargos: ['STON', 'BMAT'], optIn: 'extraIndustries', news: false },
  { id: 'wag_crate', name: 'Food & Paper Van', kind: 'wagon', introYear: 1900, speed: 0, capacity: 28, cost: 1100, running: 120, reliability: 1, cargos: ['FOOD', 'PAPR'], optIn: 'extraIndustries', news: false },
  { id: 'trk_stone', name: 'Stone Truck', kind: 'truck', introYear: 1920, speed: 48, capacity: 20, cost: 4300, running: 900, reliability: 0.8, cargos: ['STON', 'BMAT'], optIn: 'extraIndustries', news: false },
  { id: 'trk_food', name: 'Food Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 16, cost: 4400, running: 900, reliability: 0.82, cargos: ['FOOD', 'PAPR'], optIn: 'extraIndustries', news: false },
];

/**
 * Electric locomotives (electrified track, see cmdElectrify.js). Gated by modelAvailable(): offered only
 * once some tile of the map carries catenary, so default games never see them (hashes unchanged).
 * Electric trains only route over electrified rail (pathfinder opts.electric).
 */
/** TY2: toyland road trucks, one per toyland cargo (temperate truck art stand-ins). optIn 'toyland': toyland games only. */
export const TOYLAND_VEHICLE_MODELS = [
  { id: 'trk_sweets', name: 'Sweets Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 20, cost: 4300, running: 900, reliability: 0.82, cargos: ['SWEETS'], optIn: 'toyland', news: false },
  { id: 'trk_sugar', name: 'Sugar Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 20, cost: 4100, running: 900, reliability: 0.82, cargos: ['SUGAR'], optIn: 'toyland', news: false },
  { id: 'trk_toys', name: 'Toy Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 22, cost: 4200, running: 900, reliability: 0.82, cargos: ['TOYS'], optIn: 'toyland', news: false },
  { id: 'trk_batteries', name: 'Battery Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 16, cost: 4200, running: 900, reliability: 0.82, cargos: ['BATTERIES'], optIn: 'toyland', news: false },
  { id: 'trk_candyfloss', name: 'Candyfloss Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 18, cost: 4000, running: 900, reliability: 0.82, cargos: ['CANDYFLOSS'], optIn: 'toyland', news: false },
  { id: 'trk_toffee', name: 'Toffee Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 20, cost: 4400, running: 950, reliability: 0.82, cargos: ['TOFFEE'], optIn: 'toyland', news: false },
  { id: 'trk_cola', name: 'Cola Tanker', kind: 'truck', introYear: 1920, speed: 56, capacity: 20, cost: 4400, running: 900, reliability: 0.82, cargos: ['COLA'], optIn: 'toyland', news: false },
  { id: 'trk_bubbles', name: 'Bubble Truck', kind: 'truck', introYear: 1930, speed: 56, capacity: 16, cost: 4500, running: 900, reliability: 0.82, cargos: ['BUBBLES'], optIn: 'toyland', news: false },
  { id: 'trk_plastic', name: 'Plastic Tanker', kind: 'truck', introYear: 1920, speed: 56, capacity: 20, cost: 4500, running: 900, reliability: 0.82, cargos: ['PLASTIC'], optIn: 'toyland', news: false },
  { id: 'trk_fizzy', name: 'Fizzy Drinks Truck', kind: 'truck', introYear: 1920, speed: 56, capacity: 18, cost: 4300, running: 900, reliability: 0.82, cargos: ['FIZZY_DRINKS'], optIn: 'toyland', news: false },
  // TY3 toyland rail wagons (toyland games only, temperate wagon art stand-ins: see renderer/pack/vehicles.js)
  { id: 'wag_sweets', name: 'Sweets Wagon', kind: 'wagon', introYear: 1920, speed: 0, capacity: 30, cost: 1100, running: 120, reliability: 0.82, cargos: ['SWEETS'], optIn: 'toyland', news: false },
  { id: 'wag_sugar', name: 'Sugar Wagon', kind: 'wagon', introYear: 1920, speed: 0, capacity: 30, cost: 1000, running: 120, reliability: 0.82, cargos: ['SUGAR'], optIn: 'toyland', news: false },
  { id: 'wag_toys', name: 'Toy Wagon', kind: 'wagon', introYear: 1920, speed: 0, capacity: 28, cost: 1100, running: 120, reliability: 0.82, cargos: ['TOYS'], optIn: 'toyland', news: false },
  { id: 'wag_batteries', name: 'Battery Wagon', kind: 'wagon', introYear: 1920, speed: 0, capacity: 24, cost: 1100, running: 120, reliability: 0.82, cargos: ['BATTERIES'], optIn: 'toyland', news: false },
  { id: 'wag_candyfloss', name: 'Candyfloss Wagon', kind: 'wagon', introYear: 1920, speed: 0, capacity: 26, cost: 1100, running: 120, reliability: 0.82, cargos: ['CANDYFLOSS'], optIn: 'toyland', news: false },
  { id: 'wag_toffee', name: 'Toffee Wagon', kind: 'wagon', introYear: 1920, speed: 0, capacity: 30, cost: 1100, running: 120, reliability: 0.82, cargos: ['TOFFEE'], optIn: 'toyland', news: false },
  { id: 'wag_cola', name: 'Cola Tank Wagon', kind: 'wagon', introYear: 1920, speed: 0, capacity: 28, cost: 1100, running: 120, reliability: 0.82, cargos: ['COLA'], optIn: 'toyland', news: false },
  { id: 'wag_bubbles', name: 'Bubble Wagon', kind: 'wagon', introYear: 1920, speed: 0, capacity: 24, cost: 1100, running: 120, reliability: 0.82, cargos: ['BUBBLES'], optIn: 'toyland', news: false },
  { id: 'wag_plastic', name: 'Plastic Tank Wagon', kind: 'wagon', introYear: 1920, speed: 0, capacity: 28, cost: 1100, running: 120, reliability: 0.82, cargos: ['PLASTIC'], optIn: 'toyland', news: false },
  { id: 'wag_fizzy', name: 'Fizzy Drinks Wagon', kind: 'wagon', introYear: 1920, speed: 0, capacity: 26, cost: 1100, running: 120, reliability: 0.82, cargos: ['FIZZY_DRINKS'], optIn: 'toyland', news: false },
];

export const ELECTRIC_VEHICLE_MODELS = [
  { id: 'eng_volt', name: 'Volt Electric', kind: 'engine', traction: 'electric', optIn: 'electric', introYear: 1955, obsoleteYear: 1995, speed: 144, capacity: 0, cost: 17000, running: 4200, reliability: 0.89, power: 2400, news: false },
  { id: 'eng_spark', name: 'Spark Electric', kind: 'engine', traction: 'electric', optIn: 'electric', introYear: 1985, speed: 200, capacity: 0, cost: 30000, running: 6000, reliability: 0.92, power: 3400, news: false },
];

/** TY5: OpenTTD toyland buses and locos (table/engines.h Y climate; Ploddyphut/Powernaut/MightyMover). optIn 'toyland'.
 * Temperate buses and locos are hidden in toyland games once one of these is purchasable (vehicles.js modelAvailable). */
export const TOYLAND_BUS_LOCO_MODELS = [
  { id: 'bus_ploddy1', name: 'Ploddyphut MkI Bus', kind: 'bus', introYear: 1945, obsoleteYear: 1982, speed: 56, capacity: 30, cost: 4200, running: 900, reliability: 0.8, cargos: ['PASS'], optIn: 'toyland', news: false },
  { id: 'bus_ploddy2', name: 'Ploddyphut MkII Bus', kind: 'bus', introYear: 1972, obsoleteYear: 2020, speed: 96, capacity: 35, cost: 4900, running: 1700, reliability: 0.84, cargos: ['PASS'], optIn: 'toyland', news: false },
  { id: 'bus_ploddy3', name: 'Ploddyphut MkIII Bus', kind: 'bus', introYear: 2010, speed: 120, capacity: 38, cost: 5600, running: 2400, reliability: 0.88, cargos: ['PASS'], optIn: 'toyland', news: false },
  { id: 'eng_ploddy_choo', name: 'Ploddyphut Choo-Choo', kind: 'engine', introYear: 1946, speed: 80, capacity: 0, cost: 6000, running: 1800, reliability: 0.78, power: 600, optIn: 'toyland', news: false },
  { id: 'eng_powernaut_choo', name: 'Powernaut Choo-Choo', kind: 'engine', introYear: 1952, speed: 80, capacity: 0, cost: 6000, running: 1800, reliability: 0.8, power: 600, optIn: 'toyland', news: false },
  { id: 'eng_mighty_choo', name: 'Mightymover Choo-Choo', kind: 'engine', introYear: 1966, speed: 48, capacity: 0, cost: 6200, running: 1800, reliability: 0.8, power: 600, optIn: 'toyland', news: false },
  { id: 'eng_powernaut_diesel', name: 'Powernaut Diesel', kind: 'engine', introYear: 1977, speed: 48, capacity: 0, cost: 9000, running: 2600, reliability: 0.86, power: 800, optIn: 'toyland', news: false },
  { id: 'eng_ploddy_diesel', name: 'Ploddyphut Diesel', kind: 'engine', introYear: 1972, speed: 48, capacity: 0, cost: 8500, running: 2500, reliability: 0.84, power: 700, optIn: 'toyland', news: false },
];

/**
 * Monorail and maglev trains (OpenTTD engines.h): engine rows 54-56 (monorail, RAILTYPE_MONO) and 84-88 (maglev,
 * RAILTYPE_MAGLEV), wagons rows 57 / 89 (passenger) and 63 / 95 (goods). Intro = OpenTTD intro day offset from 1920 (engines.h, e.g. X2001
 * 28490 -> 1998, Lev1 36525 -> 2020). Stats are derived, not copied: speed = OTTD max_speed / 2 (km/h),
 * cost ~ cost_factor * 250 (rounded), power ~ OTTD power / 3, capacity = OTTD capacity. Approximations, not a copy.
 * railType: the track type the train needs (rail_type.h). Engines and wagons of one type only run on that track.
 * optIn 'mono' / 'maglev': offered only when that track type exists on the map (modelAvailable, vehicles.js).
 */
export const RAIL_TYPE_VEHICLE_MODELS = [
  { id: 'eng_mono_x2001', name: "X2001 Monorail", kind: 'engine', traction: 'monorail', railType: 2, optIn: 'mono', introYear: 1998, speed: 152, capacity: 0, cost: 13000, running: 4500, reliability: 0.9, power: 3000, news: false },
  { id: 'eng_mono_z99', name: 'Wizzowow Z99 Monorail', kind: 'engine', traction: 'monorail', railType: 2, optIn: 'mono', introYear: 1999, speed: 160, capacity: 0, cost: 13250, running: 4300, reliability: 0.88, power: 1667, news: false },
  { id: 'eng_mono_z1', name: 'Millennium Z1 Monorail', kind: 'engine', traction: 'monorail', railType: 2, optIn: 'mono', introYear: 2005, speed: 168, capacity: 0, cost: 15000, running: 5200, reliability: 0.92, power: 3300, news: false },
  { id: 'eng_maglev_lev1', name: 'Lev1 Leviathan Maglev', kind: 'engine', traction: 'maglev', railType: 3, optIn: 'maglev', introYear: 2020, speed: 200, capacity: 0, cost: 17500, running: 6000, reliability: 0.92, power: 3300, news: false },
  { id: 'eng_maglev_lev2', name: 'Lev2 Cyclops Maglev', kind: 'engine', traction: 'maglev', railType: 3, optIn: 'maglev', introYear: 2028, speed: 224, capacity: 0, cost: 18500, running: 6500, reliability: 0.93, power: 4000, news: false },
  { id: 'eng_maglev_lev3', name: 'Lev3 Pegasus Maglev', kind: 'engine', traction: 'maglev', railType: 3, optIn: 'maglev', introYear: 2035, speed: 240, capacity: 0, cost: 20500, running: 7000, reliability: 0.94, power: 5000, news: false },
  { id: 'wag_mono_pass', name: 'Monorail Passenger Carriage', kind: 'wagon', railType: 2, optIn: 'mono', introYear: 1998, speed: 0, capacity: 45, cost: 1400, running: 150, reliability: 1, cargos: ['PASS'], news: false },
  { id: 'wag_mono_goods', name: 'Monorail Goods Van', kind: 'wagon', railType: 2, optIn: 'mono', introYear: 1998, speed: 0, capacity: 37, cost: 1300, running: 150, reliability: 1, cargos: ['GOOD'], news: false },
  { id: 'wag_mono_coal', name: 'Monorail Coal Hopper', kind: 'wagon', railType: 2, optIn: 'mono', introYear: 1998, speed: 0, capacity: 30, cost: 1300, running: 150, reliability: 1, cargos: ['COAL'], news: false },
  { id: 'wag_maglev_pass', name: 'Maglev Passenger Carriage', kind: 'wagon', railType: 3, optIn: 'maglev', introYear: 2020, speed: 0, capacity: 45, cost: 1600, running: 150, reliability: 1, cargos: ['PASS'], news: false },
  { id: 'wag_maglev_goods', name: 'Maglev Goods Van', kind: 'wagon', railType: 3, optIn: 'maglev', introYear: 2020, speed: 0, capacity: 37, cost: 1500, running: 150, reliability: 1, cargos: ['GOOD'], news: false },
];

export const ALL_VEHICLE_MODELS = [...VEHICLE_MODELS, ...AIRCRAFT_MODELS, ...SHIP_MODELS, ...EXTRA_VEHICLE_MODELS, ...TOYLAND_VEHICLE_MODELS, ...TOYLAND_BUS_LOCO_MODELS, ...ELECTRIC_VEHICLE_MODELS, ...TRAM_VEHICLE_MODELS, ...RAIL_TYPE_VEHICLE_MODELS, ...ARTIC_VEHICLE_MODELS];

/** Lookup by id. */
export const MODEL_BY_ID = Object.fromEntries(ALL_VEHICLE_MODELS.map((m) => [m.id, m]));

/** Ticks a vehicle needs to reach max speed from standstill. */
export const ACCEL_TICKS = { train: 90, road: 40, aircraft: 30 };
