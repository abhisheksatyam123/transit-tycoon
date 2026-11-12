/**
 * Confirmation before an action that replaces or overwrites player progress (UI only).
 * Uses the browser's confirm(), the same as the save slot Delete button.
 */

/**
 * True when the running game would be lost (any game is loaded; a fresh new game counts too).
 * @param {any} game app.game
 * @returns {boolean}
 */
export function hasRunningGame(game) {
  return !!game;
}

/**
 * Ask before replacing the running game (load, new game, scenario editor, Moscow).
 * @param {any} game app.game
 * @param {(msg: string) => boolean} [ask] confirm function (injectable for tests)
 * @returns {boolean} true to go ahead
 */
export function confirmDiscardGame(game, ask = (msg) => globalThis.confirm(msg)) {
  if (!hasRunningGame(game)) return true;
  return !!ask('Discard the current game? Progress since the last save will be lost.');
}

/**
 * Ask before a save slot that already holds a game is overwritten.
 * @param {string} slot
 * @param {(msg: string) => boolean} [ask]
 * @returns {boolean} true to go ahead
 */
export function confirmOverwriteSlot(slot, ask = (msg) => globalThis.confirm(msg)) {
  return !!ask(`Overwrite save slot ${slot}?`);
}
