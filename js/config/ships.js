/**
 * Ship models (kind 'ship'), temperate set from OpenTTD table/engines.h + ship vehicle info (ship_cmd.cpp).
 * speed is the OpenTTD display speed in km/h (max_speed / 2 in the SVI table: 48 and 64 give 24 and 32 km/h), the same
 * unit as the other models, so ships are as slow as in OpenTTD. capacity is the OpenTTD load amount. running is
 * scaled from the SVI running_cost (140 / 90 / 150) to our yearly figures. cost is scaled to our money.
 * news: false, so the yearly "new vehicle" news never fires for ships (default games keep their news).
 */
export const SHIP_MODELS = [
  { id: 'ship_oiltanker', name: 'MPS Oil Tanker', kind: 'ship', introYear: 1928, speed: 24, capacity: 220, cost: 16000, running: 1000, reliability: 0.8, cargos: ['OIL'], news: false },
  { id: 'ship_ferry', name: 'MPS Passenger Ferry', kind: 'ship', introYear: 1926, speed: 32, capacity: 100, cost: 9000, running: 600, reliability: 0.82, cargos: ['PASS'], news: false },
  { id: 'ship_cargo', name: 'Yate Cargo Ship', kind: 'ship', introYear: 1927, speed: 24, capacity: 160, cost: 14000, running: 1100, reliability: 0.8, cargos: ['GOOD'], news: false },
];

/** Construction costs (before construction inflation): dock, ship depot, buoy. */
export const SHIP_COSTS = { dock: 900, depot: 1500, buoy: 500 };

/** Ticks a ship needs to reach its top speed from standstill. */
export const SHIP_ACCEL_TICKS = 120;
