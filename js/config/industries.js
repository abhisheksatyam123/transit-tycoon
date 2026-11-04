/**
 * Industry types. production: base units per month for primary industries.
 * accepts: cargos taken in; converts: {inputCargo: outputCargo} processed monthly.
 */
export const INDUSTRY_TYPES = [
  { id: 'coal_mine', name: 'Coal Mine', w: 3, h: 3, produces: ['COAL'], accepts: [], converts: {}, production: { COAL: 110 }, color: '#3f3f46' },
  { id: 'power_station', name: 'Power Station', w: 3, h: 3, produces: [], accepts: ['COAL'], converts: {}, production: {}, color: '#a16207' },
  { id: 'forest', name: 'Forest', w: 3, h: 3, produces: ['WOOD'], accepts: [], converts: {}, production: { WOOD: 100 }, color: '#166534' },
  { id: 'sawmill', name: 'Sawmill', w: 3, h: 2, produces: ['GOOD'], accepts: ['WOOD'], converts: { WOOD: 'GOOD' }, production: {}, color: '#b45309' },
  { id: 'oil_wells', name: 'Oil Wells', w: 3, h: 3, produces: ['OIL'], accepts: [], converts: {}, production: { OIL: 90 }, color: '#1e293b' },
  { id: 'refinery', name: 'Oil Refinery', w: 4, h: 3, produces: ['GOOD'], accepts: ['OIL'], converts: { OIL: 'GOOD' }, production: {}, color: '#475569' },
  { id: 'farm', name: 'Farm', w: 3, h: 3, produces: ['GRAI', 'LVST'], accepts: [], converts: {}, production: { GRAI: 80, LVST: 60 }, color: '#ca8a04' },
  { id: 'factory', name: 'Factory', w: 3, h: 3, produces: ['GOOD'], accepts: ['GRAI', 'LVST', 'STEL'], converts: { GRAI: 'GOOD', LVST: 'GOOD', STEL: 'GOOD' }, production: {}, color: '#7c2d12' },
  { id: 'iron_mine', name: 'Iron Ore Mine', w: 3, h: 3, produces: ['IORE'], accepts: [], converts: {}, production: { IORE: 100 }, color: '#7f1d1d' },
  { id: 'steel_mill', name: 'Steel Mill', w: 4, h: 3, produces: ['STEL'], accepts: ['IORE'], converts: { IORE: 'STEL' }, production: {}, color: '#334155' },
];

/** Lookup by id. */
export const INDUSTRY_BY_ID = Object.fromEntries(INDUSTRY_TYPES.map((t) => [t.id, t]));

/** Fraction of delivered input converted into output units. */
export const CONVERSION_RATIO = 0.8;
