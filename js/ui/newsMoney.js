/**
 * Display-time currency for news text. News items bake money as default-format "$1,234" when generated;
 * when the player picked another currency, the amounts are re-formatted here (the stored text is unchanged).
 */
import { formatMoney, CURRENCIES } from '../simulation/currency.js';

/** Default-format money amount: optional minus, "$", digits with thousands commas, optional decimals. */
const DEFAULT_MONEY_RE = /-?\$[\d,]+(\.\d+)?/g;

/**
 * Replace default-format money amounts in a text with formatMoney(value, code).
 * The default currency (or an unknown code) returns the text unchanged.
 * @param {string} text
 * @param {string} code currency id (see CURRENCIES)
 * @returns {string}
 */
export function localizeMoneyText(text, code) {
  if (typeof text !== 'string' || !code || code === 'DEFAULT' || !CURRENCIES[code]) return text;
  return text.replace(DEFAULT_MONEY_RE, (m) => {
    const n = Number(m.replace(/[$,]/g, ''));
    return Number.isFinite(n) ? formatMoney(n, code) : m;
  });
}
