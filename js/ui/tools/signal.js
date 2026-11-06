/**
 * Block signal tool (T3b, OpenTTD CMD_BUILD_SIGNALS): click a straight rail tile to place a two-way block
 * signal; click a tile that already has one to remove it. Hover shows the price or the refusal reason.
 */
import { createPlacementTool } from './placement.js';
import { money } from '../format.js';

/** @param {import('../app.js').App} app */
export function createSignalTool(app) {
  return createPlacementTool(app, {
    id: 'signal',
    label: 'Signal',
    hint: () => 'Click a straight rail tile to place a block signal (' + money(app.game.buildSignal(0, 0, { dryRun: true }).cost || 0) + '); click a signal to remove it. Esc cancels.',
    command: (game, x, y, opts) => {
      const t = game.state.map.tiles[y * game.state.map.width + x];
      return t.signal ? game.removeSignal(x, y, opts) : game.buildSignal(x, y, opts);
    },
    footprint: (x, y) => [{ x, y }],
  });
}
