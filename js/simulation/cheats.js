/**
 * Cheats (OpenTTD cheat_gui.cpp / cheat_type.h, subset): money +10M, change year (clamped like
 * ClickChangeDateCheat, cheat_gui.cpp:104-108), magic bulldozer (road_cmd.cpp:276, town_cmd.cpp:702, industry_cmd.cpp:504).
 * Build while paused is always allowed in TT (no pause gate in trackRules / placement), so it needs no toggle.
 * `state.cheated` is lazy: it is set only when a cheat is used, and the company window shows it (OpenTTD marks
 * the company as having cheated). `state.cheats` (lazy) holds the magic bulldozer toggle.
 */
import { companyById } from './owner.js';

/** OpenTTD MoneyCheat step: the cheat window's money button adds 10,000,000 (cheat_gui.cpp _money_cheat_amount). */
export const MONEY_CHEAT_AMOUNT = 10000000;
/** OpenTTD CalendarTime::MIN_YEAR / MAX_YEAR (timer_game_common.h): clamp range for the year cheat. */
export const CHEAT_MIN_YEAR = 0;
export const CHEAT_MAX_YEAR = 5000000;

/** Mark that a cheat was used (lazy field). */
function markCheated(state) { state.cheated = true; }

/**
 * Add money to the player's company (OpenTTD CmdMoneyCheat: the amount is added to the bank balance).
 * @returns {{ok:true,money:number}|{ok:false,error:string}}
 */
export function moneyCheat(state, amount = MONEY_CHEAT_AMOUNT) {
  const c = companyById(state, null);
  if (!c) return { ok: false, error: 'No company' };
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, error: 'Nothing to add' };
  c.money += Math.trunc(amount);
  markCheated(state);
  return { ok: true, money: c.money };
}

/**
 * Change the calendar year (OpenTTD ClickChangeDateCheat): clamped to the valid range, same-year is a no-op,
 * month and day are kept.
 * @returns {{ok:true,year:number,clamped:boolean}|{ok:false,error:string}}
 */
export function changeYearCheat(state, year) {
  if (!Number.isFinite(year)) return { ok: false, error: 'Invalid year' };
  const want = Math.trunc(year);
  const newYear = Math.min(CHEAT_MAX_YEAR, Math.max(CHEAT_MIN_YEAR, want));
  if (newYear === state.date.year) return { ok: true, year: newYear, clamped: false };
  state.date.year = newYear;
  markCheated(state);
  return { ok: true, year: newYear, clamped: newYear !== want };
}

/** Magic bulldozer on/off (OpenTTD _cheats.magic_bulldozer.value). Setting it on marks the game cheated. */
export function setMagicBulldozer(state, on) {
  if (!on) {
    if (state.cheats) delete state.cheats.magicBulldozer;
    return { ok: true, on: false };
  }
  state.cheats = { ...(state.cheats || {}), magicBulldozer: true };
  markCheated(state);
  return { ok: true, on: true };
}

/** True when the magic bulldozer is on (lazy: absent unless used). */
export function magicBulldozer(state) {
  return !!(state && state.cheats && state.cheats.magicBulldozer);
}

/**
 * Generic on/off cheat flags kept in state.cheats (lazy, like the magic bulldozer). Setting one on marks the game
 * cheated; turning it off deletes the key so a save stays clean. Keys: 'stationRating' (OpenTTD station_rating:
 * player stations rate 100%), 'noJetCrash' (OpenTTD no_jetcrash: jets at short-strip airports never crash by the 3276 rule).
 */
export const CHEAT_FLAGS = ['stationRating', 'noJetCrash', 'crossingTunnels', 'setupProd'];

/** Set a cheat flag (CHEAT_FLAGS). @returns {{ok:true,on:boolean}|{ok:false,error:string}} */
export function setCheatFlag(state, key, on) {
  if (!CHEAT_FLAGS.includes(key)) return { ok: false, error: 'Unknown cheat' };
  if (!on) {
    if (state.cheats) { delete state.cheats[key]; if (!Object.keys(state.cheats).length) delete state.cheats; }
    return { ok: true, on: false };
  }
  state.cheats = { ...(state.cheats || {}), [key]: true };
  markCheated(state);
  return { ok: true, on: true };
}

/** True when a cheat flag is on (lazy). */
export function cheatFlag(state, key) {
  return !!(state && state.cheats && state.cheats[key]);
}

/** OpenTTD station_rating cheat: player stations get the maximum rating (station_cmd.cpp:4016). */
export function stationRatingFixed(state) { return cheatFlag(state, 'stationRating'); }

/** OpenTTD no_jetcrash cheat: short-strip jet landings skip the 3276 crash chance (aircraft_cmd.cpp:1391). */
export function noJetCrash(state) { return cheatFlag(state, 'noJetCrash'); }

/** True when any cheat was used in this game (lazy). */
export function isCheated(state) {
  return !!(state && state.cheated);
}

/** OpenTTD crossing_tunnels cheat: tunnels may cross each other underground (cheat_type.h:30). */
export function crossingTunnelsAllowed(state) { return cheatFlag(state, 'crossingTunnels'); }

/**
 * Switch company (OpenTTD cheat_type.h:20 _cheats.switch_company.value,
 * company_cmd.cpp:123 CmdChangeCompanySetting): control a rival company instead of the
 * player company. targetCompanyId null/0 = player company; otherwise must match a rival id.
 * Lazy: state.activeCompanyId is set only by this cheat; state.cheated is marked.
 */
export function activeCompanyId(state) {
  return (state && state.activeCompanyId) ?? 0;
}
export function switchCompany(state, targetCompanyId) {
  const target = targetCompanyId || null;
  if (target !== null) {
    const rivals = (state && state.rivals) || [];
    if (!rivals.some((r) => r.id === target)) return { ok: false, error: 'Unknown company' };
  }
  state.activeCompanyId = target;
  markCheated(state);
  return { ok: true, activeCompanyId: state.activeCompanyId };
}
