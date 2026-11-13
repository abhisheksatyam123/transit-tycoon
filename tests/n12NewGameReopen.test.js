/**
 * N12-B: the New Game dialog is rebuilt on every open, so its selects follow the remembered prefs and
 * are never a stale DOM from an earlier open (a pinned or still-open dialog used to be returned as is).
 */
import { test, expect } from 'bun:test';
import { openNewGame } from '../js/ui/windows/newGame.js';

/** Minimal window manager stand-in: same `windows` map and open/close contract as WindowManager. */
function fakeApp() {
  const calls = [];
  const app = {
    calls,
    wm: {
      windows: new Map(),
      close(id) { calls.push(['close', id]); this.windows.delete(id); },
      open(id, spec) {
        calls.push(['open', id]);
        if (this.windows.has(id)) return this.windows.get(id); // the real manager: reuse the old window
        const win = { id, spec };
        this.windows.set(id, win);
        return win;
      },
    },
  };
  return app;
}

test('opening New Game with no dialog open builds it once (no close)', () => {
  const app = fakeApp();
  openNewGame(app);
  expect(app.calls).toEqual([['open', 'newGame']]);
});

test('reopening while the dialog is still open rebuilds it (close, then open)', () => {
  const app = fakeApp();
  const first = openNewGame(app);
  const second = openNewGame(app);
  expect(app.calls).toEqual([['open', 'newGame'], ['close', 'newGame'], ['open', 'newGame']]);
  expect(second).not.toBe(first);
  expect(second.spec.title).toBe('New Game');
});
