/**
 * First-start Goals window for scenario games (shared by the URL boot and the title menu).
 */

/** Storage key: set once the player closes the auto-opened Goals window (never auto-open again). */
const GOALS_DISMISSED_KEY = 'tt-goals-dismissed';

/**
 * First start of a scenario game: open the Goals window once so the objective is visible.
 * Only for the Moscow scenario, never on loads, and not after the player dismissed it before.
 * Narrow (phone) screens get a one-line toast instead, so the map is not covered.
 * @param {any} app
 * @param {any} game
 */
export function maybeOpenGoals(app, game) {
  if (game.state.scenario !== 'moscow') return;
  let dismissed = false;
  try { dismissed = localStorage.getItem(GOALS_DISMISSED_KEY) === '1'; } catch { /* storage blocked */ }
  if (dismissed) return;
  const markDismissed = () => { try { localStorage.setItem(GOALS_DISMISSED_KEY, '1'); } catch { /* ignore */ } };
  if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) {
    app.toast('Goals: press O to see your objective', 'info');
    markDismissed();
    return;
  }
  app.open('goals');
  const win = app.wm.windows.get('goals');
  if (win) win.spec.onClose = markDismissed;
  else markDismissed();
}
