/**
 * App: the UI controller that ties a Game to the renderer, windows, tools and sounds.
 * Owns the active tool, simulation speed and game event subscriptions. Never mutates
 * game.state directly — only calls Game commands.
 */
import { WindowManager } from './windowManager.js';
import { Toasts } from './toast.js';
import { createTools } from './tools/index.js';
import { openWindow } from './windows/index.js';
import { signedMoney, money } from './format.js';
import { play } from '../audio/sfx.js';
import { runWithLoading, buildingLabel, scenarioTitle } from './loading.js';
import { createGameFast } from './scenarioSnapshot.js';

export class App {
  /**
   * @param {{game:any, renderer:import('../renderer/renderer.js').Renderer, minimap:any,
   *   windowsEl:HTMLElement, toastsEl:HTMLElement, GameClass:any}} o
   */
  constructor(o) {
    this.game = o.game;
    this.GameClass = o.GameClass;
    this.renderer = o.renderer;
    this.minimap = o.minimap;
    this.wm = new WindowManager(o.windowsEl);
    this.toasts = new Toasts(o.toastsEl);
    /** simulation speed multiplier (0 = paused) */
    this.speed = 1;
    this.prevSpeed = 1;
    /** @type {import('./tools/index.js').Tool|null} */
    this.tool = null;
    this.tools = createTools(this);
    /** vehicle id the camera follows, or null */
    this.followId = null;
    /** selected station id (shows catchment) */
    this.selectedStationId = null;
    /** UI hooks set by main.js (toolbar/statusbar refreshers) */
    this.ui = { updateHint: () => {}, refreshToolbar: () => {}, onNews: (_n) => {} };
    /** @type {Array<[string, Function]>} */
    this.subs = [];
    this.onMonth = () => {};
    this.subscribe();
  }

  /** Subscribe to game events (sounds, floating income, news). */
  subscribe() {
    const g = this.game;
    const on = (ev, fn) => { g.on(ev, fn); this.subs.push([ev, fn]); };
    on('income', (e) => {
      if (!e || typeof e.x !== 'number') return;
      const amt = e.amount || 0;
      this.renderer.addFloatingText(e.x, e.y, signedMoney(amt), amt >= 0 ? '#4ade80' : '#f87171');
      if (amt > 0) play('income');
    });
    on('news', (n) => {
      play('news');
      this.ui.onNews(n);
    });
    on('goal', (g) => {
      play('news');
      this.toast(`Goal complete: ${g.title}! +${money(g.reward)}`, 'good', false, 6000);
    });
    on('month', () => this.onMonth());
  }

  /** Remove our game event listeners. */
  unsubscribe() {
    for (const [ev, fn] of this.subs) {
      try { this.game.off(ev, fn); } catch { /* ignore */ }
    }
    this.subs = [];
  }

  /**
   * Replace the running game (new game / load). Closes windows and resets tools.
   * @param {any} game
   */
  setGame(game) {
    this.setTool(null);
    this.wm.closeAll();
    this.unsubscribe();
    this.game = game;
    this.renderer.setGame(game);
    this.renderer.overlay.selection = null;
    this.renderer.overlay.catchment = null;
    this.renderer.overlay.selectedVehicleId = null;
    this.followId = null;
    this.selectedStationId = null;
    this.minimap.lastBase = -Infinity;
    window.__game = game;
    this.subscribe();
    this.centerOnInterest();
  }

  /**
   * Start a fresh game.
   * @param {{seed?:number,width?:number,height?:number,townCount?:number,startYear?:number,industryCount?:number}} opts
   */
  async newGame(opts) {
    const game = await runWithLoading(buildingLabel(opts && opts.scenario), () => createGameFast(opts, this.GameClass));
    this.setGame(game);
    if (game.state.scenario) this.announceScenario(game);
    else this.toast(`New game started (seed ${game.state.seed})`, 'good');
  }

  /**
   * Toast a freshly built scenario: population + number of setup warnings.
   * @param {any} game
   */
  announceScenario(game) {
    const s = game.state;
    const pop = s.towns.reduce((a, t) => a + (t.population || 0), 0);
    const warn = Array.isArray(s.scenarioLog) ? s.scenarioLog.length : 0;
    const extra = warn ? ` (${warn} setup warning${warn === 1 ? '' : 's'})` : '';
    this.toast(`${scenarioTitle(s.scenario)} ready: population ${pop.toLocaleString('en-US')}${extra}`, 'good');
  }

  /**
   * Load a game from a serialized string.
   * @param {string} data
   * @returns {boolean} ok
   */
  loadFromString(data) {
    try {
      const game = this.GameClass.deserialize(data);
      this.setGame(game);
      this.toast('Game loaded', 'good');
      return true;
    } catch (err) {
      console.warn('Load failed', err);
      this.toast('Could not load save: ' + (err && err.message ? err.message : 'invalid data'), 'error');
      play('error');
      return false;
    }
  }

