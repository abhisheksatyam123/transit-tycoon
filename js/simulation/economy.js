/**
 * Company finances: ledger, loan, interest, upkeep (cargo payment: loco/economy.js).
 */
import { COSTS } from '../config/costs.js';
import { noteExpenditure, companyDefaults } from './loco/company.js';
import { START_MONEY, START_LOAN, MAX_LOAN, LOAN_STEP, INTEREST_RATE } from './constants.js';

/** Ledger categories. */
export const LEDGER_TYPES = ['construction', 'vehicles', 'running', 'income', 'interest', 'property'];

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
 * Borrow money in LOAN_STEP increments.
 * @returns {{ok:boolean,cost?:number,error?:string,loan?:number}}
 */
export function borrow(company, amount = LOAN_STEP) {
  const amt = Math.ceil(Math.max(0, amount) / LOAN_STEP) * LOAN_STEP;
  if (amt <= 0) return { ok: false, error: 'Invalid amount' };
  if (company.loan + amt > company.maxLoan) return { ok: false, error: 'Maximum loan reached' };
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
  let cost = 0;
  for (const t of state.map.tiles) {
    if (t.owner !== 'company' && !(t.building && (t.building.type === 'station' || t.building.type === 'depot'))) continue;
    if (t.building && t.building.type === 'station') cost += COSTS.upkeepStationTile;
    else if (t.building && t.building.type === 'depot') cost += COSTS.upkeepDepot;
    if (t.owner === 'company') {
      if (t.rail) cost += COSTS.upkeepRail;
      if (t.road) cost += COSTS.upkeepRoad;
    }
  }
  return cost;
}

/**
 * Close the ledger month `ended`: push it to history and start a new current month. Called by
 * loco/companyManager.js after all monthly managers ran (interest/property are charged by Company::updateMonthly1).
 */
export function closeLedgerMonth(state, ended) {
  const company = state.company;
  const cur = company.ledger.current;
  company.ledger.history.push({
    year: ended.year, month: ended.month, income: cur.income, expenses: cur.expenses,
    byType: { ...cur.byType },
  });
  if (company.ledger.history.length > 36) company.ledger.history.shift();
  company.ledger.current = emptyLedger();
}
