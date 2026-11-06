/**
 * Ported from OpenLoco (MIT), src/World/CompanyManager.cpp (tick 0x00430319, updateDaily 0x00437FB8,
 * updateMonthly1 0x0043037B, updateMonthlyHeadquarters 0x0042F213, updateQuarterly 0x00487FC1, updateYearly 0x004312C7)
 * and src/World/Company.cpp (updateMonthly1, updateQuarterly, updateDailyPlayer). Single human company; AI skipped
 * (CompanyManager::tick only drives AI companies, so it is a no-op apart from finishing the monthly ledger, see below).
 *
 * Adaptation: transit-tycoon keeps a monthly ledger (company.ledger, shown by the Finances window and read by the
 * "profit_month" goal). OpenLoco charges vehicle running costs in VehicleManager::updateMonthly *after* CompanyManager::
 * updateMonthly1, so the ledger roll-over + goal evaluation is deferred to CompanyManager.tick (same game tick, after
 * every monthly manager ran): company.pendingLedger holds the month being closed.
 */
import { evaluateGoals, rollGoalMonth } from '../goals.js';
import { evaluateRandomGoals } from '../randomGoals.js';
import { updateHQ } from '../cmdHQ.js';
import { notify } from '../news.js';
import { propertyUpkeep, upkeepFor, closeLedgerMonth, spend } from '../economy.js';
import { INTEREST_RATE } from '../constants.js';
import { findVehicle } from '../state.js';
import { stopVehicle } from '../cmdVehicle.js';
import * as VehicleManager from './vehicleManager.js';
import { ensureEconomy, inflateCost, COST_INDEX, getCurrencyMultiplicationFactor } from './economy.js';
import {
  ensureCompany, calculatePerformanceIndex, calculateCompanyValue, performanceToRating, headquarterVariation,
  pushHistory, updateYearlyExpenditure, RATING_NAMES, BANKRUPT_MONTHS,
} from './company.js';

/** CompanyManager::tick: AI scheduling is skipped; finishes the deferred monthly ledger roll-over. */
export function tick(game) {
  const c = game.state.company;
  if (!c.pendingLedger) return;
  const ended = c.pendingLedger;
  c.pendingLedger = null;
  closeLedgerMonth(game.state, ended);
  evaluateGoals(game.ctx);
  rollGoalMonth(game.state);
}

/** CompanyManager::updateDaily -> Company::updateDaily -> updateDailyPlayer (challenge progress) + loan autorepay. */
export function updateDaily(game) {
  const c = ensureCompany(game.state.company);
  if (game.state.goals) evaluateGoals(game.ctx);
  if (game.state.rgoals) evaluateRandomGoals(game.ctx);
  // Company::updateLoanAutorepay (only when the player enabled it)
  if (c.autopayLoan && c.loan > 0 && c.money > 0) {
    const pay = Math.max(0, Math.min(c.loan, c.money));
    c.loan -= pay;
    c.money -= pay;
  }
}

/** Company::updateMonthly1 (via CompanyManager::updateMonthly1). */
export function updateMonthly1(game) {
  const s = game.state;
  const c = ensureCompany(s.company);
  ensureEconomy(s);
  const ended = s.date.month === 0 ? { year: s.date.year - 1, month: 11 } : { year: s.date.year, month: s.date.month - 1 };
  const vehicles = s.vehicles;

  // cargo delivered / distance histories
  pushHistory(c.cargoUnitsDeliveredHistory, c.cargoUnitsTotalDelivered);
  c.cargoUnitsTotalDelivered = 0;
  pushHistory(c.cargoUnitsDistanceHistory, c.cargoUnitsTotalDistance);
  c.cargoUnitsTotalDistance = 0;

  // performance index + rating
  const eco = (getCurrencyMultiplicationFactor(s, COST_INDEX.general) / s.economy.base[COST_INDEX.general]) * 1024;
  const perf = calculatePerformanceIndex(c, vehicles, eco);
  pushHistory(c.performanceIndexHistory, perf);
  c.performanceIndex = perf;
  const rating = performanceToRating(perf);
  if (rating > c.currentRating) {
    c.currentRating = rating;
    notify(game.ctx, `${c.name} has been promoted to corporate rating "${RATING_NAMES[rating]}"!`, 'good', undefined, undefined, 'company');
  }

  // company value
  const value = calculateCompanyValue(c, vehicles);
  pushHistory(c.companyValueHistory, value.companyValue);
  c.companyValue = value.companyValue;
  c.vehicleProfit = value.vehicleProfit;
  c.historySize = Math.min(120, c.historySize + 1);

  // loan interest (loanInterestRate is a percent: INTEREST_RATE*100), then property upkeep (transit-tycoon addition)
  const monthlyInterest = Math.trunc((c.loan * Math.round(INTEREST_RATE * 100)) / 1200);
  spend(c, 'interest', monthlyInterest);
  spend(c, 'property', inflateCost(s, COST_INDEX.property, propertyUpkeep(s)));
  for (const r of s.rivals || []) spend(r, 'property', inflateCost(s, COST_INDEX.property, upkeepFor(s, r.id)));

  // bankruptcy: 3 / 6 months warnings, 9 months declared
  if (!c.bankrupt) {
    if (c.money < 0) {
      c.numMonthsInTheRed++;
      if (c.numMonthsInTheRed === BANKRUPT_MONTHS) declareBankrupt(game, c);
      else if (c.numMonthsInTheRed === 3) notify(game.ctx, `${c.name} has been in debt for 3 months! Bankruptcy in 6 months unless the balance recovers.`, 'bad', undefined, undefined, 'company');
      else if (c.numMonthsInTheRed === 6) notify(game.ctx, `${c.name} has been in debt for 6 months! Bankruptcy in 3 months unless the balance recovers.`, 'bad', undefined, undefined, 'company');
    } else {
      c.numMonthsInTheRed = 0;
    }
  }
  c.negativeMonths = c.numMonthsInTheRed; // legacy mirror (diagnostics)
  c.pendingLedger = ended;
}

/** Bankruptcy: flag the company and stop every vehicle (stopAllCompanyVehicles). */
function declareBankrupt(game, c) {
  c.bankrupt = true;
  notify(game.ctx, `${c.name} has been declared bankrupt!`, 'bad', undefined, undefined, 'company');
  for (const v of game.state.vehicles) {
    if (findVehicle(game.state, v.id)) stopVehicle(game.ctx, v.id);
  }
}

/** Company::updateMonthlyHeadquarters (headquarters variation follows the performance index). */
export function updateMonthlyHeadquarters(game) {
  const c = ensureCompany(game.state.company);
  c.hqVariation = headquarterVariation(c);
  updateHQ(game.ctx); // T31: HQ level follows the performance index (cmdHQ.js)
}

/** CompanyManager::updateQuarterly: only AI thoughts are updated in OpenLoco, so nothing to do for the player company. */
export function updateQuarterly(_game) {}

/** CompanyManager::updateYearly: rotate expenditure years; vehicle yearly bookkeeping. */
export function updateYearly(game) {
  updateYearlyExpenditure(ensureCompany(game.state.company));
  VehicleManager.updateYearly(game);
}
