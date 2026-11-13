/**
 * Company finances: ledger, loan, interest, upkeep (cargo payment: loco/economy.js).
 */
import { COSTS } from '../config/costs.js';
import { noteExpenditure, companyDefaults } from './loco/company.js';
import { START_MONEY, START_LOAN, MAX_LOAN, LOAN_STEP } from './constants.js';
import { getSetting } from './settings.js';
import { effectiveMaxLoan } from './prices.js';

/** Ledger categories. */
const LEDGER_TYPES = ['construction', 'vehicles', 'running', 'income', 'interest', 'property'];

/** Revenue-by-vehicle-type buckets shown in the finance window (D7 Phase 2, sparse). */
export const REVENUE_KINDS = ['train', 'tram', 'bus', 'truck', 'ship', 'aircraft'];

/**
 * Map an unloading vehicle's model kind to a revenue bucket: engines (and a lone wagon, which never unloads
 * on its own) count as train; the rest use their own model kind. Unknown kinds are not attributed.
 */
export function revenueKindOfModel(model) {
  if (!model) return null;
  if (model.kind === 'engine' || model.kind === 'wagon') return 'train';
  return REVENUE_KINDS.includes(model.kind) ? model.kind : null;
}

/**
 * Attribute a cargo payment to the unloading vehicle type for the current month. Lazy and sparse: `byKind`
 * is created only on the first delivery, so idle games keep their exact ledger shape and save bytes.
 */
export function noteRevenueKind(company, kind, amount) {
  if (!amount || !kind) return;
  const cur = company.ledger.current;
  (cur.byKind ??= {})[kind] = (cur.byKind[kind] || 0) + amount;
}

/** Fresh company record. */
export function createCompany(name = 'Transit Tycoon Co.') {
  return {
    name, money: START_MONEY, loan: START_LOAN, maxLoan: MAX_LOAN,
    ledger: { current: emptyLedger(), history: [] },
    negativeMonths: 0,
    ...companyDefaults(),
  };
}

function emptyLedger() {
  return { income: 0, expenses: 0, byType: Object.fromEntries(LEDGER_TYPES.map((t) => [t, 0])) };
}

/**
 * Spend money (positive amount) under a ledger type.
 */
export function spend(company, type, amount) {
  if (!amount) return;
  company.money -= amount;
  company.ledger.current.expenses += amount;
  company.ledger.current.byType[type] = (company.ledger.current.byType[type] || 0) + amount;
  noteExpenditure(company, type, -amount);
}

/**
 * Earn money (positive amount) as income.
 */
export function earn(company, amount, type = 'income') {
  if (!amount) return;
  company.money += amount;
  company.ledger.current.income += amount;
  company.ledger.current.byType[type] = (company.ledger.current.byType[type] || 0) + amount;
  noteExpenditure(company, type, amount);
}

/**
 * Monthly loan interest (World/Company.cpp:724): loan * loanInterestRate / 1200, with loanInterestRate in
 * OpenLoco percent units from the `loanInterestRate` setting. Shared by the player and AI rivals.
 */
export function monthlyLoanInterest(state, loan) {
  return Math.trunc((loan * getSetting(state, 'loanInterestRate')) / 1200);
}

/** Maximum loan of a company (same cap that borrow() uses): flat company.maxLoan, or inflation-adjusted when the setting is on. */
export function maxLoanCap(state, company) {
  return (state && getSetting(state, 'inflationAdjustsMaxLoan')) ? effectiveMaxLoan(state) : company.maxLoan;
}

/**
 * Borrow money in LOAN_STEP increments.
 * @returns {{ok:boolean,cost?:number,error?:string,loan?:number}}
 */
export function borrow(company, amount = LOAN_STEP, state = null) {
  const amt = Math.ceil(Math.max(0, amount) / LOAN_STEP) * LOAN_STEP;
  if (amt <= 0) return { ok: false, error: 'Invalid amount' };
  // OL: max loan inflation-adjusted when inflationAdjustsMaxLoan; default off -> flat company.maxLoan
  const cap = maxLoanCap(state, company);
  if (company.loan + amt > cap) return { ok: false, error: 'Maximum loan reached' };
  company.loan += amt;
  company.money += amt;
  return { ok: true, cost: 0, loan: company.loan };
}

/**
 * Repay loan in LOAN_STEP increments.
 */
export function repay(company, amount = LOAN_STEP) {
  const amt = Math.min(company.loan, Math.ceil(Math.max(0, amount) / LOAN_STEP) * LOAN_STEP);
  if (amt <= 0) return { ok: false, error: 'No loan to repay' };
  if (company.money < amt) return { ok: false, error: 'Not enough money' };
  company.loan -= amt;
  company.money -= amt;
  return { ok: true, cost: 0, loan: company.loan };
}

/**
 * Count property (company-owned track/stations/depots) for upkeep.
 */
export function propertyUpkeep(state) {
  return upkeepFor(state, null);
}

/**
 * Property upkeep of one owner (gap #25): ownerId null = the player. A station/depot tile counts for the
 * owner of its station/depot record; rail/road is the player's when not a rival's station/depot tile.
 * Rival road/rail tiles carry their rival's id (rivalId) and are paid by that rival (gap #25 stage 4).
 */
export function upkeepFor(state, ownerId) {
  const owner = ownerId ?? null;
  let cost = 0;
  for (const t of state.map.tiles) {
    const b = t.building;
    const isStop = b && (b.type === 'station' || b.type === 'depot');
    if (t.owner !== 'company' && t.owner !== 'rival' && !isStop) continue;
    // a rival's own road/rail tile (gap #25): paid by the rival named on the tile (lazy rivalId)
    if (t.owner === 'rival' && !isStop) {
      if ((t.rivalId ?? null) !== owner || owner === null || state.rivals.find((q) => q.id === owner)?.bankrupt) continue;
      if (t.rail) cost += COSTS.upkeepRail;
      if (t.road) cost += COSTS.upkeepRoad;
      continue;
    }
    const tileOwner = isStop ? recordOwner(state, b) : null;
    if (tileOwner !== owner) continue;
    if (b && b.type === 'station') cost += COSTS.upkeepStationTile;
    else if (b && b.type === 'depot') cost += COSTS.upkeepDepot;
    if (t.owner === 'company' && owner === null) {
      if (t.rail) cost += COSTS.upkeepRail;
      if (t.road) cost += COSTS.upkeepRoad;
    }
  }
  return cost;
}

/** ownerId of the station or depot record a tile building points to (null = player). */
function recordOwner(state, b) {
  const rec = b.type === 'station'
    ? state.stations.find((s) => s.id === b.stationId)
    : state.depots.find((d) => d.id === b.depotId);
  return rec && rec.ownerId != null ? rec.ownerId : null;
}

/**
 * Close the ledger month `ended`: push it to history and start a new current month. Called by
 * loco/companyManager.js after all monthly managers ran (interest/property are charged by Company::updateMonthly1).
 */
export function closeLedgerMonth(state, ended) {
  const company = state.company;
  const cur = company.ledger.current;
  const entry = {
    year: ended.year, month: ended.month, income: cur.income, expenses: cur.expenses,
    byType: { ...cur.byType },
  };
  // Sparse: only months with a delivery carry a vehicle-type breakdown (old/idle months keep the old shape).
  if (cur.byKind) entry.byKind = { ...cur.byKind };
  company.ledger.history.push(entry);
  if (company.ledger.history.length > 36) company.ledger.history.shift();
  company.ledger.current = emptyLedger();
}
