/**
 * Entry point: creates/loads the Game, wires renderer, minimap, UI and the game loop.
 * The only global is `window.__game` (debug handle to the current Game instance).
 */
import { HOTKEY_ACTIONS, shortcutTable, effectiveKeys, currentOverrides, onHotkeysChanged } from './ui/hotkeys.js';
import { Game } from './simulation/game.js';
import { Renderer } from './renderer/renderer.js';
import { Minimap } from './renderer/minimap.js';
import { setCargoColors } from './renderer/sprites/vehicles.js';
import { App } from './ui/app.js';
import { createToolbar } from './ui/toolbar.js';
import { syncLinkLegend, toggleLinkOverlay } from './ui/linkLegend.js';
import { applyA11y } from './ui/a11yPrefs.js';
import { createStatusbar } from './ui/statusbar.js';
import { setupInput } from './input/input.js';
import { startLoop } from './ui/loop.js';
import { updateCostReadout } from './ui/costReadout.js';
import { saveToSlotAsync, saveToSlot, loadSlotData } from './ui/storage.js';
import { cargoColorMap } from './ui/cargo.js';
import { installAudioUnlock } from './audio/sfx.js';
import { TOOL_BUTTONS } from './ui/toolbar.js';
import { runWithLoading, buildingLabel } from './ui/loading.js';
import { createGameFast } from './ui/scenarioSnapshot.js';
import { initPack, togglePack } from './renderer/pack/index.js';
import { openTitleMenu } from './ui/titleMenu.js';
import { screenshotCanvas } from './ui/screenshot.js';
import { renderExtras } from './ui/extraViewport.js';

const WINDOW_REFRESH_MS = 250;
const STATUS_REFRESH_MS = 200;

/**
 * URL boot: `?scenario=<id>[&seed=N]` builds that scenario (skips the autosave).
 * @returns {{scenario:string, seed:number}|null}
 */
function scenarioFromUrl() {
  const q = new URLSearchParams(location.search);
  const scenario = q.get('scenario');
  if (!scenario) return null;
  const seed = Number(q.get('seed'));
  return { scenario, seed: Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : 1 };
}

/**
 * Load the autosave if present, otherwise create a random new game
 * (or the URL-requested scenario).
 * @returns {Promise<{game:any, restored:boolean, scenario:boolean}>}
 */
async function initialGame() {
  const req = scenarioFromUrl();
  if (req) {
    const game = await runWithLoading(buildingLabel(req.scenario), () =>
      createGameFast({ scenario: req.scenario, seed: req.seed }));
    return { game, restored: false, scenario: true };
  }
  const clim = new URLSearchParams(location.search).get('climate');
  const data = clim === 'arctic' || clim === 'tropic' || clim === 'toyland' ? null : loadSlotData('autosave');
  if (data) {
    try {
      return { game: await Game.deserializeAsync(data), restored: true, scenario: false };
    } catch (err) {
      console.warn('Autosave could not be loaded; starting a new game', err);
    }
  }
  // ?climate=arctic|tropic|toyland: a random map of that climate (opt-in; default games keep the temperate climate)
  const mapgen = clim === 'arctic' || clim === 'tropic' || clim === 'toyland' ? { climate: clim } : undefined;
  return { game: Game.create({ seed: Math.floor(Math.random() * 1e9), mapgen }), restored: false, scenario: false };
}

/** Autosave; warns once per session when the browser storage quota is exceeded. */
let autosaveWarned = false;
let autosaveBusy = false;
/** game.serialize() cost of the last autosave (ms): big games (Moscow ~150 ms) save less often. */
let lastSerializeMs = 0;
let monthsSinceSave = 0;
/** Months between timed autosaves when a save is expensive (> SLOW_SAVE_MS, e.g. Moscow ~150 ms): a fallback only,
 *  since pausing, hiding the tab and closing the page also save. Cheap saves stay monthly. */
const SLOW_SAVE_MONTHS = 12;
const SLOW_SAVE_MS = 40;

/**
 * Save now (compression runs in a worker; skipped while a save is in flight).
 * @param {any} app
 */
function autosave(app) {
  if (autosaveBusy) return;
  autosaveBusy = true;
  monthsSinceSave = 0;
  const t0 = performance.now();
  const pending = saveToSlotAsync('autosave', app.game); // serialize runs synchronously inside
  lastSerializeMs = performance.now() - t0;
  pending.then((r) => {
    if (!r.ok && r.quota && !autosaveWarned) {
      autosaveWarned = true;
      app.toast('Autosave skipped: save too large for browser storage', 'error');
    }
  }).finally(() => { autosaveBusy = false; });
}

