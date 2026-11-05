/**
 * Ported from OpenLoco (MIT), src/World/Company.cpp: Company::updateMonthly1 (cargo history, performance index,
 * company value, interest, bankruptcy), calculatePerformanceIndex (0x00437C8C), calculateCompanyValue (0x00437D79),
 * performanceToRating (0x00437D60), updateYearly (0x004312D2, expenditure year rotation), updateLoanAutorepay,
 * getHeadquarterPerformanceVariation (0x0042F042), plus CompanyManager::applyPaymentToCompany bookkeeping.
 *
 * State: the transit-tycoon company record (economy.js createCompany) is extended with the OpenLoco fields below; every
 * field has a default via ensureCompany() so old saves load. Monthly ledgers (company.ledger) stay the UI's source;
 * `expenditures` mirrors OpenLoco's per-year expenditure[type] table (index 0 = current year, 4 years kept).
 * Mapping: train.veh2->totalRecentProfit() = sum of v.profit[] (loco/vehicle.js, last 4 months); refundCost = v.value.
 * Emotions / observation / AI thoughts are not ported (single human company, no owner portrait).
 */

export const EXPENDITURE_HISTORY = 4; // kExpenditureHistoryCapacity
export const HISTORY_LENGTH = 120; // performance / value / cargo history months
export const RATING_NAMES = ['Platelayer', 'Engineer', 'Traffic Manager', 'Transport Coordinator', 'Route Supervisor',
  'Director', 'Chief Executive', 'Chairman', 'President', 'Tycoon'];
/** Months in the red before bankruptcy (OpenLoco: 9; warnings at 3 and 6). */
export const BANKRUPT_MONTHS = 9;

/** Default OpenLoco company fields (merged into the record). */
export function companyDefaults() {
  return {
    cargoUnitsTotalDelivered: 0, cargoUnitsTotalDistance: 0, cargoUnitsDeliveredHistory: [], cargoUnitsDistanceHistory: [],
    cargoDelivered: {}, performanceIndex: 0, performanceIndexHistory: [], currentRating: 0, companyValue: 0,
    companyValueHistory: [], vehicleProfit: 0, historySize: 0, numMonthsInTheRed: 0, bankrupt: false,
    autopayLoan: false, hqVariation: 0, numExpenditureYears: 0, expenditures: [{}],
  };
}

/** Fill missing OpenLoco fields on a company record (old saves). */
export function ensureCompany(c) {
  const d = companyDefaults();
  for (const k of Object.keys(d)) if (c[k] === undefined) c[k] = d[k];
  if (c.numMonthsInTheRed === 0 && c.negativeMonths) c.numMonthsInTheRed = c.negativeMonths;
  return c;
}

/** Integer square root (Math::Vector::fastSquareRoot). */
export function fastSquareRoot(n) { return Math.floor(Math.sqrt(Math.max(0, n))); }

/** CompanyManager::applyPaymentToCompany expenditure bookkeeping: signed amount into this year's expenditure[type]. */
export function noteExpenditure(c, type, signedAmount) {
  const e = c.expenditures || (c.expenditures = [{}]);
  e[0][type] = (e[0][type] || 0) + signedAmount;
}

/** Called on every cargo delivery (VehicleHead.cpp ~3120): feeds performance index & delivered statistics. */
export function recordDelivery(c, cargoId, units, tilesDistance) {
  ensureCompany(c);
  c.cargoUnitsTotalDelivered += units;
  c.cargoUnitsTotalDistance = Math.min(0xffffffff, c.cargoUnitsTotalDistance + units * tilesDistance);
  c.cargoDelivered[cargoId] = Math.min(0xffffffff, (c.cargoDelivered[cargoId] || 0) + units);
}

/** veh2->totalRecentProfit(): profit over the last 4 months. */
export function totalRecentProfit(v) { return (v.profit || []).reduce((a, b) => a + b, 0); }

/** Performance index (0..1000). `eco` = currency factor for cost index 0, normalised to 1024 at game start. */
export function calculatePerformanceIndex(c, vehicles, eco) {
  if (c.bankrupt) return 0;
  let totalProfit = 0;
  for (const v of vehicles) totalProfit += Math.floor(totalRecentProfit(v) / 2); // original uses >> 1
  totalProfit = Math.max(0, totalProfit);
  const partial = fastSquareRoot(totalProfit) * 75;
  const ecoFactor = Math.max(1, fastSquareRoot(eco));
  let profitFactor = 500;
  if (partial < ecoFactor * 500) profitFactor = Math.floor(partial / ecoFactor);
  const cargoFactor = Math.min(500, fastSquareRoot(Math.floor((c.cargoUnitsDistanceHistory[0] || 0) / 4)));
  return profitFactor + cargoFactor;
}

/** Company value: cash - loan + 8x recent vehicle profit + vehicle sell values; vehicleProfit = sum(profit >> 2). */
export function calculateCompanyValue(c, vehicles) {
  if (c.bankrupt) return { vehicleProfit: 0, companyValue: 0 };
  let value = c.money - c.loan;
  let vehicleProfit = 0;
  for (const v of vehicles) {
    const p = totalRecentProfit(v);
    vehicleProfit += Math.floor(p / 4);
    value += p * 8;
    value += v.value || 0;
  }
  return { vehicleProfit, companyValue: Math.max(0, value) };
}

/** performanceToRating. */
export function performanceToRating(performanceIndex) { return Math.min(9, Math.floor(performanceIndex / 100)); }

/** Company::getHeadquarterPerformanceVariation. */
export function headquarterVariation(c) { return Math.min(Math.floor(c.performanceIndex / 200), 4); }

/** Rotate a history array: newest first, bounded. */
export function pushHistory(arr, value, max = HISTORY_LENGTH) {
  arr.unshift(value);
  if (arr.length > max) arr.length = max;
}

/** Company::updateYearly: rotate the per-year expenditure table. */
export function updateYearlyExpenditure(c) {
  c.expenditures.unshift({});
  if (c.expenditures.length > EXPENDITURE_HISTORY) c.expenditures.length = EXPENDITURE_HISTORY;
  c.numExpenditureYears = Math.min(c.numExpenditureYears + 1, EXPENDITURE_HISTORY);
}
