/**
 * Industry placement and monthly production / processing.
 */
import { INDUSTRY_TYPES, INDUSTRY_BY_ID, EXTRA_INDUSTRY_TYPES, TROPIC_INDUSTRY_TYPES, TOYLAND_INDUSTRY_TYPES, EXTRA_TOWN_RADIUS } from '../config/industries.js';
import { tropicZoneAt, isToyland } from './climate.js';
import { allocId, manhattan } from './state.js';
import { getSetting } from './settings.js';
import { plantInitialFields } from './farmFields.js';
import { industryName } from './naming.js';
import { receiveCargo, ensureIndustryState } from './loco/industry.js';

/**
 * Check whether an industry of the given type fits at (x,y) (top-left).
 * Requires flat-ish free land (no water/buildings/track) with a 1-tile free border.
 * @param {object} state
 * @param {object} type industry type
 * @param {number} x
 * @param {number} y
 * @param {{ignoreSpacing?:boolean}} [opts]
 */
export function canPlaceIndustry(state, type, x, y, opts = {}) {
  const { map } = state;
  if (x < 1 || y < 1 || x + type.w >= map.width || y + type.h >= map.height) return false;
  let hmin = 9, hmax = -1;
  for (let yy = y - 1; yy <= y + type.h; yy++) {
    for (let xx = x - 1; xx <= x + type.w; xx++) {
      const t = map.tiles[yy * map.width + xx];
      const inner = xx >= x && yy >= y && xx < x + type.w && yy < y + type.h;
      if (t.building || t.rail || t.road) return false;
      if (inner) {
        if (t.terrain === 'water') return false;
        hmin = Math.min(hmin, t.height); hmax = Math.max(hmax, t.height);
      }
    }
  }
  if (hmax - hmin > 1) return false;
  // T29 bank (OpenTTD IndustryBehaviour::Town): must lie within EXTRA_TOWN_RADIUS of a town of 1200+ people
  const inTown = type.placement === 'inTown';
  if (inTown && !townQualifiesFor(state, type, x, y)) return false;
  // OpenTTD economy.multiple_industry_per_town: by default only one industry
  // of each type may sit within EXTRA_TOWN_RADIUS of the same town.
  if ((type.placement === 'inTown' || type.placement === 'extraTown') && !getSetting(state, 'multipleIndustryPerTown')) {
    for (const o of state.industries) {
      if (o.typeId !== type.id) continue;
      for (const t of state.towns) {
        if (manhattan(t.x, t.y, x, y) <= EXTRA_TOWN_RADIUS && manhattan(t.x, t.y, o.x, o.y) <= EXTRA_TOWN_RADIUS) return false;
      }
    }
  }
  if (!opts.ignoreSpacing) {
    for (const o of state.industries) {
      if (manhattan(o.x, o.y, x, y) < 9) return false;
    }
    if (!inTown) {
      for (const t of state.towns) {
        if (manhattan(t.x, t.y, x, y) < 8) return false;
      }
    }
  }
  return true;
}

/** A qualifying town (population >= type.minTownPop) within EXTRA_TOWN_RADIUS of tile (x,y). */
function townQualifiesFor(state, type, x, y) {
  return state.towns.some((t) => (t.population || 0) >= (type.minTownPop || 0) && manhattan(t.x, t.y, x, y) <= EXTRA_TOWN_RADIUS);
}

/** Whether the fund-industry picker should offer the bank (a qualifying town exists). */
export function bankAvailable(state) {
  return EXTRA_INDUSTRY_TYPES.some((type) => type.placement === 'inTown' && state.towns.some((t) => (t.population || 0) >= (type.minTownPop || 0)));
}

/**
 * Opt-in (extraIndustries): one bank per qualifying town, tried at random sites around the town centre.
 * Uses game rng only when the setting is on.
 */
export function placeExtraIndustries(state, rng) {
  for (const town of state.towns.slice()) {
    for (const type of EXTRA_INDUSTRY_TYPES) {
      if (type.placement !== 'inTown' || (town.population || 0) < (type.minTownPop || 0)) continue;
      if (!getSetting(state, 'multipleIndustryPerTown') && state.industries.some((i) => i.typeId === type.id && manhattan(i.x, i.y, town.x, town.y) <= EXTRA_TOWN_RADIUS)) continue;
      for (let attempt = 0; attempt < 60; attempt++) {
        const x = town.x + rng.int(-EXTRA_TOWN_RADIUS, EXTRA_TOWN_RADIUS);
        const y = town.y + rng.int(-EXTRA_TOWN_RADIUS, EXTRA_TOWN_RADIUS);
        if (canPlaceIndustry(state, type, x, y)) { placeIndustry(state, type.id, x, y); break; }
      }
    }
  }
  placeChainIndustries(state, rng);
}

