/**
 * Block signal tool (T3b, OpenTTD CMD_BUILD_SIGNALS): click a straight rail tile to place a two-way block
 * signal; click a tile that already has one to remove it. Hover shows the price or the refusal reason.
 *
 * Drag (OpenTTD drag signals): press on one tile, drag along a straight, diagonal or L run, release to place a
 * signal every `signalSpacing` tiles (ui/signalSpacing.js, default 4), using the selected kind. Ctrl+drag removes
 * the signals on the run. The preview shows the run's total cost. A run stops at junctions/stations (signalRun.js).
 * A press and release on the same tile is a plain click, unchanged.
 */
import { createPlacementTool } from './placement.js';
import { money } from '../format.js';
import { signalDefaultDir, SIGNAL_KINDS } from '../../simulation/signals.js';
import { lTiles } from './geometry.js';
import { diagPath } from '../../simulation/shapes.js';
import { getSignalSpacing } from '../signalSpacing.js';

/**
 * Tiles of a signal drag from a to b: straight when aligned, a 45-degree staircase when diagonal, else L-shaped.
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @returns {{x:number,y:number}[]}
 */
export function signalDragTiles(x0, y0, x1, y1) {
  const ax = Math.abs(x1 - x0), ay = Math.abs(y1 - y0);
  if (ax === ay) return diagPath(x0, y0, x1, y1);
  return lTiles(x0, y0, x1, y1);
}

/** @param {import('../app.js').App} app */
export function createSignalTool(app) {
  /** Kind used for the next placement (T3c): block (two-way), oneway or path. */
  let kind = 'block';
  const names = { block: 'block', oneway: 'one-way', path: 'path', entry: 'entry pre-signal', exit: 'exit pre-signal', combo: 'combo pre-signal' };
  const base = createPlacementTool(app, {
    id: 'signal',
    label: 'Signal',
    hint: () => 'Click a straight rail tile to place a ' + names[kind] + ' signal (' + money(app.game.buildSignal(0, 0, { dryRun: true }).cost || 0) + '). Drag along track to place one every ' + getSignalSpacing() + ' tiles; Ctrl+drag removes. Key S: next kind (now: ' + names[kind] + '); click a one-way/path signal to reverse it, click again to remove; click a block signal to remove it. Esc cancels.',
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
  let start = null;
  let lastKey = '';
  let ctrlPreview = false; // Ctrl held during the drag: preview removal

  /** Preview the drag run: tiles + dry-run cost (or refusal). */
  const preview = (end) => {
    const tiles = signalDragTiles(start.x, start.y, end.x, end.y);
    const key = `${start.x},${start.y},${end.x},${end.y},${getSignalSpacing()},${kind}`;
    if (key !== lastKey) {
      lastKey = key;
      const res = app.game.buildSignalRun(tiles, { spacing: getSignalSpacing(), remove: !!ctrlPreview, type: kind, dryRun: true });
      const label = res.ok ? `${res.tiles} signal${res.tiles === 1 ? '' : 's'} · ${money(res.cost || 0)}` : res.error;
      app.renderer.overlay.preview = { tiles, ok: !!res.ok, label };
    }
  };

  return {
    id: base.id,
    label: base.label,
    get hint() { return base.hint; },
    key: base.key,
    move(t) {
      if (start) preview(t);
      else base.move(t);
    },
    down(t) {
      start = { x: t.x, y: t.y };
      lastKey = '';
    },
    up(t) {
      if (!start) { base.up(t); return; }
      const s = start;
      start = null;
      lastKey = '';
      app.renderer.overlay.preview = null;
      // a press and release on the same tile is a plain click (unchanged behaviour)
      if (s.x === t.x && s.y === t.y) { base.up(t); return; }
      const tiles = signalDragTiles(s.x, s.y, t.x, t.y);
      const res = app.game.buildSignalRun(tiles, { spacing: getSignalSpacing(), remove: !!t.ctrl, type: kind });
      app.exec(res, { x: t.x, y: t.y, sound: t.ctrl ? 'demolish' : 'build' });
    },
    cancel() {
      start = null;
      lastKey = '';
      base.cancel();
    },
  };
}