  /** Centre the camera on the scenario focus (e.g. the Kremlin), else the largest town, else the map centre. */
  centerOnInterest() {
    const s = this.game.state;
    const f = s.scenarioMeta && s.scenarioMeta.focus;
    if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) { this.centerOn(f.x, f.y); return; }
    const towns = s.towns.slice().sort((a, b) => b.population - a.population);
    if (towns.length) this.centerOn(towns[0].x, towns[0].y);
    else this.centerOn(s.map.width / 2, s.map.height / 2);
  }

  /**
   * Centre camera on a tile.
   * @param {number} x
   * @param {number} y
   */
  centerOn(x, y) {
    const t = this.game.inBounds(Math.round(x), Math.round(y)) ? this.game.tile(Math.round(x), Math.round(y)) : null;
    this.renderer.camera.centerOn(x, y, t ? t.height : 0);
  }

  /**
   * Activate a tool by id (toggles off if already active), a tool object, or null.
   * @param {string|import('./tools/index.js').Tool|null} t
   */
  setTool(t) {
    const next = typeof t === 'string' ? this.tools[t] : t;
    if (this.tool) this.tool.cancel();
    this.tool = next && next !== this.tool ? next : null;
    const ov = this.renderer.overlay;
    ov.preview = null;
    if (!this.tool) this.refreshSelectionCatchment();
    else ov.catchment = null;
    this.ui.updateHint();
    this.ui.refreshToolbar();
  }

  /**
   * Set simulation speed (0 = pause).
   * @param {number} s
   */
  setSpeed(s) {
    if (s > 0) this.prevSpeed = s;
    this.speed = s;
    this.ui.refreshToolbar();
  }

  /** Toggle pause. */
  togglePause() {
    this.setSpeed(this.speed === 0 ? this.prevSpeed || 1 : 0);
  }

  /**
   * Handle a command result: toast on failure, sound + cost popup on success.
   * @param {{ok:boolean,error?:string,cost?:number}|undefined} res
   * @param {{x?:number,y?:number,sound?:string,quiet?:boolean}} [o]
   * @returns {boolean} ok
   */
  exec(res, o = {}) {
    if (!res || !res.ok) {
      this.toast((res && res.error) || 'Not possible', 'error', true);
      play('error');
      return false;
    }
    if (o.sound) play(/** @type {any} */ (o.sound));
    if (!o.quiet && res.cost && typeof o.x === 'number') {
      this.renderer.addFloatingText(o.x, o.y, signedMoney(-res.cost), '#fca5a5');
    }
    this.minimap.lastBase = -Infinity;
    this.renderer.invalidateGround();
    return true;
  }

  /**
   * Show a toast.
   * @param {string} text
   * @param {'error'|'info'|'good'} [kind]
   * @param {boolean} [nearCursor]
   */
  toast(text, kind = 'info', nearCursor = false, ms) {
    this.toasts.show(text, kind, { nearCursor, ms });
  }

  /** @param {number} id */
  findVehicle(id) {
    return this.game.state.vehicles.find((v) => v.id === id) || null;
  }

  /** @param {number} id */
  findStation(id) {
    return this.game.state.stations.find((s) => s.id === id) || null;
  }

  /** @param {number} id */
  findDepot(id) {
    return this.game.state.depots.find((d) => d.id === id) || null;
  }

  /** @param {number} id */
  findTown(id) {
    return this.game.state.towns.find((t) => t.id === id) || null;
  }

  /** @param {number} id */
  findIndustry(id) {
    return this.game.state.industries.find((i) => i.id === id) || null;
  }

  /**
   * Open a named window (see windows/index.js).
   * @param {string} name
   * @param {any} [arg]
   */
  open(name, arg) {
    play('click');
    return openWindow(this, name, arg);
  }

  /**
   * Inspect a tile: depots/stations open directly; otherwise the tile info window.
   * @param {number} x
   * @param {number} y
   * @param {boolean} [forceInfo] always open the info window (Query tool)
   */
  inspectTile(x, y, forceInfo = false) {
    if (!this.game.inBounds(x, y)) return;
    const b = this.game.tile(x, y).building;
    if (!forceInfo && b) {
      if (b.type === 'depot') return this.open('depot', b.depotId);
      if (b.type === 'station' && b.kind === 'airport' && b.part === 'hangar' && b.depotId != null) return this.open('depot', b.depotId);
      if (b.type === 'station') return this.open('station', b.stationId);
      if (b.type === 'industry') return this.open('industry', b.industryId);
    }
    this.open('tileInfo', { x, y });
  }

  /**
   * Select a station (show catchment while no tool is active).
   * @param {number|null} id
   */
  selectStation(id) {
    this.selectedStationId = id;
    this.refreshSelectionCatchment();
  }

  /** Recompute catchment / selection overlays for the selected station. */
  refreshSelectionCatchment() {
    const ov = this.renderer.overlay;
    const st = this.selectedStationId !== null ? this.findStation(this.selectedStationId) : null;
    if (!st) {
      ov.selection = null;
      if (!this.tool) ov.catchment = null;
      return;
    }
    ov.selection = st.tiles.map((t) => ({ x: t.x, y: t.y }));
    if (!this.tool) {
      try { ov.catchment = this.game.catchmentTiles(st.id) || null; } catch { ov.catchment = null; }
    }
  }

  /**
   * Follow a vehicle with the camera (null to stop).
   * @param {number|null} id
   */
  follow(id) {
    this.followId = id;
    this.renderer.overlay.selectedVehicleId = id;
  }

  /** Per-frame camera follow update. */
  updateFollow() {
    if (this.followId === null) return;
    const v = this.findVehicle(this.followId);
    if (!v) { this.followId = null; return; }
    let segs = null;
    try { segs = this.game.getVehicleSegments(v); } catch { segs = null; }
    const s = segs && segs[0];
    const p = this.renderer.tileCenterScreen(s ? s.x : v.tx, s ? s.y : v.ty);
    this.renderer.camera.x = p.x;
    this.renderer.camera.y = p.y;
    this.renderer.camera.clamp();
  }
}
