/**
 * Entity diagnostics: invariants (ids, building refs, finite numbers), vehicles, stations, finance.
 */
import { mkIssue } from './diagIssue.js';
import { acceptanceProblems } from './orderCargo.js';

/** Waiting cargo above this at one station raises a warning. */
const WAITING_WARN = 1000;
/** Cargo rating (0..100) below this raises an info issue. */
const RATING_INFO = 30;

/**
 * Invariant checks: finite money/positions, valid building references, unique ids.
 * @param {object} state
 * @returns {object[]} Issues
 */
export function checkInvariants(state) {
  const out = [];
  const money = state.company?.money;
  if (!Number.isFinite(money)) {
    out.push(mkIssue('invariant-money', 'error', 'invariant', `company money is not finite (${money})`));
  }
  const stationIds = new Set(state.stations.map((s) => s.id));
  const depotIds = new Set(state.depots.map((d) => d.id));
  // duplicate ids
  const seen = new Map();
  for (const [kind, list] of [['station', state.stations], ['depot', state.depots], ['vehicle', state.vehicles]]) {
    for (const e of list) {
      const key = e.id;
      if (seen.has(key)) out.push(mkIssue(`invariant-dup-id:${key}`, 'error', 'invariant', `id ${key} used by both ${seen.get(key)} and ${kind}`));
      else seen.set(key, kind);
    }
  }
  // vehicle numeric sanity
  for (const v of state.vehicles) {
    const bad = ['speed', 'progress', 'tx', 'ty'].filter((k) => !Number.isFinite(v[k]));
    if (bad.length) {
      out.push(mkIssue(`invariant-vehicle-nan:${v.id}`, 'error', 'invariant',
        `vehicle ${v.id} has non-finite ${bad.join(', ')}`, { vehicleId: v.id, x: v.tx, y: v.ty }));
    }
  }
  // tile building references
  const { map } = state;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const t = map.tiles[y * map.width + x];
    const b = t.building;
    if (!b) continue;
    if (b.type === 'station' && !stationIds.has(b.stationId)) {
      out.push(mkIssue(`invariant-tile-station:${x},${y}`, 'error', 'invariant',
        `tile ${x},${y} references missing station ${b.stationId}`, { x, y, stationId: b.stationId }));
    }
    if (b.type === 'depot') {
      if (!depotIds.has(b.depotId)) {
        out.push(mkIssue(`invariant-tile-depot:${x},${y}`, 'error', 'invariant',
          `tile ${x},${y} references missing depot ${b.depotId}`, { x, y }));
      }
    }
  }
  // station tiles must have a matching building
  for (const st of state.stations) {
    for (const p of st.tiles || []) {
      const t = map.tiles[p.y * map.width + p.x];
      const b = t && t.building;
      if (!b || b.type !== 'station' || b.stationId !== st.id) {
        out.push(mkIssue(`invariant-station-tile:${st.id}:${p.x},${p.y}`, 'error', 'invariant',
          `station ${st.id} lists tile ${p.x},${p.y} with no matching building`,
          { x: p.x, y: p.y, stationId: st.id }));
      }
    }
  }
  return out;
}

/**
 * Vehicle diagnostics: lost, no orders, negative profit, past max age.
 * @param {object} state
 * @returns {object[]} Issues
 */
export function checkVehicles(state) {
  const out = [];
  for (const v of state.vehicles) {
    const orders = v.orders || [];
    if (v.state === 'lost') {
      out.push(mkIssue(`vehicle-lost:${v.id}`, 'warn', 'vehicle', `vehicle ${v.id} (${v.name}) is lost`,
        { vehicleId: v.id, x: v.tx, y: v.ty }));
    }
    if ((v.state === 'running' || v.state === 'stopped') && orders.length === 0) {
      out.push(mkIssue(`vehicle-no-orders:${v.id}`, 'warn', 'vehicle',
        `vehicle ${v.id} (${v.name}) is ${v.state} with no orders`, { vehicleId: v.id }));
    }
    if (v.profitLastYear < 0) {
      out.push(mkIssue(`vehicle-loss-making:${v.id}`, 'info', 'vehicle',
        `vehicle ${v.id} (${v.name}) lost money last year (${v.profitLastYear})`, { vehicleId: v.id }));
    }
    if (Number.isFinite(v.age) && Number.isFinite(v.maxAge) && v.age > v.maxAge) {
      out.push(mkIssue(`vehicle-old:${v.id}`, 'info', 'vehicle',
        `vehicle ${v.id} (${v.name}) is past max age (${v.age} > ${v.maxAge} ticks)`, { vehicleId: v.id }));
    }
  }
  return out;
}

