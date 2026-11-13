/**
 * Company shares (OpenTTD CmdBuyShareInCompany / CmdSellShareInCompany, economy.cpp), simplified.
 *
 * Opt-in: the `shares` setting (default off). Each rival company has 4 shares of 25%. The player may buy
 * and sell them while the setting is on. Price per share = company value / 4 (OpenTTD uses the company
 * value >> 2). Buying is not allowed in a company younger than 6 months, nor the player's own company.
 * Buying the 4th share (the last 25%) takes the whole company over: the same transfer as a takeover offer.
 * Rival shares the player holds count towards the player's company value at their share price.
 *
 * Simplified: AI rivals never buy or sell shares, and the player cannot sell a share to a rival.
 * Lazy state: rivals carry `playerShares` (0..4) only once the player bought a share.
 */
import { getSetting, infiniteMoney } from './settings.js';
import { spend, earn } from './economy.js';
import { transferRival } from './aiCompanies.js';
import { pushNews } from './news.js';

/** OpenTTD: a company can be bought only after it is this many months old. */
export const SHARE_MIN_AGE_MONTHS = 6;
/** Shares per company (OpenTTD: 4 shares of 25%). */
export const SHARES_PER_COMPANY = 4;

const monthOf = (date) => date.year * 12 + date.month;

/** The player's shares in a rival (0 when none are bought). */
export function playerSharesOf(r) {
  return (r && r.playerShares) | 0;
}

/** Share price of a rival: its company value / 4 (OpenTTD). */
export function sharePrice(r) {
  return Math.floor(Math.max(0, r.companyValue || 0) / SHARES_PER_COMPANY);
}

/** Value of the player's rival shares (added to the player's company value). */
export function sharesValue(state) {
  let v = 0;
  for (const r of state.rivals || []) if (!r.bankrupt && playerSharesOf(r)) v += playerSharesOf(r) * sharePrice(r);
  return v;
}

/**
 * Buy or sell one share (25%) of a rival.
 * @param {{state:any}} ctx
 * @param {number} rivalId
 * @param {'buy'|'sell'} action
 * @returns {{ok:true, price:number, takeover?:boolean}|{ok:false, error:string}}
 */
export function tradeShare(ctx, rivalId, action) {
  const { state } = ctx;
  if (!getSetting(state, 'shares')) return { ok: false, error: 'Company shares are switched off in Settings' };
  const r = (state.rivals || []).find((q) => q.id === rivalId);
  if (!r || r.bankrupt) return { ok: false, error: 'No such company' };
  const held = playerSharesOf(r);
  const price = sharePrice(r);
  if (action === 'buy') {
    if (monthOf(state.date) - (r.foundedAt ?? 0) < SHARE_MIN_AGE_MONTHS) return { ok: false, error: `Company is younger than ${SHARE_MIN_AGE_MONTHS} months` };
    if (held >= SHARES_PER_COMPANY) return { ok: false, error: 'You own all the shares' };
    if (!infiniteMoney(state) && price > 0 && price > state.company.money) return { ok: false, error: 'Not enough money for a share' };
    spend(state.company, 'property', price);
    r.playerShares = held + 1;
    if (r.playerShares === SHARES_PER_COMPANY) {
      // the 4th share is the whole company: takeover (OpenTTD ownership transfer)
      pushNews(state, `You bought the last shares in ${r.name} for ${price} and took it over.`, 'good', undefined, undefined, 'company');
      transferRival(ctx, r);
      return { ok: true, price, takeover: true };
    }
    pushNews(state, `You bought a 25% share in ${r.name} for ${price}.`, 'info', undefined, undefined, 'company');
    return { ok: true, price };
  }
  if (action === 'sell') {
    if (held <= 0) return { ok: false, error: 'You own no shares in this company' };
    earn(state.company, price, 'property');
    r.playerShares = held - 1;
    pushNews(state, `You sold a 25% share in ${r.name} for ${price}.`, 'info', undefined, undefined, 'company');
    return { ok: true, price };
  }
  return { ok: false, error: 'Unknown action' };
}

/** Why a trade is not possible right now ('' when allowed): used by the Companies window tooltips. */
export function shareBlock(state, rivalId, action) {
  if (!getSetting(state, 'shares')) return 'Company shares are switched off (Settings > Companies)';
  const r = (state.rivals || []).find((q) => q.id === rivalId);
  if (!r || r.bankrupt) return 'This company is no longer listed';
  const held = playerSharesOf(r);
  if (action === 'buy') {
    if (monthOf(state.date) - (r.foundedAt ?? 0) < SHARE_MIN_AGE_MONTHS) return `Shares can be bought only after ${SHARE_MIN_AGE_MONTHS} months of company life`;
    if (held >= SHARES_PER_COMPANY) return 'You own all the shares';
    if (!infiniteMoney(state) && sharePrice(r) > 0 && sharePrice(r) > state.company.money) return 'Not enough money';
    return '';
  }
  return held <= 0 ? 'You own no shares in this company' : '';
}
