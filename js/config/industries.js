/**
 * Industry types. production: base units per month for primary industries.
 * accepts: cargos taken in; converts: {inputCargo: outputCargo} processed monthly.
 */
export const INDUSTRY_TYPES = [
  { id: 'coal_mine', name: 'Coal Mine', w: 3, h: 3, produces: ['COAL'], accepts: [], converts: {}, production: { COAL: 110 }, color: '#3f3f46', totalOfType: 4, monthlyClosureChance: 40, placement: 'awayTown', builtInClusters: true },
  { id: 'power_station', name: 'Power Station', w: 3, h: 3, produces: [], accepts: ['COAL'], converts: {}, production: {}, color: '#a16207', totalOfType: 3, monthlyClosureChance: 0, placement: 'nearTown' },
  { id: 'forest', name: 'Forest', w: 3, h: 3, produces: ['WOOD'], accepts: [], converts: {}, production: { WOOD: 100 }, color: '#166534', totalOfType: 3, monthlyClosureChance: 40, placement: 'nearTrees' },
  { id: 'sawmill', name: 'Sawmill', w: 3, h: 2, produces: ['GOOD'], accepts: ['WOOD'], converts: { WOOD: 'GOOD' }, production: {}, color: '#b45309', totalOfType: 2, monthlyClosureChance: 0, placement: 'nearTown' },
  { id: 'oil_wells', name: 'Oil Wells', w: 3, h: 3, produces: ['OIL'], accepts: [], converts: {}, production: { OIL: 90 }, color: '#1e293b', totalOfType: 2, monthlyClosureChance: 40, placement: 'awayTown', builtInClusters: true },
  { id: 'refinery', name: 'Oil Refinery', w: 4, h: 3, produces: ['GOOD'], accepts: ['OIL'], converts: { OIL: 'GOOD' }, production: {}, color: '#475569', totalOfType: 2, monthlyClosureChance: 0, placement: 'nearTown' },
  { id: 'farm', name: 'Farm', w: 3, h: 3, produces: ['GRAI', 'LVST'], accepts: [], converts: {}, production: { GRAI: 80, LVST: 60 }, color: '#ca8a04', totalOfType: 4, monthlyClosureChance: 40, placement: 'awayTown', builtInClusters: true },
  { id: 'factory', name: 'Factory', w: 3, h: 3, produces: ['GOOD'], accepts: ['GRAI', 'LVST', 'STEL'], converts: { GRAI: 'GOOD', LVST: 'GOOD', STEL: 'GOOD' }, production: {}, color: '#7c2d12', totalOfType: 3, monthlyClosureChance: 0, placement: 'nearTown' },
  { id: 'iron_mine', name: 'Iron Ore Mine', w: 3, h: 3, produces: ['IORE'], accepts: [], converts: {}, production: { IORE: 100 }, color: '#7f1d1d', totalOfType: 3, monthlyClosureChance: 40, placement: 'awayTown', builtInClusters: true },
  { id: 'steel_mill', name: 'Steel Mill', w: 4, h: 3, produces: ['STEL'], accepts: ['IORE'], converts: { IORE: 'STEL' }, production: {}, color: '#334155', totalOfType: 2, monthlyClosureChance: 0, placement: 'nearTown' },
];

/**
 * Extra fields used by the OpenLoco-style IndustryManager (js/simulation/loco/industryManager.js), mapping IndustryObject:
 *  totalOfType (totalOfTypeInScenario, 1..32), monthlyClosureChance (out of 65535), designedYear/obsoleteYear
 *  (default 0 / never), placement (builtNearTown / builtAwayFromTown / builtNearTrees flag).
 * Primary industries (no accepts) may raise/lower production (canIncrease/DecreaseProduction); requiresAllCargo is false for all.
 */
/** builtInClusters: a new one must lie near an existing one once 3 of the type exist. */
export const INDUSTRY_DEFAULT_YEARS = { designedYear: 0, obsoleteYear: 9999 };

/** Lookup by id. */
export const INDUSTRY_BY_ID = Object.fromEntries(INDUSTRY_TYPES.map((t) => [t.id, t]));

/** Fraction of delivered input converted into output units. */
export const CONVERSION_RATIO = 0.8;
