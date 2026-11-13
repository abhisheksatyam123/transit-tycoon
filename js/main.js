/**
 * Entry point: creates/loads the Game, wires renderer, minimap, UI and the game loop.
 * Globals: `window.__game` (debug handle to the current Game instance) and
 * `window.__ttLog` (file logger handle; see docs/logger.md).
 */
import { TOWN_LAYOUT_MODES } from './simulation/towns.js';
import { HOTKEY_ACTIONS, shortcutTable, effectiveKeys, currentOverrides, onHotkeysChanged } from './ui/hotkeys.js';
import { Game } from './simulation/game.js';
import { getSetting } from './simulation/settings.js';
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
import { saveToSlotAsync, saveToSlot, readSlot, slotMeta } from './ui/storage.js';
import { lockAutosaveSlot, autosaveSlotLocked } from './ui/autosaveGuard.js';
import { AUTOSAVE_SLOTS, advanceAutosaveCounter, autosaveIntervalMs, loadAutosavePrefs, pickAutosaveSlot } from './ui/autosavePrefs.js';
import { cargoColorMap } from './ui/cargo.js';
import { installAudioUnlock } from './audio/sfx.js';
import { TOOL_BUTTONS } from './ui/toolbar.js';
import { runWithLoading, buildingLabel } from './ui/loading.js';
import { createGameFast } from './ui/scenarioSnapshot.js';
import { initPack, togglePack } from './renderer/pack/index.js';
import { openTitleMenu, titleMenuOpen } from './ui/titleMenu.js';
import { screenshotCanvas } from './ui/screenshot.js';
import { renderExtras } from './ui/extraViewport.js';
import { initLogger, logger } from './ui/logger.js';

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
 * A slot that exists but cannot be decoded/deserialized is never replaced silently: the caller warns the
 * player and locks the 'autosave' slot for this session so this fresh game cannot overwrite it.
 * @returns {Promise<{game:any, restored:boolean, scenario:boolean, bootLoadError:Error|null}>}
 */
async function initialGame() {
  const req = scenarioFromUrl();
  if (req) {
    const game = await runWithLoading(buildingLabel(req.scenario), () =>
      createGameFast({ scenario: req.scenario, seed: req.seed }));
    return { game, restored: false, scenario: true, bootLoadError: null };
  }
  const clim = new URLSearchParams(location.search).get('climate');
  let bootLoadError = null;
  if (clim !== 'arctic' && clim !== 'tropic' && clim !== 'toyland') {
    const slot = readSlot('autosave');
    if (slot.status === 'corrupt') {
      bootLoadError = new Error('the autosave data is corrupt');
      if (!logger.warn('boot', 'Autosave is corrupt; starting a new game', bootLoadError)) console.warn('Autosave is corrupt; starting a new game', bootLoadError);
    } else if (slot.status === 'ok') {
      try {
        return { game: await Game.deserializeAsync(slot.data), restored: true, scenario: false, bootLoadError: null };
      } catch (err) {
        bootLoadError = err;
        if (!logger.warn('boot', 'Autosave could not be loaded; starting a new game', err)) console.warn('Autosave could not be loaded; starting a new game', err);
      }
    }
  }
  if (bootLoadError) lockAutosaveSlot();
  // ?climate=arctic|tropic|toyland: a random map of that climate (opt-in; default games keep the temperate climate)
  const mapgenOpt = clim === 'arctic' || clim === 'tropic' || clim === 'toyland' ? { climate: clim } : undefined;
  // ?townLayout=original|better|2x2|3x3|random: debug/e2e opt-in for the town road layout (default 'mixed' is not stored)
  const tl = new URLSearchParams(location.search).get('townLayout');
  const mapgen = tl && TOWN_LAYOUT_MODES.includes(tl) && tl !== 'mixed' ? { ...mapgenOpt, townLayout: tl } : mapgenOpt;
  return { game: Game.create({ seed: Math.floor(Math.random() * 1e9), mapgen }), restored: false, scenario: false, bootLoadError };
}

/** Autosave; warns once per session when the browser storage quota is exceeded. */
let autosaveWarned = false;
let autosaveBusy = false;
/** game.serialize() cost of the last autosave (ms). */
let lastSerializeMs = 0;
const SLOW_SAVE_MS = 50; // longest slice above this = a save that was not sliced (sync fallback): clamp to yearly
const SLOW_SAVE_INTERVAL = 12;
/** Game months since the last timed autosave (Settings > autosave interval; 0 = off). */
let monthsSinceSave = 0;
/** A month ended since the Continue slot was written (pause / hidden tab save it). */
let dirty = false;
/** Real-time autosave (OpenTTD gui.autosave_interval game setting): last trigger time (ms). */
let lastAutosaveMs = Date.now();


/**
 * Timed autosave into the rotating ring (auto-1..3, oldest overwritten). Compression runs in a worker;
 * skipped while a save is in flight. Never in the scenario editor or while a modal is open.
 * @param {any} app
 */
