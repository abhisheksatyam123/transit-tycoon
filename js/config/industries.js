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

/**
 * T29 extra types (OpenTTD temperate bank: produces and accepts Valuables, built inside a town of 1200+ people).
 * Not in INDUSTRY_TYPES: mapgen adds them only when the extraIndustries setting is on, and monthly creation never does.
 * placement 'inTown': 1x2 free site (OpenTTD bank footprint, so the OpenGFX art fits) within EXTRA_TOWN_RADIUS of a town with population >= minTownPop.
 */
export const EXTRA_INDUSTRY_TYPES = [
  { id: 'bank', name: 'Bank', w: 1, h: 2, produces: ['VALU'], accepts: ['VALU'], converts: { VALU: 'VALU' }, production: { VALU: 40 }, color: '#a3a3a3', totalOfType: 1, monthlyClosureChance: 0, placement: 'inTown', minTownPop: 1200 },
  // T-IN (OpenLoco-style chains, opt-in extraIndustries): quarry -> building materials; wood -> paper -> printing (goods);
  // grain/livestock -> food. Towns accept FOOD and BMAT like GOOD. placement 'extraTown' = within EXTRA_TOWN_RADIUS of a
  // town; 'extraRural' = anywhere (spacing rules as usual). extraCount = how many are placed on a new map.
  { id: 'quarry', name: 'Quarry', w: 3, h: 3, produces: ['STON'], accepts: [], converts: {}, production: { STON: 100 }, color: '#78716c', totalOfType: 2, monthlyClosureChance: 40, placement: 'extraRural', extraCount: 2 },
  { id: 'paper_mill', name: 'Paper Mill', w: 3, h: 4, produces: ['PAPR'], accepts: ['WOOD'], converts: { WOOD: 'PAPR' }, production: {}, color: '#d6d3d1', totalOfType: 2, monthlyClosureChance: 0, placement: 'extraTown', extraCount: 2 },
  { id: 'printing_works', name: 'Printing Works', w: 4, h: 4, produces: ['GOOD'], accepts: ['PAPR'], converts: { PAPR: 'GOOD' }, production: {}, color: '#7c3aed', totalOfType: 2, monthlyClosureChance: 0, placement: 'extraTown', extraCount: 2 },
  { id: 'building_materials', name: 'Building Materials Plant', w: 3, h: 3, produces: ['BMAT'], accepts: ['STON'], converts: { STON: 'BMAT' }, production: {}, color: '#a8a29e', totalOfType: 2, monthlyClosureChance: 0, placement: 'extraTown', extraCount: 2 },
  { id: 'food_plant', name: 'Food Processing Plant', w: 4, h: 3, produces: ['FOOD'], accepts: ['GRAI', 'LVST'], converts: { GRAI: 'FOOD', LVST: 'FOOD' }, production: {}, color: '#f97316', totalOfType: 2, monthlyClosureChance: 0, placement: 'extraTown', extraCount: 2 },
];
export const EXTRA_TOWN_RADIUS = 16;

/** Lookup by id (default and extra types). */
/**
 * TP tropic-only industries (OpenTTD sub-tropical IT_WATER_SUPPLY, IT_WATER_TOWER). Placed only by the tropic mapgen
 * (placeTropicIndustries, isTropic); never by monthly creation. Water supply: 2x2 primary producer of WATER, placed in
 * the open countryside (extraRural rule). Water tower: 1x1 industry built inside a town, accepts WATER.
 */
