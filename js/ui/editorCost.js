/**
 * Cost text for tool hints and previews. In the scenario editor every build is free: show "free"
 * instead of a price, so no hint or preview suggests money is spent (see simulation/scenarioEditor.js).
 */
import { money } from './format.js';

/**
 * @param {any} game current game (may be null)
 * @param {number} cost
 * @returns {string}
 */
export function costText(game, cost) {
  return game && game.state && game.state.editor ? 'free' : money(cost);
}
