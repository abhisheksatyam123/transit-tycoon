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
 * Freight cargos supplied at a set of stations, best first. Ranking (F13):
 *  1. cargo waiting at the stations (most packets first);
 *  2. cargo produced by a RAW industry (no inputs, e.g. rubber plantation) in a station's catchment;
 *  3. cargo only a PROCESSING industry outputs (factory GOOD with no input yet) ranks below raw producers;
 *  4. nearest producing industry to the depot (when given), then cargo id, so the choice is deterministic.
 * Rating-only cargos (no waiting, no covering producer) are kept last.
 * @param {any[]} stations
 * @param {any} [state]
 * @param {{x:number,y:number}|null} [depot]
 * @returns {string[]}
 */
export function suppliedFreight(stations, state = null, depot = null) {
  const waiting = new Map();
  const raw = new Map(); // cargo -> nearest raw producer distance
  const processed = new Map(); // cargo -> nearest processing producer distance
  // covered industries: a producer inside a station's catchment feeds it (even before any cargo is waiting)
  if (state && state.industries && stations.length) {
    const ids = new Set(stations.map((s) => s.id));
    const cov = buildCoverage(state);
    const w = state.map.width;
    for (const ind of state.industries) {
      const type = industryType(ind);
      if (!type || !(type.produces || []).length) continue;
      const tiles = industryTiles(ind);
      const covered = tiles.some((p) => (cov.get(p.y * w + p.x) || []).some((id) => ids.has(id)));
      if (!covered) continue;
      const isRaw = !(type.accepts || []).length;
      const dist = depot ? Math.min(...tiles.map((p) => Math.max(Math.abs(p.x - depot.x), Math.abs(p.y - depot.y)))) : 0;
      const bucket = isRaw ? raw : processed;
      for (const c of type.produces) {
        const d = bucket.has(c) ? Math.min(bucket.get(c), dist) : dist;
        bucket.set(c, d);
      }
    }
  }
  for (const st of stations) {
    for (const c of Object.keys(st.cargo || {})) {
      if (PAX.has(c)) continue;
      waiting.set(c, (waiting.get(c) || 0) + packets(st.cargo[c]));
    }
  }
  const all = new Set([...waiting.keys(), ...raw.keys(), ...processed.keys()]);
  for (const st of stations) for (const c of Object.keys(st.rating || {})) if (!PAX.has(c)) all.add(c);
  const tier = (c) => (raw.has(c) ? 0 : processed.has(c) ? 1 : 2);
  const dist = (c) => (raw.has(c) ? raw.get(c) : processed.has(c) ? processed.get(c) : Infinity);
  return [...all].sort((a, b) =>
    (waiting.get(b) || 0) - (waiting.get(a) || 0)
    || tier(a) - tier(b)
    || dist(a) - dist(b)
    || (a < b ? -1 : a > b ? 1 : 0));
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
  const freight = suppliedFreight(trucks, state, { x: depot.x, y: depot.y });
  const models = listModels(state, 'truck');
  for (const c of freight) {
    const carrying = models.filter((m) => (m.cargos || []).includes(c));
    const pick = cheapest(carrying);
    if (pick) return { modelId: pick.id, cargo: c };
  }
  const bus = cheapest(listModels(state, 'bus').filter((m) => (m.cargos || []).includes('PASS')));
  return bus ? { modelId: bus.id, cargo: 'PASS' } : none;
}