export const TROPIC_INDUSTRY_TYPES = [
  { id: 'water_supply', name: 'Water Supply', w: 2, h: 2, produces: ['WATER'], accepts: [], converts: {}, production: { WATER: 90 }, color: '#0ea5e9', totalOfType: 2, monthlyClosureChance: 40, placement: 'extraRural', extraCount: 2 },
  { id: 'water_tower', name: 'Water Tower', w: 1, h: 1, produces: [], accepts: ['WATER'], converts: {}, production: {}, color: '#38bdf8', totalOfType: 2, monthlyClosureChance: 0, placement: 'inTown', minTownPop: 0, extraCount: 1 },
  // TP sub-tropical chain (OpenTTD build_industry.h; footprints = OTTD layout extents, w = OTTD Y extent, h = OTTD X extent).
  // Placed only by placeTropicChains (tropic mapgen). Primaries: plantations not in the desert (tropicOpen), rainforest
  // lumber mill (tropicRainforest), mines and maize farm anywhere. Processors and banks sit in towns (tropicTown).
  { id: 'rubber_plantation', name: 'Rubber Plantation', w: 4, h: 5, produces: ['RUBBER'], accepts: [], converts: {}, production: { RUBBER: 90 }, color: '#1f2937', totalOfType: 2, monthlyClosureChance: 40, placement: 'tropicOpen', extraCount: 2 },
  { id: 'fruit_plantation', name: 'Fruit Plantation', w: 4, h: 5, produces: ['FRUIT'], accepts: [], converts: {}, production: { FRUIT: 90 }, color: '#e11d48', totalOfType: 2, monthlyClosureChance: 40, placement: 'tropicOpen', extraCount: 2 },
  { id: 'maize_farm', name: 'Maize Farm', w: 3, h: 3, produces: ['MAIZE'], accepts: [], converts: {}, production: { MAIZE: 80 }, color: '#facc15', totalOfType: 2, monthlyClosureChance: 40, placement: 'tropicAny', extraCount: 2 },
  { id: 'copper_mine', name: 'Copper Ore Mine', w: 3, h: 3, produces: ['COPPER_ORE'], accepts: [], converts: {}, production: { COPPER_ORE: 100 }, color: '#b45309', totalOfType: 2, monthlyClosureChance: 40, placement: 'tropicAny', extraCount: 2 },
  { id: 'diamond_mine', name: 'Diamond Mine', w: 3, h: 3, produces: ['DIAMONDS'], accepts: [], converts: {}, production: { DIAMONDS: 60 }, color: '#67e8f9', totalOfType: 1, monthlyClosureChance: 40, placement: 'tropicAny', extraCount: 1 },
  { id: 'lumber_mill', name: 'Lumber Mill', w: 2, h: 2, produces: ['WOOD'], accepts: [], converts: {}, production: { WOOD: 100 }, color: '#78350f', totalOfType: 2, monthlyClosureChance: 40, placement: 'tropicRainforest', extraCount: 2 },
  { id: 'factory_tropic', name: 'Factory', w: 2, h: 4, produces: ['GOOD'], accepts: ['RUBBER', 'COPPER_ORE', 'WOOD'], converts: { RUBBER: 'GOOD', COPPER_ORE: 'GOOD', WOOD: 'GOOD' }, production: {}, color: '#7c2d12', totalOfType: 2, monthlyClosureChance: 0, placement: 'tropicTown', extraCount: 2 },
  { id: 'food_plant_tropic', name: 'Food Processing Plant', w: 4, h: 3, produces: ['FOOD'], accepts: ['FRUIT', 'MAIZE'], converts: { FRUIT: 'FOOD', MAIZE: 'FOOD' }, production: {}, color: '#f97316', totalOfType: 2, monthlyClosureChance: 0, placement: 'tropicTown', extraCount: 2 },
  { id: 'bank_tropic', name: 'Bank', w: 1, h: 2, produces: [], accepts: ['DIAMONDS'], converts: {}, production: {}, color: '#a3a3a3', totalOfType: 2, monthlyClosureChance: 0, placement: 'tropicBank', minTownPop: 0, extraCount: 2 },
];

/**
 * TY2 toyland industries (OpenTTD build_industry.h, LandscapeType::Toyland). Only toyland games use this set: the map
 * generator (generateIndustries), monthly creation and the fund list pick it instead of INDUSTRY_TYPES when
 * isToyland(state). Footprints are our approximations (procedural art, no OpenGFX industry sprites yet).
 * Chain: cotton candy forest -> sweet factory (+ sugar mine, toffee quarry) -> sweets -> towns;
 * battery farm + plastic fountains -> toy factory -> toys -> toy shop; cola wells + bubble generator -> fizzy drink factory -> fizzy drinks -> towns.
 */
