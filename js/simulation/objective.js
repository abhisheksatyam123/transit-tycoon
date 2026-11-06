/**
 * Scenario objective (OpenLoco Scenario::Objective): a company target (company value, vehicle profit,
 * performance index or delivered cargo) to reach before an optional time limit.
 * state.objective = {type, target, cargoId?, timeLimitYears, startYear, startMonth, status, progress}; it only exists for
 * games created with an objective, so random-world state is unchanged. Single human company: the OpenLoco flags
 * beTopCompany / beWithinTopThree are trivially satisfied and not modelled.
 */
import { notify } from './news.js';
import { ensureCompany } from './loco/company.js';
import { formatMoney } from './currency.js';

/** Objective types: id -> label and default target. */
export const OBJECTIVE_TYPES = {
  companyValue: { label: 'Company value', unit: 'money', target: 25000000 },
  vehicleProfit: { label: 'Vehicle profit', unit: 'money', target: 1000000 },
  performanceIndex: { label: 'Performance index', unit: 'index', target: 500 },
  cargoDelivery: { label: 'Cargo delivery', unit: 'units', target: 100000 },
};

/**
 * Build an objective record.
 * @param {any} state
 * @param {{type:string,target?:number,cargoId?:string|number,timeLimitYears?:number}} o
 * @returns {any}
 */
export function createObjective(state, o) {
  const def = OBJECTIVE_TYPES[o.type];
  if (!def) throw new Error(`Unknown objective type ${o.type}`);
  const obj = {
    type: o.type,
    target: Math.max(1, Number(o.target) || def.target),
    timeLimitYears: Math.max(0, Math.floor(Number(o.timeLimitYears) || 0)),
    startYear: state.date.year, startMonth: state.date.month,
    status: 'active', progress: 0,
  };
  if (o.type === 'cargoDelivery' && o.cargoId !== undefined && o.cargoId !== '') obj.cargoId = o.cargoId;
  return obj;
}

/** Current value of the measured quantity. */
export function objectiveValue(state, obj) {
  const c = ensureCompany(state.company);
  switch (obj.type) {
    case 'companyValue': return c.companyValue;
    case 'vehicleProfit': return c.vehicleProfit;
    case 'performanceIndex': return c.performanceIndex;
    case 'cargoDelivery':
      if (obj.cargoId !== undefined) return c.cargoDelivered[obj.cargoId] || 0;
      return Object.values(c.cargoDelivered).reduce((a, b) => a + b, 0);
    default: return 0;
  }
}

/** Months elapsed since the objective started. */
export function monthsElapsed(state, obj) {
  const d = state.date;
  return (d.year - obj.startYear) * 12 + (d.month - (obj.startMonth || 0));
}

/** Human readable one-line description. */
export function describeObjective(obj) {
  const def = OBJECTIVE_TYPES[obj.type];
  const t = obj.target;
  const amount = def.unit === 'money' ? formatMoney(t, 'DEFAULT')
    : def.unit === 'units' ? Math.round(t).toLocaleString('en-US') + ' units' : String(Math.round(t));
  const lead = obj.type === 'companyValue' ? `Reach a company value of ${amount}`
    : obj.type === 'vehicleProfit' ? `Earn a vehicle profit of ${amount}`
      : obj.type === 'performanceIndex' ? `Reach a performance index of ${amount}`
        : `Deliver ${amount} of ${obj.cargoId !== undefined ? 'cargo ' + obj.cargoId : 'cargo'}`;
  return obj.timeLimitYears ? `${lead} within ${obj.timeLimitYears} year${obj.timeLimitYears === 1 ? '' : 's'}.` : `${lead}.`;
}

/** Monthly update (progress, win/lose). Runs after the company manager updated value / performance. */
export function updateMonthly(game) {
  const state = game.state;
  const obj = state.objective;
  if (!obj || obj.status !== 'active') return;
  obj.progress = objectiveValue(state, obj);
  if (obj.progress >= obj.target) {
    obj.status = 'won';
    notify(game.ctx, `Objective achieved! ${describeObjective(obj)}`, 'good', undefined, undefined, 'general');
    game.events.emit('objective', { status: 'won', objective: obj });
  } else if (obj.timeLimitYears && monthsElapsed(state, obj) >= obj.timeLimitYears * 12) {
    obj.status = 'lost';
    notify(game.ctx, `Objective failed: time ran out. ${describeObjective(obj)}`, 'bad', undefined, undefined, 'general');
    game.events.emit('objective', { status: 'lost', objective: obj });
  }
}
