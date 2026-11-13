/**
 * Browser-only game preferences (localStorage 'tt.gamePrefs'), not in the save.
 * pauseOnNewGame (OpenTTD pause_on_newgame): a new game starts paused. Default off.
 */
const GAME_PREFS_KEY = 'tt.gamePrefs';

/** @param {string|null|undefined} raw @returns {{pauseOnNewGame:boolean}} */
export function parseGamePrefs(raw) {
  let o = null;
  try { o = raw ? JSON.parse(raw) : null; } catch { o = null; }
  return { pauseOnNewGame: !!(o && typeof o === 'object' && o.pauseOnNewGame === true) };
}

/** @returns {{pauseOnNewGame:boolean}} */
export function loadGamePrefs() {
  try { return parseGamePrefs(typeof localStorage === 'undefined' ? null : localStorage.getItem(GAME_PREFS_KEY)); } catch { return parseGamePrefs(null); }
}

/** @param {boolean} on */
export function setPauseOnNewGame(on) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(GAME_PREFS_KEY, JSON.stringify({ ...loadGamePrefs(), pauseOnNewGame: !!on }));
  } catch { /* storage unavailable: applies to this session only via the in-memory read */ }
}
