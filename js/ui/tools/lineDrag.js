/**
 * Factory for drag-to-build tools (rail, road, demolish). Shows a live dry-run preview
 * (green/red + estimated cost) while dragging; commits on release.
 */
import { money } from '../format.js';
import { SHAPES, SHAPE_LABEL, routeFor } from '../../simulation/shapes.js';
import { lTiles } from './geometry.js';

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
  /** @type {{ok:boolean,label:string}} */
  let lastResult = { ok: false, label: '' };
  const shapeTiles = (x0, y0, x1, y1) => {
    if (shape === 'L') return o.tiles(x0, y0, x1, y1);
    const r = routeFor(shape, x0, y0, x1, y1);
    return r ? r.path : lTiles(x0, y0, x1, y1);
  };
  const build = (g, x0, y0, x1, y1, opts) => {
    const tunnel = railMode === 'tunnel';
    const bridge = railMode === 'bridge';
    const r = shape === 'L' ? null : routeFor(shape, x0, y0, x1, y1);
    if (!r) return o.command(g, x0, y0, x1, y1, { ...opts, highway, tunnel, bridge });
    if (tunnel) return { ok: false, error: 'Tunnels must be straight' };
    if (bridge) return { ok: false, error: 'Bridges must be straight' };
    const fn = o.layer === 'rail' ? g.buildRailPath : g.buildRoadPath;
    return fn.call(g, r.path, { ...opts, highway, loop: r.loop });
  };

  const preview = (end) => {
    if (!start || !end) return;
    const key = `${shape},${highway},${railMode},${start.x},${start.y},${end.x},${end.y}`;
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
      const base = (typeof o.hint === 'function' ? o.hint() : o.hint)
        + (o.layer ? ` Shape: ${SHAPES.map((k) => (k === shape ? `[${SHAPE_LABEL[k]}]` : SHAPE_LABEL[k])).join(' | ')} (C cycles).` : '');
      const mode = o.layer === 'rail' || o.layer === 'road'
        ? ` Mode: ${railMode === 'tunnel' ? '[Tunnel]' : railMode === 'bridge' ? '[Bridge]' : 'Surface'} (U cycles).`
        : '';
      const cls = o.layer === 'road' ? ` Class: ${highway ? '[Highway — 4-lane]' : 'Local'} (H toggles).` : '';
      return base + mode + cls;
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
      const res = build(app.game, s.x, s.y, t.x, t.y, {});
      app.exec(res, { x: t.x, y: t.y, sound: o.sound });
    },
    cancel() {
      start = null;
      lastKey = '';
      app.renderer.overlay.preview = null;
    },
  };
}
