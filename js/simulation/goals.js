/**
 * Goals: a sequential list of staged objectives for scenario games (Moscow).
 * Each goal is checked daily; completing one pays a reward, posts good news and
 * unlocks the next. State lives in state.goals (created only for scenario games,
 * so random-world saves are unchanged). Pure: no DOM.
 */
import { notify } from './news.js';
import { findStation, manhattan } from './state.js';

/** Distance (tiles) within which a station counts as serving a town or landmark. */
export const SERVE_RADIUS = 6;
/** Distance (tiles, from the landmark centre) within which a station serves a landmark. */
export const LANDMARK_RADIUS = 5;

/**
 * Goal definitions in unlock order. `progress(ctx)` returns {v, t}; the goal is done when v >= t.
 * ctx: {state, stats} where stats is the per-check cache from makeStats().
 */
export const GOALS = [
  { id: 'first_route', title: 'First route', desc: 'Buy a vehicle and give it at least two orders.', reward: 50000,
    progress: ({ stats }) => ({ v: Math.min(1, stats.routes), t: 1 }) },
  { id: 'pax_month', title: 'Busy month', desc: 'Carry 2,000 passengers in one month with vehicles you bought.', reward: 150000,
    progress: ({ state }) => ({ v: state.goals.month.PAS || 0, t: 2000 }) },
  { id: 'districts', title: 'Districts', desc: `Build stations within ${SERVE_RADIUS} tiles of 6 districts.`, reward: 200000,
    progress: ({ stats }) => ({ v: stats.servedTowns, t: 6 }) },
  { id: 'profit_month', title: 'Profitable month', desc: 'Make $60,000 profit (income minus expenses) in one month.', reward: 250000,
    progress: ({ state }) => {
      const h = state.company.ledger.history;
      const last = h.length ? h[h.length - 1] : null;
      return { v: last ? last.income - last.expenses : 0, t: 60000 };
    } },
  { id: 'kremlin_vdnkh', title: 'Kremlin to VDNKh', desc: 'Run a route from a station near the Kremlin to one near VDNKh.', reward: 400000,
    progress: ({ stats }) => ({ v: stats.kremlinVdnkh ? 1 : 0, t: 1 }) },
  { id: 'landmarks', title: 'Sightseeing', desc: `Build stations within ${LANDMARK_RADIUS} tiles of 8 landmarks.`, reward: 400000,
    progress: ({ stats }) => ({ v: stats.landmarks, t: 8 }) },
  { id: 'value', title: 'Tycoon', desc: 'Grow company value (cash - loan + vehicles) to $8,000,000.', reward: 500000,
    progress: ({ stats }) => ({ v: stats.value, t: 8000000 }) },
];

/** Create the goal record for a scenario game. Vehicles with id <= base were prebuilt by the scenario. */
export function initGoals(state) {
  state.goals = { index: 0, done: [], month: {}, base: state.nextId - 1 };
  return state.goals;
}

/** Ensure goals exist for scenario saves written before this feature (their vehicles count as prebuilt). */
export function ensureGoals(state) {
  if (state.scenario && !state.goals) initGoals(state);
  return state.goals || null;
}

/** Count a delivery toward the current month's cargo total (no-op without goals). */
export function noteDelivery(state, cargoId, amount, vehicleId = Infinity) {
  if (!state.goals || !(amount > 0) || vehicleId <= state.goals.base) return; // prebuilt fleet does not count
  state.goals.month[cargoId] = (state.goals.month[cargoId] || 0) + amount;
}

/** Towns (index set) and landmark ids served by any station. */
function serveSets(state) {
  const towns = state.towns;
  const served = new Set();
  const landmarks = new Set();
  const meta = state.scenarioMeta && state.scenarioMeta.landmarks ? state.scenarioMeta.landmarks : [];
  const base = state.goals ? state.goals.base : -1;
  for (const st of state.stations) {
    if (st.id <= base) continue; // only stations the player built count
    towns.forEach((t, i) => { if (manhattan(st.x, st.y, t.x, t.y) <= SERVE_RADIUS) served.add(i); });
    for (const lm of meta) {
      const cx = lm.x + (lm.w || 1) / 2 - 0.5, cy = lm.y + (lm.h || 1) / 2 - 0.5;
      if (manhattan(st.x, st.y, cx, cy) <= LANDMARK_RADIUS) landmarks.add(lm.id);
    }
  }
  return { served, landmarks };
}

