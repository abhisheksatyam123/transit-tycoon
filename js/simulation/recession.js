/**
 * Economy recessions (OpenTTD economy.cpp HandleEconomyFluctuations, economy_func.h EconomyIsInRecession).
 * `state.recession.fluct` counts months: positive = normal trade, <= 0 = recession. A recession starts when
 * the counter reaches 0 (it then holds -0..-3) and ends at -12; the next one is 312..567 months later.
 * While in recession industries and towns produce half the cargo / passengers (rounded up, OpenTTD (x+1)>>1).
 * Gated by the economyRecessions setting (off by default): no state is created and no random numbers are
 * drawn while it is off, so existing games and hashes are unchanged.
 */
import { getSetting } from './settings.js';
import { notify } from './news.js';

/** True while a recession is running (setting on and the counter is <= 0). */
export function isInRecession(state) {
  return !!(state.recession && state.recession.fluct <= 0 && getSetting(state, 'economyRecessions'));
}

/** Halve an amount of produced cargo / passengers while in recession (OpenTTD (amount + 1) >> 1). */
export function recessionHalve(state, amount) {
  return isInRecession(state) ? (amount + 1) >> 1 : amount;
}

/**
 * Monthly economy fluctuation update (OpenTTD HandleEconomyFluctuations, economy fluctuating).
 * Called from the game loop at the start of each month, after inflation.
 * @param {{state:object, rng:object, ctx:object}} game
 */
export function updateMonthly(game) {
  const s = game.state;
  if (!getSetting(s, 'economyRecessions')) return;
  // StartupEconomy: the first recession comes 168..423 months after the setting is switched on
  if (!s.recession) s.recession = { fluct: game.rng.int(0, 255) + 168 };
  const r = s.recession;
  r.fluct--;
  if (r.fluct === 0) {
    r.fluct = -game.rng.int(0, 3);
    notify(game.ctx, 'World Recession! Financial experts fear worst as economy slumps!', 'bad', undefined, undefined, 'economy');
  } else if (r.fluct === -12) {
    r.fluct = game.rng.int(0, 255) + 312;
    notify(game.ctx, 'Recession over! Upturn in trade gives confidence to industries as economy strengthens!', 'good', undefined, undefined, 'economy');
  }
}
