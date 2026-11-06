/**
 * Block signal tool (T3b, OpenTTD CMD_BUILD_SIGNALS): click a straight rail tile to place a two-way block
 * signal; click a tile that already has one to remove it. Hover shows the price or the refusal reason.
 */
import { createPlacementTool } from './placement.js';
import { money } from '../format.js';
import { signalDefaultDir, SIGNAL_KINDS } from '../../simulation/signals.js';


/** @param {import('../app.js').App} app */
export function createSignalTool(app) {
  /** Kind used for the next placement (T3c): block (two-way), oneway or path. */
  let kind = 'block';
  const names = { block: 'block', oneway: 'one-way', path: 'path', entry: 'entry pre-signal', exit: 'exit pre-signal', combo: 'combo pre-signal' };
  return createPlacementTool(app, {
    id: 'signal',
    label: 'Signal',
    hint: () => 'Click a straight rail tile to place a ' + names[kind] + ' signal (' + money(app.game.buildSignal(0, 0, { dryRun: true }).cost || 0) + '). Key S: next kind (now: ' + names[kind] + '); click a one-way/path signal to reverse it, click again to remove; click a block signal to remove it. Esc cancels.',
    command: (game, x, y, opts) => {
      const t = game.state.map.tiles[y * game.state.map.width + x];
      if (!t.signal) return game.buildSignal(x, y, { ...opts, type: kind });
      // one-way/path signal at its default direction: the first click reverses it, the next click removes it
      if (typeof t.signal === 'object' && t.signal.dir === signalDefaultDir(game.state, x, y)) return game.flipSignal(x, y, opts);
      return game.removeSignal(x, y, opts);
    },
    footprint: (x, y) => [{ x, y }],
    key: (e) => {
      if (e.key !== 's' && e.key !== 'S') return false;
      kind = SIGNAL_KINDS[(SIGNAL_KINDS.indexOf(kind) + 1) % SIGNAL_KINDS.length];
      return true;
    },
  });
}