/** Run fn in browser idle time (its own task, not in the frame that ran the monthly game logic). */
function whenIdle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout: 3000 });
  else setTimeout(fn, 50);
}

/**
 * Month ended: autosave in idle time. Expensive saves (large maps) only every SLOW_SAVE_MONTHS months
 * while the game runs (yearly); hiding the tab, pausing and closing the page also save (see main()).
 * @param {any} app
 */
function onMonthAutosave(app) {
  monthsSinceSave++;
  if (lastSerializeMs > SLOW_SAVE_MS && monthsSinceSave < SLOW_SAVE_MONTHS) return;
  whenIdle(() => autosave(app));
}

/**
 * Collapse/expand the minimap panel. Remembered in localStorage ('tt.minimap' = '0' collapsed / '1' expanded);
 * default: expanded on wide screens, collapsed on narrow (<= 700 px) screens. UI only.
 * @param {HTMLElement} wrap
 * @param {HTMLElement} btn
 */
function wireMinimapToggle(wrap, btn) {
  let saved = null;
  try { saved = localStorage.getItem('tt.minimap'); } catch { /* ignore */ }
  const narrow = window.matchMedia ? window.matchMedia('(max-width: 700px)').matches : window.innerWidth <= 700;
  const expanded0 = saved === '0' ? false : saved === '1' ? true : !narrow;
  const apply = (exp) => {
    wrap.classList.toggle('collapsed', !exp);
    btn.textContent = exp ? 'Map ▾' : 'Map ▴';
    btn.setAttribute('aria-expanded', String(exp));
  };
  apply(expanded0);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const exp = wrap.classList.contains('collapsed');
    apply(exp);
    try { localStorage.setItem('tt.minimap', exp ? '1' : '0'); } catch { /* ignore */ }
  });
}

/** Boot the app. */
/** Prefix a tool label unless the hint already starts with it ("Bus stop: click…" under "Bus Stop"). */
function withLabel(label, hint) {
  const h = String(hint || '');
  if (!label) return h;
  return h.toLowerCase().startsWith(String(label).toLowerCase()) ? h : `${label}: ${h}`;
}