export const TOYLAND_INDUSTRY_TYPES = [
  { id: 'cotton_candy_forest', name: 'Cotton Candy Forest', w: 5, h: 4, produces: ['CANDYFLOSS'], accepts: [], converts: {}, production: { CANDYFLOSS: 100 }, color: '#f9a8d4', totalOfType: 3, monthlyClosureChance: 40, placement: 'awayTown', builtInClusters: true },
  { id: 'sweet_factory', name: 'Sweet Factory', w: 4, h: 4, produces: ['SWEETS'], accepts: ['SUGAR', 'TOFFEE', 'CANDYFLOSS'], converts: { SUGAR: 'SWEETS', TOFFEE: 'SWEETS', CANDYFLOSS: 'SWEETS' }, production: {}, color: '#ec4899', totalOfType: 2, monthlyClosureChance: 0, placement: 'nearTown' },
  { id: 'plastic_fountains', name: 'Plastic Fountains', w: 3, h: 1, produces: ['PLASTIC'], accepts: [], converts: {}, production: { PLASTIC: 100 }, color: '#7dd3fc', totalOfType: 2, monthlyClosureChance: 40, placement: 'awayTown', builtInClusters: true },
  { id: 'toffee_quarry', name: 'Toffee Quarry', w: 1, h: 3, produces: ['TOFFEE'], accepts: [], converts: {}, production: { TOFFEE: 100 }, color: '#92400e', totalOfType: 2, monthlyClosureChance: 40, placement: 'awayTown', builtInClusters: true },
  { id: 'cola_wells', name: 'Cola Wells', w: 3, h: 3, produces: ['COLA'], accepts: [], converts: {}, production: { COLA: 90 }, color: '#451a03', totalOfType: 2, monthlyClosureChance: 40, placement: 'awayTown', builtInClusters: true },
  { id: 'fizzy_drink_factory', name: 'Fizzy Drink Factory', w: 2, h: 2, produces: ['FIZZY_DRINKS'], accepts: ['COLA', 'BUBBLES'], converts: { COLA: 'FIZZY_DRINKS', BUBBLES: 'FIZZY_DRINKS' }, production: {}, color: '#10b981', totalOfType: 2, monthlyClosureChance: 0, placement: 'nearTown' },
  { id: 'bubble_generator', name: 'Bubble Generator', w: 4, h: 3, produces: ['BUBBLES'], accepts: [], converts: {}, production: { BUBBLES: 90 }, color: '#e0f2fe', totalOfType: 1, monthlyClosureChance: 40, placement: 'awayTown' },
  { id: 'battery_farm', name: 'Battery Farm', w: 4, h: 5, produces: ['BATTERIES'], accepts: [], converts: {}, production: { BATTERIES: 100 }, color: '#65a30d', totalOfType: 2, monthlyClosureChance: 40, placement: 'awayTown', builtInClusters: true },
  { id: 'toy_factory', name: 'Toy Factory', w: 2, h: 4, produces: ['TOYS'], accepts: ['PLASTIC', 'BATTERIES'], converts: { PLASTIC: 'TOYS', BATTERIES: 'TOYS' }, production: {}, color: '#c026d3', totalOfType: 2, monthlyClosureChance: 0, placement: 'nearTown' },
  { id: 'toy_shop', name: 'Toy Shop', w: 2, h: 2, produces: [], accepts: ['TOYS'], converts: {}, production: {}, color: '#f0abfc', totalOfType: 2, monthlyClosureChance: 0, placement: 'nearTown' },
  { id: 'sugar_mine', name: 'Sugar Mine', w: 2, h: 4, produces: ['SUGAR'], accepts: [], converts: {}, production: { SUGAR: 110 }, color: '#f5f5f4', totalOfType: 2, monthlyClosureChance: 40, placement: 'awayTown', builtInClusters: true },
];

export const INDUSTRY_BY_ID = Object.fromEntries([...INDUSTRY_TYPES, ...EXTRA_INDUSTRY_TYPES, ...TROPIC_INDUSTRY_TYPES, ...TOYLAND_INDUSTRY_TYPES].map((t) => [t.id, t]));

/** Fraction of delivered input converted into output units. */
export const CONVERSION_RATIO = 0.8;
