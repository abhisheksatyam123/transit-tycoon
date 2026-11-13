/**
 * Tutorial goals for random worlds: a short staged list (build, route, deliver, carry, profit, value).
 * Stages are checked from cumulative state, so they complete even if the player did the work before
 * the list was first opened. The record lives in state.rgoals and is created lazily on the first UI
 * request (game.goals()), so a random world's state, saves and tools/world-hash.js output are unchanged
 * until the player opens the Goals window. No cash rewards: only news. Pure: no DOM.
 */
import { notify } from './news.js';
import { calculateCompanyValue, totalRecentProfit } from './loco/company.js';

/** Freight cargo ids: everything delivered except passengers and mail. */
const PEOPLE = new Set(['PASS', 'MAIL']);

/**
 * Stage definitions in order. `progress(state)` returns {v, t}; the stage is done when v >= t.
 * `unit` is only for display ('t' tonnes, '' plain count, '$' money).
 */
export const RANDOM_GOALS = [
  { id: 'station', title: 'Build your first station', hint: 'Use the Road or Rail tool and place a station next to a town.', unit: '',
    progress: (s) => ({ v: Math.min(1, s.stations.filter((st) => st.ownerId == null).length), t: 1 }) },
  { id: 'route', title: 'Buy a vehicle and give it 2 orders', hint: 'Open a depot, buy a vehicle, then add two stations as its orders.', unit: '',
    progress: (s) => ({ v: Math.min(1, s.vehicles.filter((v) => v.ownerId == null && v.orders.length >= 2).length), t: 1 }) },
  { id: 'income', title: 'Earn your first delivery income', hint: 'Load a vehicle at one station and unload it at another: the first delivery pays.', unit: '',
    progress: (s) => ({ v: Math.min(1, s.company.cargoUnitsTotalDelivered || 0), t: 1 }) },
  { id: 'freight200', title: 'Deliver 200 t of any freight cargo', hint: 'Run a freight route (coal, goods, oil...). Any cargo except passengers and mail counts.', unit: 't',
    progress: (s) => ({ v: freightTotal(s), t: 200 }) },
  { id: 'pax500', title: 'Carry 500 passengers', hint: 'Connect two busy towns with a bus or train service.', unit: '',
    progress: (s) => ({ v: s.company.cargoDelivered?.PASS || 0, t: 500 }) },
  { id: 'profit5', title: 'Have 5 vehicles making a profit', hint: 'Keep the best routes and add vehicles where cargo waits.', unit: '',
    progress: (s) => ({ v: s.vehicles.filter((v) => v.ownerId == null && totalRecentProfit(v) > 0).length, t: 5 }) },
  { id: 'value250k', title: 'Reach company value $250,000', hint: 'Company value = cash - loan + vehicle value + 8 x recent profit. Repay the loan to raise it.', unit: '$',
    progress: (s) => ({ v: Math.max(0, calculateCompanyValue(s.company, s.vehicles.filter((v) => v.ownerId == null)).companyValue), t: 250000 }) },
];

/** Total units of non-passenger cargo delivered by the company. */
export function freightTotal(state) {
  let n = 0;
  for (const [id, units] of Object.entries(state.company.cargoDelivered || {})) if (!PEOPLE.has(id)) n += units;
  return n;
}

/** Create the record (idempotent). Random worlds only: scenario games use state.goals. */
export function ensureRandomGoals(state) {
  if (state.scenario) return null;
  state.rgoals ??= { index: 0, done: [] };
  return state.rgoals;
}

/**
 * Check the current stage and any that complete in the same check. Posts a 'Goal complete' news item
 * per completion and emits 'goal'. Returns the number completed. No-op until the record exists.
 * @param {{state:object, emit?:Function}} ctx
 */
export function evaluateRandomGoals(ctx) {
  const g = ctx.state.rgoals;
  if (!g) return 0;
  let n = 0;
  while (g.index < RANDOM_GOALS.length) {
    const goal = RANDOM_GOALS[g.index];
    const { v, t } = goal.progress(ctx.state);
    if (!(v >= t)) break;
    g.done.push(goal.id);
    g.index++;
    n++;
    notify(ctx, `Goal complete: ${goal.title}!`, 'good', undefined, undefined, 'general');
    if (ctx.emit) ctx.emit('goal', { id: goal.id, title: goal.title, reward: 0 });
  }
  return n;
}

/**
 * UI entry point: create the record on first request, evaluate, and return one row per stage.
 * @returns {{goals:object[], completed:number, total:number}}
 */
export function randomGoalSnapshot(ctx) {
  const g = ensureRandomGoals(ctx.state);
  if (!g) return { goals: [], completed: 0, total: 0 };
  evaluateRandomGoals(ctx);
  const rows = RANDOM_GOALS.map((goal, i) => {
    const done = g.done.includes(goal.id);
    const active = !done && i === g.index;
    const p = goal.progress(ctx.state);
    return { id: goal.id, title: goal.title, hint: goal.hint, unit: goal.unit, done, active, v: p.v, t: p.t };
  });
  return { goals: rows, completed: g.done.length, total: RANDOM_GOALS.length };
}
