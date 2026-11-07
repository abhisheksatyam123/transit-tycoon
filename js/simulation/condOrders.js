/**
 * Conditional orders (OpenTTD OT_CONDITIONAL, order_cmd.cpp ProcessConditionalOrder / GetNextDecisionNode).
 * An order `{ cond: { v, cmp, val, to } }` has no station: when the vehicle advances to it, the condition is
 * evaluated and the vehicle jumps to order `to` when true, otherwise falls through to the next order.
 * Evaluated only when the vehicle moves to the order (replan), never per tick. Boolean variables use
 * cmp '==' with val 1 (is true) or 0 (is false).
 */
import { cargoSlices, advanceOrder } from './orders.js';
import { vehicleModel } from './vehicles.js';
import { serviceDueNow } from './service.js';

/**
 * Variables (OpenTTD OrderConditionVariable subset): load %, reliability %, max speed km/h, age years, service, always,
 * lifetime (OCV_REMAINING_LIFETIME: years until max age, may be negative), maxReliability (OCV_MAX_RELIABILITY: model max %).
 */
export const COND_VARS = ['load', 'reliability', 'maxSpeed', 'age', 'service', 'always', 'lifetime', 'maxReliability'];
/** Comparators (OpenTTD OrderConditionComparator): = != < <= > >=. */
export const COND_CMPS = ['==', '!=', '<', '<=', '>', '>='];
/** Boolean variables: only '==' with 1 (is true) / 0 (is false). */
const BOOL_VARS = new Set(['service', 'always']);
/** Largest value accepted for a numeric variable. */
const MAX_VALUE = 100000;
/** Variables whose value may be negative (remaining lifetime after max age). */
const SIGNED_VARS = new Set(['lifetime']);

/** Whether an order entry is a conditional. */
export function isCond(o) {
  return !!o && o.cond != null;
}

/** Number of unconditional (station or depot) orders in a list. */
export function plainOrderCount(orders) {
  let n = 0;
  for (const o of orders) if (!isCond(o)) n++;
  return n;
}

/**
 * Validate and normalise one conditional entry. `to` is checked against the final list length by the caller.
 * @returns {{ok: true, entry: object} | {ok: false, error: string}}
 */
export function normaliseCond(c) {
  if (!c || typeof c !== 'object') return { ok: false, error: 'Bad conditional order' };
  if (!COND_VARS.includes(c.v)) return { ok: false, error: `Unknown condition variable ${c.v}` };
  const bool = BOOL_VARS.has(c.v);
  const cmp = bool ? '==' : c.cmp;
  if (!COND_CMPS.includes(cmp)) return { ok: false, error: `Unknown comparator ${c.cmp}` };
  let val = bool ? (Number(c.val) ? 1 : 0) : Math.round(Number(c.val));
  const lo = SIGNED_VARS.has(c.v) ? -MAX_VALUE : 0;
  if (!bool && (!Number.isFinite(val) || val < lo || val > MAX_VALUE)) return { ok: false, error: 'Bad condition value' };
  const to = Number.isInteger(c.to) ? c.to : -1;
  return { ok: true, entry: { cond: { v: c.v, cmp, val, to } } };
}

/** Value of a condition variable for a vehicle (OpenTTD ProcessConditionalOrder operands). */
export function condOperand(state, v, variable) {
  switch (variable) {
    case 'load': {
      let amount = 0, cap = 0;
      if (v.consist) {
        for (const s of cargoSlices(v)) cap += s.capacity;
        for (const k of Object.keys(v.loads || {})) amount += (v.loads[k] && v.loads[k].amount) || 0;
      } else {
        amount = v.load ? v.load.amount || 0 : 0;
        cap = v.capacity || 0;
      }
      return cap > 0 ? Math.floor((amount * 100) / cap) : 0;
    }
    case 'reliability': return Math.round((v.reliability || 0) * 100);
    case 'maxSpeed': { const m = vehicleModel(v); return m ? m.speed : 0; }
    case 'age': return Math.floor((v.age || 0) / 365);
    // OpenTTD: (max_age - age) / DAYS_IN_LEAP_YEAR, C division truncates toward zero (negative once past max age).
    case 'lifetime': return Math.trunc(((v.maxAge || 0) - (v.age || 0)) / 365) || 0; // || 0: no -0
    // Model max reliability in percent (TT model.reliability 0..1; vehicles.js createVehicle baseReliability).
    case 'maxReliability': return Math.round((v.baseReliability ?? 0) * 100);
    case 'service': return serviceDueNow(state, v) ? 1 : 0;
    case 'always': return 1;
    default: return 0;
  }
}