/**
 * T-IN opt-in chain industries (quarry, paper mill, printing works, building materials, food plant).
 * 'extraTown': a random site within EXTRA_TOWN_RADIUS of a town; 'extraRural': anywhere. extraCount per map.
 * Uses game rng only when extraIndustries is on (called only from placeExtraIndustries).
 */
export function placeChainIndustries(state, rng) {
  const { map } = state;
  for (const type of EXTRA_INDUSTRY_TYPES) {
    if (type.placement !== 'extraTown' && type.placement !== 'extraRural') continue;
    for (let n = 0; n < (type.extraCount || 0); n++) {
      for (let attempt = 0; attempt < 200; attempt++) {
        let x, y;
        if (type.placement === 'extraTown') {
          if (!state.towns.length) break;
          const town = state.towns[rng.int(0, state.towns.length - 1)];
          x = town.x + rng.int(-EXTRA_TOWN_RADIUS, EXTRA_TOWN_RADIUS);
          y = town.y + rng.int(-EXTRA_TOWN_RADIUS, EXTRA_TOWN_RADIUS);
        } else {
          x = rng.int(2, map.width - type.w - 3);
          y = rng.int(2, map.height - type.h - 3);
        }
        if (canPlaceIndustry(state, type, x, y)) { placeIndustry(state, type.id, x, y); break; }
      }
    }
  }
}

/**
 * Place an industry (no validation beyond bounds). Exported for scenarios/tests.
 * @param {object} state
 * @param {string} typeId
 * @param {number} x top-left x
 * @param {number} y top-left y
 * @returns {object} industry record
 */
/**
 * TP tropic mapgen: water supplies in the countryside (extraCount) and one water tower in each town (1x1 inside the
 * town radius). Uses game rng only in tropic games (called only from game.create when isTropic).
 */
export function placeTropicIndustries(state, rng) {
  const water = TROPIC_INDUSTRY_TYPES.find((t) => t.id === 'water_supply');
  for (let n = 0; n < water.extraCount; n++) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = rng.int(2, state.map.width - water.w - 3);
      const y = rng.int(2, state.map.height - water.h - 3);
      if (canPlaceIndustry(state, water, x, y)) { placeIndustry(state, water.id, x, y); break; }
    }
  }
  const tower = TROPIC_INDUSTRY_TYPES.find((t) => t.id === 'water_tower');
  for (const town of state.towns.slice()) {
    if (state.industries.some((i) => i.typeId === tower.id && manhattan(i.x, i.y, town.x, town.y) <= EXTRA_TOWN_RADIUS)) continue;
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = town.x + rng.int(-EXTRA_TOWN_RADIUS, EXTRA_TOWN_RADIUS);
      const y = town.y + rng.int(-EXTRA_TOWN_RADIUS, EXTRA_TOWN_RADIUS);
      if (canPlaceIndustry(state, tower, x, y)) { placeIndustry(state, tower.id, x, y); break; }
    }
  }
}

/**
 * TP tropic mapgen: the OpenTTD sub-tropical chain (rubber, fruit, maize, copper ore, diamonds, lumber mill, factory,
 * food plant, bank). Placement per type (placement field): 'tropicOpen' plantations never in the desert (zone 1);
 * 'tropicRainforest' lumber mill only in the rainforest (zone 2, OpenTTD IndustryCheck::Lumbermill); 'tropicAny' mines
 * and maize farm anywhere; 'tropicTown' processors within EXTRA_TOWN_RADIUS of a town; 'tropicBank' banks in towns.
 * Uses game rng only in tropic games (called only from game.create when isTropic). Deterministic.
 */
export function placeTropicChains(state, rng) {
  const { map } = state;
  for (const type of TROPIC_INDUSTRY_TYPES) {
    if (type.placement !== 'tropicOpen' && type.placement !== 'tropicRainforest' && type.placement !== 'tropicAny') continue;
    for (let n = 0; n < (type.extraCount || 0); n++) {
      for (let attempt = 0; attempt < 200; attempt++) {
        const x = rng.int(2, map.width - type.w - 3);
        const y = rng.int(2, map.height - type.h - 3);
        const zone = tropicZoneAt(map, x, y);
        if (type.placement === 'tropicOpen' && zone === 1) continue;
        if (type.placement === 'tropicRainforest' && zone !== 2) continue;
        if (canPlaceIndustry(state, type, x, y)) { placeIndustry(state, type.id, x, y); break; }
      }
    }
  }
  for (const type of TROPIC_INDUSTRY_TYPES) {
    if (type.placement !== 'tropicTown' && type.placement !== 'tropicBank') continue;
    for (let n = 0; n < (type.extraCount || 0); n++) {
      if (!state.towns.length) break;
      for (let attempt = 0; attempt < 200; attempt++) {
        const town = state.towns[rng.int(0, state.towns.length - 1)];
        if ((town.population || 0) < (type.minTownPop || 0)) continue;
        const x = town.x + rng.int(-EXTRA_TOWN_RADIUS, EXTRA_TOWN_RADIUS);
        const y = town.y + rng.int(-EXTRA_TOWN_RADIUS, EXTRA_TOWN_RADIUS);
        if (manhattan(x, y, town.x, town.y) > EXTRA_TOWN_RADIUS) continue;
        if (canPlaceIndustry(state, type, x, y)) { placeIndustry(state, type.id, x, y); break; }
      }
    }
  }
}

