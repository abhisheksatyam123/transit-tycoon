/**
 * Factory for drag-to-build tools (rail, road, demolish). Shows a live dry-run preview
 * (green/red + estimated cost) while dragging; commits on release.
 */
import { money } from '../format.js';

/**
 * @typedef {Object} LineToolOptions
 * @property {string} id
 * @property {string} label
 * @property {string} hint
 * @property {(game:any, x0:number,y0:number,x1:number,y1:number, opts?:any)=>any} command
 * @property {(x0:number,y0:number,x1:number,y1:number)=>{x:number,y:number}[]} tiles
 * @property {'build'|'demolish'} sound
 */

/**
 * Create a drag tool.
 * @param {import('../app.js').App} app
 * @param {LineToolOptions} o
 * @returns {import('./index.js').Tool}
 */
export function createLineTool(app, o) {
  let start = null;
  let lastKey = '';
  /** @type {{ok:boolean,label:string}} */
  let lastResult = { ok: false, label: '' };

  const preview = (end) => {
    if (!start || !end) return;
    const key = `${start.x},${start.y},${end.x},${end.y}`;
    if (key !== lastKey) {
      lastKey = key;
      const res = o.command(app.game, start.x, start.y, end.x, end.y, { dryRun: true });
      lastResult = res && res.ok
        ? { ok: true, label: money(res.cost || 0) }
        : { ok: false, label: (res && res.error) || 'Not possible' };
    }
    app.renderer.overlay.preview = { tiles: o.tiles(start.x, start.y, end.x, end.y), ok: lastResult.ok, label: lastResult.label };
  };

  return {
    id: o.id,
    label: o.label,
    hint: o.hint,
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
      const res = o.command(app.game, s.x, s.y, t.x, t.y);
      app.exec(res, { x: t.x, y: t.y, sound: o.sound });
    },
    cancel() {
      start = null;
      lastKey = '';
      app.renderer.overlay.preview = null;
    },
  };
}
