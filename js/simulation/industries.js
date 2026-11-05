/**
 * Industry placement and monthly production / processing.
 */
import { INDUSTRY_TYPES, INDUSTRY_BY_ID } from '../config/industries.js';
import { allocId, manhattan } from './state.js';
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
  if (!opts.ignoreSpacing) {
    for (const o of state.industries) {
      if (manhattan(o.x, o.y, x, y) < 9) return false;
    }
    for (const t of state.towns) {
      if (manhattan(t.x, t.y, x, y) < 8) return false;
    }
  }
  return true;
}

/**
 * Place an industry (no validation beyond bounds). Exported for scenarios/tests.
 * @param {object} state
 * @param {string} typeId
 * @param {number} x top-left x
 * @param {number} y top-left y
 * @returns {object} industry record
 */
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
    }
  }
  ensureIndustryState(ind, state);
  state.industries.push(ind);
  return ind;
}

/**
 * Generate ~count industries covering all types (round-robin, shuffled order).
 */
export function generateIndustries(state, rng, count) {
  const { map } = state;
  const order = [];
  while (order.length < count) {
    const batch = INDUSTRY_TYPES.map((t) => t.id);
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
