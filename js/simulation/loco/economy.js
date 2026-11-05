/**
 * Ported from OpenLoco (MIT), src/Economy/Economy.cpp (updateMonthly 0x0046E239, setInflationForYear 0x0046E2C0,
 * getInflationAdjustedCost) and src/World/CompanyManager.cpp calculateDeliveredCargoPayment (0x0042F23C).
 *
 * State: state.economy = { factors: number[32], base: number[32] } (plain JSON, lazily created by ensureEconomy so old
 * saves load). OpenLoco's currencyMultiplicationFactor[32] starts at 1024 in 1900 and inflates by factor*kInflation/4096
 * each month until 2030. Deviation: transit-tycoon prices are tuned for the *start* date of a game, so cost tables use the
 * ratio factors/base (costScale, 1.0 at game start) and the cargo payment factors below are calibrated for factor 1024.
 *
 * Cargo mapping (config/cargos.js -> CargoObject): paymentFactor = round(basePay*1024); premiumDays = days1;
 * maxNonPremiumDays = days2; nonPremiumRate = 32768/days2 (loses 50% over days2 days, as the old timeFactor did);
 * penaltyRate = 257 (65536/255, linear to ~0 over 255 more days); paymentIndex = COST_INDEX.cargo[id] (synthetic, since
 * transit-tycoon has no object file).
 */
import { CARGOS, CARGO_BY_ID } from '../../config/cargos.js';

/** Economy.cpp kInflationFactors. */
export const INFLATION_FACTORS = [20, 20, 20, 20, 23, 20, 23, 23, 20, 17, 17, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20];

/** Cost indices into the 32 currency multiplication factors (synthetic mapping for transit-tycoon). */
export const COST_INDEX = {
  general: 0, construction: 11, vehicles: 12, running: 13, property: 14,
  cargo: { PASS: 1, MAIL: 2, COAL: 3, WOOD: 4, OIL: 5, GRAI: 6, LVST: 7, IORE: 8, STEL: 9, GOOD: 10 },
};

const START_FACTOR = 1024;

/** One monthly inflation step on a factor array (Economy::updateMonthly). */
function inflate(factors) {
  for (let i = 0; i < 32; i++) factors[i] += Math.floor((INFLATION_FACTORS[i] * factors[i]) / 4096);
}

/** Economy::setInflationForYear: fresh factors for `year` (clamped to 1900..2030). */
export function inflationFactorsForYear(year) {
  const f = new Array(32).fill(START_FACTOR);
  const months = (Math.max(1900, Math.min(2030, year)) - 1900) * 12;
  for (let m = 0; m < months; m++) inflate(f);
  return f;
}

/** Lazily create state.economy (also for old saves). */
export function ensureEconomy(state) {
  if (!state.economy || !Array.isArray(state.economy.factors)) {
    const f = inflationFactorsForYear(state.date ? state.date.year : 1950);
    state.economy = { factors: f, base: f.slice() };
  }
  return state.economy;
}

/** Economy::updateMonthly (called by the game loop each month while year <= 2029). */
export function updateMonthly(game) {
  inflate(ensureEconomy(game.state).factors);
}

/** Economy::getCurrencyMultiplicationFactor. */
export function getCurrencyMultiplicationFactor(state, costIndex) {
  return ensureEconomy(state).factors[costIndex];
}

/** Inflation relative to the start of the game: 1.0 at start, growing ~5.9%/year. Scale transit-tycoon cost tables with it. */
export function costScale(state, costIndex) {
  const e = ensureEconomy(state);
  return e.factors[costIndex] / e.base[costIndex];
}

/** Scale an amount (construction cost, upkeep, vehicle price...) by inflation; returns an integer. */
export function inflateCost(state, costIndex, amount) {
  return Math.round(amount * costScale(state, costIndex));
}

/** Factor normalised so that it equals 1024 at game start (what cargo payment factors are calibrated for). */
function normalisedFactor(state, costIndex) {
  return Math.floor(costScale(state, costIndex) * START_FACTOR);
}

/** Economy::getInflationAdjustedCost: costFactor * normalised multiplication factor / 2^divisor (integer, truncating). */
export function getInflationAdjustedCost(state, costFactor, costIndex, divisor) {
  return Math.trunc((costFactor * normalisedFactor(state, costIndex)) / 2 ** divisor);
}

/** CargoObject-like payment parameters for a transit-tycoon cargo id (null for unknown cargo). */
export function cargoPaymentParams(cargoId) {
  const c = CARGO_BY_ID[cargoId];
  if (!c) return null;
  return {
    paymentFactor: Math.round(c.basePay * 1024), premiumDays: c.days1, maxNonPremiumDays: c.days2,
    nonPremiumRate: Math.min(65535, Math.round(32768 / Math.max(1, c.days2))), penaltyRate: 257,
    paymentIndex: COST_INDEX.cargo[cargoId] ?? 0,
  };
}

/**
 * CompanyManager::calculateDeliveredCargoPayment: payment for delivering `numUnits` of a cargo over `distance` tiles
 * after `numDays` days in transit (fractional days are floored, as OpenLoco counts whole days).
 * @param {object} state game state (for inflation)
 * @param {string} cargoId transit-tycoon cargo id ('COAL', 'PASS', ...)
 * @param {number} numUnits
 * @param {number} distance tiles (manhattan in transit-tycoon)
 * @param {number} numDays days in transit
 * @returns {number} integer money (0 for unknown cargo / non-positive amounts)
 */
export function calculateDeliveredCargoPayment(state, cargoId, numUnits, distance, numDays) {
  const o = cargoPaymentParams(cargoId);
  if (!o || !(numUnits > 0) || !(distance > 0)) return 0;
  numDays = Math.max(0, Math.floor(numDays));
  let percent = o.paymentFactor * 65536; // payment factor shifted by 16 for integer maths
  const reduce = (p) => { percent = Math.max(0, percent - o.paymentFactor * p); };
  const nonPremiumDays = numDays - o.premiumDays;
  if (nonPremiumDays > 0) {
    reduce(o.nonPremiumRate * Math.min(nonPremiumDays, o.maxNonPremiumDays));
    const penaltyDays = Math.min(255, nonPremiumDays - o.maxNonPremiumDays);
    if (penaltyDays > 0) reduce(o.penaltyRate * penaltyDays);
  }
  percent = Math.floor(percent / 65536);
  const unitDistancePayment = getInflationAdjustedCost(state, percent, o.paymentIndex, 8);
  return Math.trunc((unitDistancePayment * numUnits * distance) / 4096);
}

/** Economy::getDeliveryCargoPaymentsTable: payment for 100 units over 10 tiles after 2,4,..120 days (60 entries). */
export function getDeliveryCargoPaymentsTable(state, cargoId) {
  const t = [];
  for (let d = 2; d < 122; d += 2) t.push(calculateDeliveredCargoPayment(state, cargoId, 100, 10, d));
  return t;
}

/** All cargo ids with payment params (for UI / tests). */
export const PAYMENT_CARGO_IDS = CARGOS.map((c) => c.id);
