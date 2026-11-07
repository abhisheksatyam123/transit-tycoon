/**
 * F14: refusal text for build tools. A money refusal names the price and the balance
 * ("Not enough money: costs $X, you have $Y") so the player sees how far short they are;
 * every other refusal reason is shown unchanged. Pure: no game state is touched here.
 */
import { money } from '../format.js';

export const NOT_ENOUGH_MONEY = 'Not enough money';

/**
 * @param {string} error refusal reason from a command's dry run
 * @param {number|null} cost price of the build (null when unknown)
 * @param {number} balance company money now
 * @returns {string}
 */
export function refusalLabel(error, cost, balance) {
  const reason = error || 'Not possible';
  if (reason !== NOT_ENOUGH_MONEY || cost == null) return reason;
  return `${NOT_ENOUGH_MONEY}: costs ${money(cost)}, you have ${money(balance)}`;
}

/**
 * Price of a build that the money check refused. The command returns only the refusal, so the
 * dry run is repeated with the balance lifted for the moment; the balance is restored in finally.
 * Never changes the result for an affordable build (no call is made). Player companies only.
 * @param {any} game
 * @param {(opts:any)=>any} run dry-run call (opts include dryRun:true)
 * @returns {number|null}
 */
export function priceWhenRefused(game, run) {
  const company = game && game.state && game.state.company;
  if (!company) return null;
  const saved = company.money;
  try {
    company.money = Infinity;
    const res = run({ dryRun: true });
    return res && res.ok ? (res.cost || 0) : null;
  } finally {
    company.money = saved;
  }
}