async function main() {
  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const canvas = /** @type {HTMLCanvasElement} */ ($('world'));
  const hintEl = $('tool-hint');
  setCargoColors(cargoColorMap());
  installAudioUnlock();

  const { game, restored, scenario } = await initialGame();
  window.__game = game;
  const renderer = new Renderer(canvas, game);
  renderer.resize();
  const minimap = new Minimap(/** @type {HTMLCanvasElement} */ ($('minimap')), renderer);
  const app = new App({ game, renderer, minimap, windowsEl: $('windows'), toastsEl: $('toasts'), GameClass: Game });
  wireMinimapToggle($('minimap-wrap'), $('minimap-toggle'));
  app.centerOnInterest();
  initPack(renderer);
  if (scenario) app.announceScenario(game);
  if (scenario) maybeOpenGoals(app, game);

  applyA11y();
  const toolbar = createToolbar($('toolbar'), app);
  const statusbar = createStatusbar($('statusbar'), app);
  app.ui.refreshToolbar = toolbar.refresh;
  app.ui.updateHint = () => {
    const t = app.tool;
    hintEl.hidden = !t;
    if (!t) return;
    const h = t.hint;
    if (h && typeof h === 'object') {
      // two-line hint: main sentence + smaller key-hint line
      const main = document.createElement('div');
      main.textContent = withLabel(t.label, h.main);
      const keys = document.createElement('div');
      keys.className = 'tool-hint-keys';
      keys.textContent = h.keys || '';
      keys.hidden = !h.keys;
      hintEl.replaceChildren(main, keys);
    } else {
      hintEl.textContent = withLabel(t.label, h);
    }
  };
  app.ui.onNews = () => statusbar.flashNews();
  app.onMonth = () => onMonthAutosave(app);
  // save when the player leaves the tab or pauses (no gameplay to interrupt), if anything happened since
  const setSpeed = app.setSpeed.bind(app);
  app.setSpeed = (v) => { setSpeed(v); if (v === 0 && monthsSinceSave > 0) whenIdle(() => autosave(app)); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && monthsSinceSave > 0) autosave(app); });

  // Global shortcuts come from the hotkey table (js/ui/hotkeys.js); overrides from 'tt.hotkeys'.
  /** @type {Record<string,()=>void>} */
  const shortcuts = {};
  /** @type {Record<string,()=>void>} action id -> handler */
  const hotkeyHandlers = {
    pause: () => app.togglePause(),
    metroOverlay: () => { app.renderer.showMetro = !app.renderer.showMetro; },
    linkOverlay: () => { toggleLinkOverlay(app.renderer); app.ui.refreshToolbar(); },
    graphics: () => togglePack(renderer),
    sound: () => toolbar.toggleSound(),
    screenshot: () => screenshotCanvas(renderer).then((name) => app.toast(`Saved ${name}`, 'good'), (e) => app.toast('Screenshot failed: ' + (e && e.message ? e.message : e), 'error')),
    'alt:query': () => app.setTool('query'),
  };
  for (const a of HOTKEY_ACTIONS) {
    if (a.id.startsWith('win:')) { const name = a.id.slice(4); hotkeyHandlers[a.id] = () => app.open(name); }
    else if (a.id.startsWith('tool:')) { const id = a.id.slice(5); hotkeyHandlers[a.id] = () => app.setTool(id); }
  }
  const rebuildShortcuts = () => {
    for (const k of Object.keys(shortcuts)) delete shortcuts[k];
    Object.assign(shortcuts, shortcutTable(effectiveKeys(currentOverrides()), hotkeyHandlers));
  };
  rebuildShortcuts();
  onHotkeysChanged(rebuildShortcuts);
  const input = setupInput(app, canvas, shortcuts);

  let lastWin = 0, lastStatus = 0, lastSel = 0;
  startLoop({
    getGame: () => app.game,
    getSpeed: () => app.speed,
    onError: (err) => {
      console.error('Simulation error', err);
      app.toast('Simulation error: ' + (err && err.message ? err.message : err), 'error');
    },
    frame(dt, now) {
      input.update(dt);
      app.updateFollow();
      renderer.render(dt);
      renderExtras(dt, app.game); // extra viewports (throttled inside; see ui/extraViewport.js)
      updateCostReadout(app); // T43 construction cost readout (no-op unless a build tool previews)
      minimap.draw(now);
      if (renderer.showLinks) syncLinkLegend(renderer); // legend follows the minimap rect each frame
      if (now - lastStatus > STATUS_REFRESH_MS) { statusbar.update(); lastStatus = now; }
      if (now - lastWin > WINDOW_REFRESH_MS) { app.wm.updateAll(); lastWin = now; }
      if (now - lastSel > 1000) { app.refreshSelectionCatchment(); lastSel = now; }
    },
  });

  window.addEventListener('beforeunload', () => saveToSlot('autosave', app.game));
  /** Keep floating windows on-screen after rotation / resize (landscape phones). */
  const clampWindows = () => app.wm.clampAll();
  window.addEventListener('resize', clampWindows);
  window.addEventListener('orientationchange', () => setTimeout(clampWindows, 60));
  if (scenario) { /* scenario toast shown above */ }
  else if (restored) {
    // F11: a restored autosave opens the title menu like a plain boot; Continue resumes the running game (no reload)
    if (shouldShowTitle()) openTitleMenu(app, { loaded: true });
    else app.toast('Continuing your autosaved game — New Game to start over', 'info');
  }
  else if (shouldShowTitle()) openTitleMenu(app); // plain boot: title menu (replaces the help popup)
  else app.open('help');
}

/**
 * Title menu on a plain boot. Not with `?scenario=` or `?notitle=1`; under automation (navigator.webdriver)
 * only with `?title=1`, so existing e2e scripts keep their map + How-to-play boot.
 * @returns {boolean}
 */
function shouldShowTitle() {
  const q = new URLSearchParams(location.search);
  if (q.get('scenario') || q.get('notitle') === '1') return false;
  if (q.get('title') === '1') return true;
  return !navigator.webdriver;
}

/** Storage key: set once the player closes the auto-opened Goals window (never auto-open again). */
const GOALS_DISMISSED_KEY = 'tt-goals-dismissed';

/**
 * First start of a scenario game: open the Goals window once so the objective is visible.
 * Only for the Moscow scenario, never on loads, and not after the player dismissed it before.
 * Narrow (phone) screens get a one-line toast instead, so the map is not covered.
 * @param {any} app
 * @param {any} game
 */
function maybeOpenGoals(app, game) {
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

main().catch((err) => {
  console.error('Boot failed', err);
  document.body.insertAdjacentHTML('beforeend', '<pre style="color:#f88;padding:12px">Boot failed: ' + String(err && err.message ? err.message : err) + '</pre>');
});
