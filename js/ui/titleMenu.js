/**
 * Title screen / main menu (UI only). A centred panel over the running map: the current or random world
 * keeps rendering behind a dim overlay while the simulation is paused. Opened on a plain boot (see main.js)
 * and from the "TT" toolbar button. Escape or Resume closes it and restores the previous speed.
 */
import { el } from './dom.js';
import { loadSlotData } from './storage.js';
import { runWithLoading, buildingLabel } from './loading.js';
import { openNewGame } from './windows/newGame.js';
import { openScenarioSetup } from './windows/scenarioEditor.js';
import { createGameFast } from './scenarioSnapshot.js';

export const TITLE_VERSION = '0.1.0';
const MOSCOW_REQUEST = Object.freeze({ scenario: 'moscow', seed: 1 });

/** @type {null | { close: () => void }} */
let current = null;

/** True while the title menu is on screen. */
export function titleMenuOpen() { return !!current; }

/**
 * Open the main menu over the app. Returns the existing handle if it is already open.
 * @param {import('./app.js').App} app
 * @param {{loaded?: boolean}} [opts] loaded: the autosave is already the running game (restored at boot),
 *   so Continue only closes the menu instead of loading it again
 * @returns {{close: () => void}}
 */
export function openTitleMenu(app, opts = {}) {
  if (current) return current;
  const prevFocus = /** @type {HTMLElement|null} */ (document.activeElement);
  const wasSpeed = app.speed > 0 ? app.speed : (app.prevSpeed || 1);
  const hadAutosave = !!loadSlotData('autosave');
  app.setSpeed(0); // simulation paused while the menu is up

  let closed = false;
  let overlay = null;
  /** Capture-phase key handler: while the menu is up, keys never reach the map/app shortcuts. */
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
  };
  /**
   * @param {boolean} resume restore the previous simulation speed
   */
  const close = (resume) => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    if (overlay) overlay.remove();
    if (current === handle) current = null;
    if (resume) app.setSpeed(wasSpeed);
    if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') prevFocus.focus();
  };
  /** Close the menu (resuming the game), then run the action: a window or new game must not sit under the menu. */
  const then = (fn) => () => { close(true); fn(); };

  const btn = (label, hint, onclick, cls = '') =>
    el(`button.btn.tm-btn${cls}`, { type: 'button', title: hint, onclick },
      el('span.tm-btn-label', { text: label }), el('span.tm-btn-hint', { text: hint }));

  const rows = [];
  if (hadAutosave) {
    rows.push(btn('Continue', 'Resume your autosaved game', opts.loaded ? then(() => {}) : then(async () => {
      const d = loadSlotData('autosave');
      if (!(d && await app.loadFromString(d))) app.toast('Autosave could not be loaded', 'error');
    }), ' primary'));
  }
  rows.push(btn('New game', 'Choose seed, map size and towns', then(() => openNewGame(app)), hadAutosave ? '' : ' primary'));
  rows.push(btn('Scenario editor', 'Build a map from scratch: terrain, towns, industries; set the start year and Play', then(() => openScenarioSetup(app))));
  rows.push(btn('Moscow scenario', 'Real-OSM Moscow with staged goals', then(async () => {
    const game = await runWithLoading(buildingLabel(MOSCOW_REQUEST.scenario), () => createGameFast(MOSCOW_REQUEST, app.GameClass));
    app.setGame(game);
    app.announceScenario(game);
  })));
  rows.push(btn('Load game', 'Load a saved game', then(() => app.open('load'))));
  rows.push(btn('Settings', 'Game options and interface', then(() => app.open('settings'))));
  rows.push(btn('Keyboard shortcuts', 'View and change the keys', then(() => app.open('hotkeys'))));
  rows.push(btn('How to play', 'Controls and a short tutorial', then(() => app.open('help'))));

  const panel = el('div.tm-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Transit Tycoon main menu' },
    el('div.tm-head', null,
      el('span.tm-logo', { text: 'TT' }),
      el('div.tm-title', null, el('h1', { text: 'Transit Tycoon' }), el('p.muted.small', { text: 'Build the network. Move the city.' }))),
    el('div.tm-menu', null, rows),
    el('div.tm-foot', null,
      el('button.btn.sm', { type: 'button', text: 'Resume', onclick: () => close(true) }),
      el('p.muted.small', { text: `v${TITLE_VERSION} · Original code inspired by OpenTTD; rules ported from OpenLoco (MIT). Classic graphics: OpenGFX (GPL-2.0).` })));
  overlay = el('div.tm-overlay', null, panel);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(true); });
  document.body.appendChild(overlay);
  window.addEventListener('keydown', onKey, true);
  const first = /** @type {HTMLElement|null} */ (overlay.querySelector('button.tm-btn'));
  if (first) first.focus({ preventScroll: true });

  const handle = { close: () => close(true) };
  current = handle;
  return handle;
}