function compare(x, cmp, y) {
  switch (cmp) {
    case '==': return x === y;
    case '!=': return x !== y;
    case '<': return x < y;
    case '<=': return x <= y;
    case '>': return x > y;
    case '>=': return x >= y;
    default: return false;
  }
}

/** Whether the condition holds for the vehicle now (true = jump to `to`). */
export function condTrue(state, v, c) {
  return compare(condOperand(state, v, c.v), c.cmp, c.val);
}

/**
 * Resolve conditional orders at the vehicle's current order: while the current order is a conditional,
 * evaluate it and jump (true) or fall through (false). Loop guard: at most orders.length jumps, so a cycle
 * of conditionals cannot hang; past that the vehicle falls through sequentially, skipping conditionals.
 * @returns {boolean} false when the list has no unconditional order left (vehicle has nothing to do)
 */
export function resolveConditionals(state, v) {
  const n = v.orders.length;
  if (!n || !v.orders.some(isCond)) return true;
  let hops = 0;
  while (isCond(v.orders[v.orderIndex % n])) {
    const cur = v.orders[v.orderIndex % n];
    if (hops++ >= n) { // loop guard: fall through sequentially to the next plain order
      for (let k = 0; k < n && isCond(v.orders[v.orderIndex]); k++) advanceOrder(v);
      return !isCond(v.orders[v.orderIndex]);
    }
    if (condTrue(state, v, cur.cond) && cur.cond.to >= 0 && cur.cond.to < n) v.orderIndex = cur.cond.to;
    else advanceOrder(v);
  }
  return true;
}

/**
 * Delete order k, renumbering conditional targets as OpenTTD does (CmdDeleteOrder): targets at or after k
 * move back one (not below 0); a target that points at its own order moves on.
 * @returns {object[]} new list (input untouched)
 */
export function deleteOrderAt(orders, k) {
  const out = [];
  for (let i = 0; i < orders.length; i++) {
    if (i === k) continue;
    const o = { ...orders[i] };
    if (isCond(o)) {
      let t = o.cond.to;
      if (t >= k) t = Math.max(t - 1, 0);
      o.cond = { ...o.cond, to: t };
    }
    out.push(o);
  }
  fixSelfTargets(out);
  return out;
}

/**
 * Move order from index a to index b (OpenTTD-style target follow): every conditional target follows the
 * order it pointed at, so the jump still lands on the same order.
 * @returns {object[]} new list (input untouched)
 */
export function moveOrderTo(orders, a, b) {
  const perm = orders.map((_, i) => i); // perm[oldIndex] = newIndex
  for (let i = 0; i < orders.length; i++) {
    if (i === a) perm[i] = b;
    else if (a < b && i > a && i <= b) perm[i] = i - 1;
    else if (a > b && i >= b && i < a) perm[i] = i + 1;
  }
  const out = new Array(orders.length);
  orders.forEach((o, i) => {
    const copy = { ...o };
    if (isCond(copy) && copy.cond.to >= 0 && copy.cond.to < orders.length) copy.cond = { ...copy.cond, to: perm[copy.cond.to] };
    out[perm[i]] = copy;
  });
  return out;
}

/** A conditional that jumps to itself is re-pointed to the next order (OpenTTD: (id+1) % n). */
function fixSelfTargets(list) {
  const n = list.length;
  list.forEach((o, i) => {
    if (isCond(o) && o.cond.to === i && n > 0) o.cond = { ...o.cond, to: (i + 1) % n };
  });
}

const VAR_NAME = { load: 'load %', reliability: 'reliability %', maxSpeed: 'max speed km/h', age: 'age (years)', service: 'requires service', always: 'always', lifetime: 'remaining lifetime (years)', maxReliability: 'max reliability %' };
const CMP_NAME = { '==': '=', '!=': '!=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' };

/** UI text of a condition, e.g. "Jump to order 3 if load % < 50" (bool vars: "if requires service is true"). */
export function condText(c) {
  if (c.v === 'always') return `Jump to order ${c.to + 1} always`;
  if (BOOL_VARS.has(c.v)) return `Jump to order ${c.to + 1} if ${VAR_NAME[c.v]} is ${c.val ? 'true' : 'false'}`;
  return `Jump to order ${c.to + 1} if ${VAR_NAME[c.v]} ${CMP_NAME[c.cmp]} ${c.val}`;
}
