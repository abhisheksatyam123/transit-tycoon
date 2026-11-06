/**
 * Entry point: creates/loads the Game, wires renderer, minimap, UI and the game loop.
 * The only global is `window.__game` (debug handle to the current Game instance).
 */
import { Game } from './simulation/game.js';
import { Renderer } from './renderer/renderer.js';
import { Minimap } from './renderer/minimap.js';
import { setCargoColors } from './renderer/sprites/vehicles.js';
import { App } from './ui/app.js';
import { createToolbar } from './ui/toolbar.js';
import { createStatusbar } from './ui/statusbar.js';
import { setupInput } from './input/input.js';
import { startLoop } from './ui/loop.js';
import { saveToSlotAsync, saveToSlot, loadSlotData } from './ui/storage.js';
import { cargoColorMap } from './ui/cargo.js';
import { installAudioUnlock } from './audio/sfx.js';
import { TOOL_BUTTONS } from './ui/toolbar.js';
import { runWithLoading, buildingLabel } from './ui/loading.js';
import { createGameFast } from './ui/scenarioSnapshot.js';
import { initPack, togglePack } from './renderer/pack/index.js';

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
  const data = loadSlotData('autosave');
  if (data) {
    try {
      return { game: Game.deserialize(data), restored: true, scenario: false };
    } catch (err) {
      console.warn('Autosave could not be loaded; starting a new game', err);
    }
  }
  return { game: Game.create({ seed: Math.floor(Math.random() * 1e9) }), restored: false, scenario: false };
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

/** Boot the app. */
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
  app.centerOnInterest();
  initPack(renderer);
  if (scenario) app.announceScenario(game);

  const toolbar = createToolbar($('toolbar'), app);
  const statusbar = createStatusbar($('statusbar'), app);
  app.ui.refreshToolbar = toolbar.refresh;
  app.ui.updateHint = () => {
    const t = app.tool;
    hintEl.hidden = !t;
    if (t) hintEl.textContent = `${t.label}: ${t.hint}`;
  };
  app.ui.onNews = () => statusbar.flashNews();
  app.onMonth = () => onMonthAutosave(app);
  // save when the player leaves the tab or pauses (no gameplay to interrupt), if anything happened since
  const setSpeed = app.setSpeed.bind(app);
  app.setSpeed = (v) => { setSpeed(v); if (v === 0 && monthsSinceSave > 0) whenIdle(() => autosave(app)); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && monthsSinceSave > 0) autosave(app); });

  /** @type {Record<string,()=>void>} */
  const shortcuts = {
    ' ': () => app.togglePause(),
    v: () => app.open('vehicles'), f: () => app.open('finances'), t: () => app.open('towns'), b: () => app.open('stations'),
    i: () => app.open('industries'), n: () => app.open('news'), h: () => app.open('help'),
    l: () => app.open('load'), x: () => app.open('traffic'), g: () => app.open('issues'), u: () => app.open('metro'), o: () => app.open('goals'), j: () => { app.renderer.showMetro = !app.renderer.showMetro; }, k: () => togglePack(renderer), m: () => toolbar.toggleSound(), q: () => app.setTool('query'),
  };
  for (const [id, , , key] of TOOL_BUTTONS) shortcuts[key] = () => app.setTool(id);
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
      minimap.draw(now);
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
  if (scenario) { /* scenario toast shown above */ } else if (restored) app.toast('Continuing your autosaved game — New Game to start over', 'info');
  else app.open('help');
}

main().catch((err) => {
  console.error('Boot failed', err);
  document.body.insertAdjacentHTML('beforeend', '<pre style="color:#f88;padding:12px">Boot failed: ' + String(err && err.message ? err.message : err) + '</pre>');
});
