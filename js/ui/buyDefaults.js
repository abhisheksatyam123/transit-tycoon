/**
 * F10 smart buy-window defaults: pick the model + cargo a Buy window should preselect from the
 * stations around the depot. Pure (no DOM); the window calls it once when it opens.
 */
import { listModels, stationsNear } from '../simulation/queries.js';
import { buildCoverage } from '../simulation/stations.js';
import { industryTiles, industryType } from '../simulation/industries.js';

const RADIUS = 12;
const PAX = new Set(['PASS', 'MAIL']);

/**
 * Freight cargos supplied at a set of stations (waiting cargo or a rating, i.e. a covering industry feeds it).
 * Most waiting first, then ids, so the choice is deterministic.
 * @param {any[]} stations
 * @returns {string[]}
 */
export function suppliedFreight(stations, state = null) {
  const amount = new Map();
  // covered industries: a producer inside a station's catchment feeds it (even before any cargo is waiting)
  if (state && state.industries && stations.length) {
    const ids = new Set(stations.map((s) => s.id));
    const cov = buildCoverage(state);
    const w = state.map.width;
    for (const ind of state.industries) {
      const type = industryType(ind);
      if (!type || !(type.produces || []).length) continue;
      const covered = industryTiles(ind).some((p) => (cov.get(p.y * w + p.x) || []).some((id) => ids.has(id)));
      if (!covered) continue;
      for (const c of type.produces) amount.set(c, (amount.get(c) || 0) + 1);
    }
  }
  for (const st of stations) {
    for (const c of Object.keys(st.cargo || {})) {
      if (PAX.has(c)) continue;
      amount.set(c, (amount.get(c) || 0) + packets(st.cargo[c]));
    }
    for (const c of Object.keys(st.rating || {})) {
      if (PAX.has(c)) continue;
      if (!amount.has(c)) amount.set(c, 0);
    }
  }
  return [...amount.keys()].sort((a, b) => amount.get(b) - amount.get(a) || (a < b ? -1 : a > b ? 1 : 0));
}

/** @param {any} v */
function packets(v) {
  if (typeof v === 'number') return v;
  if (!Array.isArray(v)) return 0;
  return v.reduce((s, p) => s + (p.amount || 0), 0);
}

/** Cheapest (then id) model in a list. */
function cheapest(models) {
  return models.slice().sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))[0] || null;
}

/**
 * @param {any} state
 * @param {any} depot  {kind, x, y, ...}
 * @returns {{modelId: string|null, cargo: string|null}} null fields mean "keep the window's default".
 */
export function chooseBuyDefaults(state, depot) {
  const none = { modelId: null, cargo: null };
  if (!depot || depot.kind !== 'road') return none;
  const near = stationsNear(state, depot.x, depot.y, RADIUS);
  const trucks = near.filter((st) => st.kinds && st.kinds.truck);
  const freight = suppliedFreight(trucks, state);
  const models = listModels(state, 'truck');
  for (const c of freight) {
    const carrying = models.filter((m) => (m.cargos || []).includes(c));
    const pick = cheapest(carrying);
    if (pick) return { modelId: pick.id, cargo: c };
  }
  const bus = cheapest(listModels(state, 'bus').filter((m) => (m.cargos || []).includes('PASS')));
  return bus ? { modelId: bus.id, cargo: 'PASS' } : none;
}
