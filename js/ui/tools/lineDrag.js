/**
 * Factory for drag-to-build tools (rail, road, demolish). Shows a live dry-run preview
 * (green/red + estimated cost) while dragging; commits on release.
 */
import { money } from '../format.js';
import { RAIL_SELECTOR, selectorTrack, trackTypeAvailable } from '../../config/railTypes.js';

/** Labels of the rail track selector (config/railTypes.js RAIL_SELECTOR). */
const RAIL_SEL_LABEL = { rail: 'Rail', electric: 'Electric', mono: 'Monorail', maglev: 'Maglev' };
import { SHAPES, SHAPE_LABEL, routeFor } from '../../simulation/shapes.js';
import { lTiles } from './geometry.js';
import { isDiagonalDrag, choosePiece } from './autorail.js';
import { screenToTileFloat, HEIGHT_STEP } from '../../renderer/iso.js';

/**
 * @typedef {Object} LineToolOptions
 * @property {string} id
 * @property {string} label
 * @property {string} hint
 * @property {(game:any, x0:number,y0:number,x1:number,y1:number, opts?:any)=>any} command
 * @property {(x0:number,y0:number,x1:number,y1:number)=>{x:number,y:number}[]} tiles
 * @property {'build'|'demolish'} sound
 * @property {'rail'|'road'} [layer] when set, enables shape modes (L/Diagonal/Curve/Circle, C cycles)
 */

/**
 * Create a drag tool.
 * @param {import('../app.js').App} app
 * @param {LineToolOptions} o
 * @returns {import('./index.js').Tool}
 */