/**
 * Vehicles whose carried cargo no stop on their orders accepts (P7 playtest).
 * @param {object} state
 * @returns {object[]} Issues (warn)
 */
export function checkOrderAcceptance(state) {
  return acceptanceProblems(state).map((p) => mkIssue(`vehicle-no-acceptor:${p.vehicleId}:${p.cargoId}`, 'warn', 'vehicle',
    p.message, { vehicleId: p.vehicleId }));
}

/**
 * Station diagnostics: unused stations, heavy waiting cargo, low ratings.
 * @param {object} state
 * @returns {object[]} Issues
 */
export function checkStations(state) {
  const out = [];
  const targeted = new Set();
  for (const v of state.vehicles) for (const o of v.orders || []) targeted.add(o.stationId);
  for (const st of state.stations) {
    if (!targeted.has(st.id)) {
      out.push(mkIssue(`station-unused:${st.id}`, 'info', 'station',
        `station ${st.id} (${st.name}) has no vehicle order to it`, { x: st.x, y: st.y, stationId: st.id }));
    }
    for (const [cargoId, list] of Object.entries(st.cargo || {})) {
      let total = 0;
      for (const p of list) total += p.amount;
      if (total > WAITING_WARN) {
        out.push(mkIssue(`station-waiting:${st.id}:${cargoId}`, 'warn', 'station',
          `station ${st.id} (${st.name}) has ${Math.round(total)} ${cargoId} waiting`,
          { x: st.x, y: st.y, stationId: st.id }));
      }
    }
    for (const [cargoId, r] of Object.entries(st.rating || {})) {
      if (r < RATING_INFO) {
        out.push(mkIssue(`station-rating:${st.id}:${cargoId}`, 'info', 'station',
          `station ${st.id} (${st.name}) ${cargoId} rating ${r}% is below ${RATING_INFO}%`,
          { x: st.x, y: st.y, stationId: st.id }));
      }
    }
  }
  return out;
}

/**
 * Finance diagnostics: negative money and sustained debt.
 * @param {object} state
 * @returns {object[]} Issues
 */
export function checkFinance(state) {
  const out = [];
  const c = state.company;
  if (!c || !Number.isFinite(c.money)) return out;
  if (c.money < 0) {
    out.push(mkIssue('finance-negative-money', 'warn', 'finance', `company money is negative (${Math.round(c.money)})`));
  }
  if ((c.negativeMonths || 0) >= 3) {
    out.push(mkIssue('finance-bankruptcy-risk', 'error', 'finance',
      `company has been in debt for ${c.negativeMonths} months`));
  }
  return out;
}

/**
 * Traffic diagnostics from game.trafficStats() (or state.traffic.stats) when present.
 * @param {object|null} stats traffic stats object, or null when traffic is unavailable
 * @returns {object[]} Issues
 */
export function checkTraffic(stats) {
  if (!stats) return [];
  const out = [];
  const recent = (stats.history || []).slice(-30);
  const trips = recent.reduce((a, h) => a + (h.trips || 0), 0);
  const failed = recent.reduce((a, h) => a + (h.failed || 0), 0);
  if (trips + failed > 0 && failed / (trips + failed) > 0.1) {
    out.push(mkIssue('traffic-failed-trips', 'warn', 'traffic',
      `${Math.round((100 * failed) / (trips + failed))}% of recent car trips failed (${failed}/${trips + failed})`));
  }
  if (stats.active > 0 && Number.isFinite(stats.avgSpeedRatio) && stats.avgSpeedRatio < 0.6) {
    out.push(mkIssue('traffic-slow', 'warn', 'traffic',
      `average traffic speed is ${(stats.avgSpeedRatio * 100).toFixed(0)}% of free flow`));
  }
  if ((stats.congestedTiles || 0) > 0) {
    const top = (stats.topCongested || [])[0];
    out.push(mkIssue('traffic-congested', 'warn', 'traffic',
      `${stats.congestedTiles} congested road tiles${top ? ` (worst ${top.x},${top.y} load ${top.load})` : ''}`,
      top ? { x: top.x, y: top.y } : {}));
  }
  if ((stats.abortedTotal || 0) > 0 || (stats.abortedToday || 0) > 0) {
    out.push(mkIssue('traffic-aborted', 'warn', 'traffic',
      `${stats.abortedTotal || 0} car trips aborted in total`));
  }
  const sup = stats.suppressedTotal || 0, done = (stats.tripsTotal || 0) + sup;
  if (done > 200 && sup / done > 0.1) {
    out.push(mkIssue('traffic-suppressed', 'info', 'traffic',
      `${Math.round((100 * sup) / done)}% of car trip demand could not start (car cap or full street lanes)`));
  }
  return out;
}