function autosave(app) {
  if (autosaveBusy || !app.game || app.game.state.editor || modalOpen()) return;
  autosaveBusy = true;
  const metas = AUTOSAVE_SLOTS.map((slot) => { const m = slotMeta(slot); return m ? { slot, savedAt: m.savedAt } : null; });
  const slot = pickAutosaveSlot(metas);
  const stats = {};
  // SV: serialise in time slices (sim held, commands blocked until the snapshot exists); stats.maxSliceMs = longest main-thread slice
  const pending = saveToSlotAsync(slot, app.game, stats);
  // longest main-thread block of the whole save: serialise slices, postMessage pieces (SV)
  pending.then(() => { lastSerializeMs = Math.max(stats.maxSliceMs ?? 0, stats.maxBlockMs ?? 0); }, () => {});
  pending.then((r) => {
    if (!r.ok && r.quota && !autosaveWarned) {
      autosaveWarned = true;
      app.toast('Autosave skipped: save too large for browser storage', 'error');
    }
  }).finally(() => { autosaveBusy = false; });
}

/** Continue slot ('autosave'): written on pause / hidden tab; not periodic. Skipped in the editor. */
function saveContinue(app) {
  if (autosaveBusy || !app.game || app.game.state.editor || !dirty || autosaveSlotLocked()) return;
  dirty = false;
  saveToSlotAsync('autosave', app.game).then((r) => {
    // the pause/hidden-tab save failed: keep the dirty flag so a later save is attempted
    if (r && r.ok === false) dirty = true;
  }, () => { dirty = true; });
}

/** A dialog or the title menu is open: no timed save now. */
function modalOpen() {
  return titleMenuOpen() || !!document.querySelector('.tm-overlay, section.prompt');
}

/** Run fn in browser idle time (its own task, not in the frame that ran the monthly game logic). */
function whenIdle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout: 3000 });
  else setTimeout(fn, 50);
}

/**
 * Month ended: count it against the Settings interval (off = never); a due save runs in idle time.
 * @param {any} app
 */
function onMonthAutosave(app) {
  dirty = true;
  // Saves run in slices of ~8 ms (SV): the periodic interval is only clamped to yearly when a block
  // was too long for a smooth frame (lastSerializeMs = longest slice of the last save). Pause,
  // hidden-tab and close saves still run.
  const want = loadAutosavePrefs().interval;
  const interval = want && lastSerializeMs > SLOW_SAVE_MS ? Math.max(want, SLOW_SAVE_INTERVAL) : want;
  const r = advanceAutosaveCounter(interval, monthsSinceSave);
  monthsSinceSave = r.months;
  if (r.due) whenIdle(() => autosave(app));
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

  const { game, restored, scenario, bootLoadError } = await initialGame();
  window.__game = game;
  const renderer = new Renderer(canvas, game);
  renderer.resize();
  const minimap = new Minimap(/** @type {HTMLCanvasElement} */ ($('minimap')), renderer);
  const app = new App({ game, renderer, minimap, windowsEl: $('windows'), toastsEl: $('toasts'), GameClass: Game });
  if (bootLoadError) {
    const msg = bootLoadError && bootLoadError.message ? bootLoadError.message : 'invalid data';
    app.toast('Autosave could not be loaded (' + msg + '). Starting a new game; the autosave slot will not be overwritten this session.', 'error', false, 12000);
  }
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
  app.setSpeed = (v) => { setSpeed(v); if (v === 0 && dirty) whenIdle(() => saveContinue(app)); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) saveContinue(app); });

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
    lastNews: () => app.showLastNews(),
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
    getSpeed: () => app.effectiveSpeed(),
    onError: (err) => {
      if (!logger.error('simulation', 'Simulation error', err)) console.error('Simulation error', err);
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
      // OpenTTD gui.autosave_interval: real-time periodic save to 'autosave' slot (game setting)
      {
        const iv = autosaveIntervalMs(getSetting(app.game && app.game.state, 'autosaveInterval'));
        if (iv > 0 && !autosaveBusy && app.game && !app.game.state.editor && !autosaveSlotLocked() && !modalOpen()) {
          const nowMs = Date.now();
          if (nowMs - lastAutosaveMs >= iv) {
            lastAutosaveMs = nowMs;
            autosaveBusy = true;
            saveToSlotAsync('autosave', app.game).finally(() => { autosaveBusy = false; });
          }
        }
      }
      if (now - lastStatus > STATUS_REFRESH_MS) { statusbar.update(); lastStatus = now; }
      if (now - lastWin > WINDOW_REFRESH_MS) { app.wm.updateAll(); lastWin = now; }
      if (now - lastSel > 1000) { app.refreshSelectionCatchment(); lastSel = now; }
    },
  });

  window.addEventListener('beforeunload', () => { if (!app.game.state.editor && !autosaveSlotLocked()) saveToSlot('autosave', app.game); });
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
  else {
    let seen = false;
    try { seen = localStorage.getItem('tt-help-v1') === '1'; } catch { /* ignore */ }
    if (seen) {
      app.toast('Press H for help', 'info');
    } else {
      try { localStorage.setItem('tt-help-v1', '1'); } catch { /* ignore */ }
      app.open('help');
    }
  }
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

initLogger();
main().catch((err) => {
  if (!logger.error('boot', 'Boot failed', err)) console.error('Boot failed', err);
  document.body.insertAdjacentHTML('beforeend', '<pre style="color:#f88;padding:12px">Boot failed: ' + String(err && err.message ? err.message : err) + '</pre>');
});