export function createLineTool(app, o) {
  // (rail unchanged by the highway flag)
  let start = null;
  let lastKey = '';
  let shape = 'L';
  let highway = false;
  let railMode = 'normal'; // rail and road: U cycles normal -> tunnel -> bridge -> normal
  // rail track selector (config/railTypes.js RAIL_SELECTOR): ';' cycles Rail / Electric / Monorail / Maglev. Shared
  // with the station and depot tools through app.railSelector so one choice applies to every rail build.
  const railSelOf = () => app.railSelector || 'rail';
  // OTTD autorail (always on for rail, like OTTD's rail tool): diagonal drags lay the staircase, single clicks pick X/Y from the cursor
  const autoOn = () => o.layer === 'rail';
  /** Shape actually used for a drag: autorail turns an L drag on a diagonal into the staircase. */
  const effShape = (x0, y0, x1, y1) => (shape === 'L' && autoOn() && isDiagonalDrag(x0, y0, x1, y1) ? 'diag' : shape);
  /** @type {{ok:boolean,label:string}} */
  let lastResult = { ok: false, label: '' };
  const shapeTiles = (x0, y0, x1, y1) => {
    const sh = effShape(x0, y0, x1, y1);
    if (sh === 'L') return o.tiles(x0, y0, x1, y1);
    const r = routeFor(sh, x0, y0, x1, y1);
    return r ? r.path : lTiles(x0, y0, x1, y1);
  };
  const build = (g, x0, y0, x1, y1, opts) => {
    const tunnel = railMode === 'tunnel';
    const bridge = railMode === 'bridge';
    const railSel = railSelOf();
    const rsel = o.layer === 'rail' ? { trk: selectorTrack(railSel), electric: railSel === 'electric' } : {};
    const sh = effShape(x0, y0, x1, y1);
    const r = sh === 'L' ? null : routeFor(sh, x0, y0, x1, y1);
    if (!r) return o.command(g, x0, y0, x1, y1, { ...opts, highway, tunnel, bridge, ...rsel });
    if (tunnel) return { ok: false, error: 'Tunnels must be straight' };
    if (bridge) return { ok: false, error: 'Bridges must be straight' };
    const fn = o.layer === 'rail' ? g.buildRailPath : g.buildRoadPath;
    return fn.call(g, r.path, { ...opts, highway, loop: r.loop, ...rsel });
  };

  const preview = (end) => {
    if (!start || !end) return;
    const key = `${shape},${highway},${railMode},${railSelOf()},${start.x},${start.y},${end.x},${end.y}`;
    if (key !== lastKey) {
      lastKey = key;
      const res = build(app.game, start.x, start.y, end.x, end.y, { dryRun: true, highway, tunnel: railMode === 'tunnel', bridge: railMode === 'bridge' });
      lastResult = res && res.ok
        ? { ok: true, label: money(res.cost || 0) }
        : { ok: false, label: (res && res.error) || 'Not possible' };
    }
    app.renderer.overlay.preview = { tiles: shapeTiles(start.x, start.y, end.x, end.y), ok: lastResult.ok, label: lastResult.label };
  };

  return {
    id: o.id,
    label: o.label,
    get hint() {
      // Two-part hint: a main sentence plus a smaller line of key hints (main.js renders both).
      const main = (typeof o.hint === 'function' ? o.hint() : o.hint);
      const keys = [];
      if (o.layer) keys.push(`C shape: ${SHAPE_LABEL[shape]}`);
      if (o.layer === 'rail' || o.layer === 'road') {
        keys.push(`U mode: ${railMode === 'tunnel' ? 'Tunnel' : railMode === 'bridge' ? 'Bridge' : 'Surface'}`);
      }
      if (o.layer === 'rail') keys.push(`; track: ${RAIL_SEL_LABEL[railSelOf()]} (Rail / Electric / Monorail / Maglev)`);
      if (o.layer === 'road') keys.push(`H class: ${highway ? 'Highway' : 'Local'}`);
      return { main, keys: keys.join(' · ') };
    },
    key(e) {
      if (!o.layer) return false;
      if ((o.layer === 'rail' || o.layer === 'road') && (e.key === 'u' || e.key === 'U')) {
        railMode = railMode === 'normal' ? 'tunnel' : railMode === 'tunnel' ? 'bridge' : 'normal';
        lastKey = '';
        if (start) preview(start);
        app.ui?.updateHint?.();
        const desc = railMode === 'tunnel' ? 'tunnel (underground)' : railMode === 'bridge' ? 'bridge (over valley)' : 'surface';
        app.toast?.(`${o.layer === 'road' ? 'Road' : 'Rail'}: ${desc}`, 'info');
        return true;
      }
      if (o.layer === 'rail' && e.key === ';') {
        // OpenTTD: a track type is offered only after its intro year; skip the ones not yet introduced
        let railSel = railSelOf();
        for (let k = 0; k < RAIL_SELECTOR.length; k++) {
          railSel = RAIL_SELECTOR[(RAIL_SELECTOR.indexOf(railSel) + 1) % RAIL_SELECTOR.length];
          if (trackTypeAvailable(selectorTrack(railSel), app.game.state.date.year)) break;
        }
        app.railSelector = railSel;
        lastKey = '';
        if (start) preview(start);
        app.ui?.updateHint?.();
        app.toast?.(`Rail track: ${RAIL_SEL_LABEL[railSel]}`, 'info');
        return true;
      }
      if (o.layer === 'road' && (e.key === 'h' || e.key === 'H')) {
        highway = !highway;
        lastKey = '';
        if (start) preview(start);
        app.ui?.updateHint?.();
        app.toast?.(`Road class: ${highway ? 'Highway (4-lane)' : 'Local'}`, 'info');
        return true;
      }
      if (e.key !== 'c' && e.key !== 'C') return false;
      shape = SHAPES[(SHAPES.indexOf(shape) + 1) % SHAPES.length];
      lastKey = '';
      if (start) preview(start);
      app.ui?.updateHint?.();
      app.toast?.(`Shape: ${SHAPE_LABEL[shape]}`, 'info');
      return true;
    },
    down(t) {
      start = { x: t.x, y: t.y };
      lastKey = '';
      preview(t);
    },
    move(t) {
      if (start) preview(t);
      else app.renderer.overlay.preview = { tiles: [t], ok: true };
    },
    up(t) {
      if (!start) return;
      const s = start;
      start = null;
      lastKey = '';
      app.renderer.overlay.preview = null;
      // single-tile autorail click: pick the X/Y piece from the cursor's place inside the tile
      let opts = {};
      if (autoOn() && s.x === t.x && s.y === t.y && shape === 'L' && t.sx !== undefined) {
        const w = app.renderer.camera.screenToWorld(t.sx, t.sy);
        // the tile's surface sits h*HEIGHT_STEP above the flat projection: shift the point back down by that
        const h = app.renderer.heights?.centerH?.(t.x, t.y) ?? 0;
        const f = screenToTileFloat(w.x, w.y + Math.max(0, h) * HEIGHT_STEP);
        opts = { axis: choosePiece(f.x - t.x + 0.5, f.y - t.y + 0.5) };
      }
      const res = build(app.game, s.x, s.y, t.x, t.y, opts);
      app.exec(res, { x: t.x, y: t.y, sound: o.sound });
    },
    cancel() {
      start = null;
      lastKey = '';
      app.renderer.overlay.preview = null;
    },
  };
}
