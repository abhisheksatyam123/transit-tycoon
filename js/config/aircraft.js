/**
 * Aircraft models (kind 'aircraft'). Same shape as road/rail models in vehicles.js.
 * speed in km/h (converted with AIR_KMH_TO_TILES_PER_TICK), cost in money, running = yearly running cost.
 * shape: 'prop' | 'jet' | 'widebody' (renderer hint). Cargos: PASS (default) and MAIL.
 * Aircraft are not part of VEHICLE_MODELS news/yearly announcements (kept separate on purpose).
 */
export const AIRCRAFT_MODELS = [
  { id: 'ac_li2', name: 'Li-2 Prop Airliner', kind: 'aircraft', shape: 'prop', introYear: 1940, obsoleteYear: 1960, speed: 280, capacity: 24, cost: 60000, running: 9000, reliability: 0.8, cargos: ['PASS', 'MAIL'] },
  { id: 'ac_il14', name: 'Il-14 Twin Prop', kind: 'aircraft', shape: 'prop', introYear: 1950, obsoleteYear: 1977, speed: 350, capacity: 32, cost: 80000, running: 11000, reliability: 0.82, cargos: ['PASS', 'MAIL'] },
  { id: 'ac_tu104', name: 'Tu-104 Jet', kind: 'aircraft', shape: 'jet', introYear: 1956, obsoleteYear: 1977, speed: 750, capacity: 70, cost: 150000, running: 22000, reliability: 0.85, cargos: ['PASS', 'MAIL'] },
  { id: 'ac_tu134', name: 'Tu-134 Jet', kind: 'aircraft', shape: 'jet', introYear: 1967, obsoleteYear: 1998, speed: 850, capacity: 80, cost: 180000, running: 25000, reliability: 0.88, cargos: ['PASS', 'MAIL'] },
  { id: 'ac_il86', name: 'Il-86 Widebody', kind: 'aircraft', shape: 'widebody', introYear: 1980, obsoleteYear: 2005, speed: 900, capacity: 300, cost: 400000, running: 55000, reliability: 0.9, cargos: ['PASS', 'MAIL'] },
  { id: 'ac_a320', name: 'A320 Airliner', kind: 'aircraft', shape: 'jet', introYear: 1988, speed: 840, capacity: 170, cost: 260000, running: 35000, reliability: 0.93, cargos: ['PASS', 'MAIL'] },
  { id: 'ac_ssj100', name: 'SSJ-100 Regional Jet', kind: 'aircraft', shape: 'jet', introYear: 2011, speed: 830, capacity: 98, cost: 240000, running: 32000, reliability: 0.91, cargos: ['PASS', 'MAIL'] },
  { id: 'ac_tricario', name: 'Tricario Helicopter', kind: 'aircraft', helicopter: true, shape: 'heli', introYear: 1963, obsoleteYear: 1995, speed: 220, capacity: 20, cost: 70000, running: 14000, reliability: 0.86, cargos: ['PASS', 'MAIL'] },
  { id: 'ac_guru_x2', name: 'Guru X2 Helicopter', kind: 'aircraft', helicopter: true, shape: 'heli', introYear: 1997, speed: 300, capacity: 36, cost: 190000, running: 30000, reliability: 0.92, cargos: ['PASS', 'MAIL'] },
  { id: 'ac_b777', name: 'B777 Widebody', kind: 'aircraft', shape: 'widebody', introYear: 1995, speed: 900, capacity: 360, cost: 520000, running: 70000, reliability: 0.94, cargos: ['PASS', 'MAIL'] },
];