export function placeIndustry(state, typeId, x, y) {
  const type = INDUSTRY_BY_ID[typeId];
  if (!type) throw new Error(`Unknown industry type ${typeId}`);
  const { map } = state;
  const ind = {
    id: allocId(state), typeId, name: industryName(state, type, x, y), x, y, w: type.w, h: type.h,
    production: { ...type.production }, stock: {}, producedLastMonth: {}, transportedLastMonth: {},
    producedThisMonth: {}, transportedThisMonth: {}, deliveredThisMonth: {}, deliveredLastMonth: {},
  };
  let part = 0;
  for (let yy = y; yy < y + type.h; yy++) {
    for (let xx = x; xx < x + type.w; xx++) {
      const t = map.tiles[yy * map.width + xx];
      if (t.terrain === 'water' || t.terrain === 'forest' || t.terrain === 'rock' || t.terrain === 'snow') t.terrain = 'grass';
      t.building = { type: 'industry', industryId: ind.id, part: part++ };
      t.owner = null;
      t.rail = 0; t.road = 0;
      if (t.field !== undefined) delete t.field; // a field under a new building is cleared
    }
  }
  ensureIndustryState(ind, state);
  if (getSetting(state, 'farmFields')) plantInitialFields(state, ind); // T29 opt-in: no RNG draws
  state.industries.push(ind);
  return ind;
}

/**
 * Generate ~count industries covering all types (round-robin, shuffled order).
 */
/** TY2: the primary/processing industry set of a game: toyland games get the toyland set only, others INDUSTRY_TYPES. */
/** Raw (primary) industry type: takes no input cargo (OpenTTD IndustrySpec::IsRawIndustry). */
export function isRawIndustryType(t) {
  return !(t.accepts && t.accepts.length);
}

/** Industry types available for generation and monthly spawns. spawnPrimaryIndustryOnly keeps raw types only (default: all). */
export function industryTypesFor(state) {
  const base = isToyland(state) ? TOYLAND_INDUSTRY_TYPES : INDUSTRY_TYPES;
  return getSetting(state, 'spawnPrimaryIndustryOnly') ? base.filter(isRawIndustryType) : base;
}

export function generateIndustries(state, rng, count) {
  const { map } = state;
  const order = [];
  while (order.length < count) {
    const batch = industryTypesFor(state).map((t) => t.id);
    if (!batch.length) break; // no type allowed (e.g. primary-only with no raw type): avoid an endless loop
    for (let i = batch.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [batch[i], batch[j]] = [batch[j], batch[i]];
    }
    order.push(...batch);
  }
  order.length = count;
  // make sure every type appears at least once when count >= types
  for (const typeId of order) {
    const type = INDUSTRY_BY_ID[typeId];
    for (let attempt = 0; attempt < 400; attempt++) {
      const x = rng.int(2, map.width - type.w - 3), y = rng.int(2, map.height - type.h - 3);
      if (canPlaceIndustry(state, type, x, y, { ignoreSpacing: attempt > 300 })) {
        placeIndustry(state, typeId, x, y);
        break;
      }
    }
  }
}

/**
 * Tiles of an industry.
 * @returns {{x:number,y:number}[]}
 */
export function industryTiles(ind) {
  const out = [];
  for (let y = ind.y; y < ind.y + ind.h; y++) for (let x = ind.x; x < ind.x + ind.w; x++) out.push({ x, y });
  return out;
}

/**
 * Record a delivery of cargo to an industry (OpenLoco: received cargo counters, processed daily).
 */
export function deliverToIndustry(ind, cargoId, amount) {
  receiveCargo(ind, cargoId, amount);
}

/** Industry type record for an industry. */
export function industryType(ind) {
  return INDUSTRY_BY_ID[ind.typeId];
}