/** Whether a player-bought vehicle with 2+ orders links a station near point A with one near point B. */
function routeLinks(state, base, pointA, pointB) {
  const near = (st, p) => manhattan(st.x, st.y, p.x, p.y) <= LANDMARK_RADIUS;
  for (const v of state.vehicles) {
    if (v.id <= base || v.orders.length < 2) continue;
    let a = false, b = false;
    for (const o of v.orders) {
      const st = findStation(state, o.stationId);
      if (!st) continue;
      if (near(st, pointA)) a = true;
      if (near(st, pointB)) b = true;
    }
    if (a && b) return true;
  }
  return false;
}

/** Per-check statistics shared by goal progress functions. */
export function makeStats(state) {
  const base = state.goals.base;
  const player = state.vehicles.filter((v) => v.id > base);
  const { served, landmarks } = serveSets(state);
  const lm = (id) => (state.scenarioMeta?.landmarks || []).find((q) => q.id === id);
  const center = (l) => (l ? { x: l.x + (l.w || 1) / 2 - 0.5, y: l.y + (l.h || 1) / 2 - 0.5 } : null);
  const kr = center(lm('kremlin')), vd = center(lm('vdnkh'));
  let value = state.company.money - state.company.loan;
  for (const v of state.vehicles) value += v.value || 0;
  return {
    routes: player.filter((v) => v.orders.length >= 2).length,
    servedTowns: served.size,
    landmarks: landmarks.size,
    kremlinVdnkh: !!(kr && vd) && routeLinks(state, base, kr, vd),
    value,
  };
}

/**
 * Check the current goal (and any that complete in the same check). Pays rewards, posts news,
 * emits 'goal' for each completion. Returns the number of goals completed.
 * @param {{state:object, emit?:Function}} ctx
 */
export function evaluateGoals(ctx) {
  const { state } = ctx;
  const g = state.goals;
  if (!g) return 0;
  let n = 0;
  while (g.index < GOALS.length) {
    const goal = GOALS[g.index];
    const stats = makeStats(state);
    const { v, t } = goal.progress({ state, stats });
    if (!(v >= t)) break;
    g.done.push(goal.id);
    g.index++;
    n++;
    state.company.money += goal.reward; // a grant, not income: keeps the profit goal honest
    notify(ctx, `Goal complete: ${goal.title}! Board pays ${money(goal.reward)}.`, 'good', undefined, undefined, 'general');
    if (ctx.emit) ctx.emit('goal', { id: goal.id, title: goal.title, reward: goal.reward });
  }
  return n;
}

/** Reset monthly counters when a new month starts (call after evaluation at month end). */
export function rollGoalMonth(state) {
  if (state.goals) state.goals.month = {};
}

/**
 * UI snapshot: one row per goal with done/active state and progress.
 * @returns {{goals:object[], completed:number, total:number, current:object|null}}
 */
export function goalSnapshot(state) {
  const g = state.goals;
  if (!g) return { goals: [], completed: 0, total: 0, current: null };
  const stats = makeStats(state);
  const rows = GOALS.map((goal, i) => {
    const done = g.done.includes(goal.id);
    const active = !done && i === g.index;
    const p = (i <= g.index) ? goal.progress({ state, stats }) : { v: 0, t: 1 };
    return { id: goal.id, title: goal.title, desc: goal.desc, reward: goal.reward, done, active, v: p.v, t: p.t };
  });
  const current = rows.find((r) => r.active) || null;
  return { goals: rows, completed: g.done.length, total: GOALS.length, current };
}

/** Money formatting for news text (no DOM dependency). */
function money(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}
