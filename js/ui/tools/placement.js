/**
 * Factory for click-to-place tools (stations, stops, depots). Hovering shows a dry-run
 * preview (green/red with cost) plus the catchment area for stations.
 */
import { money } from '../format.js';
import { catchmentAround } from './geometry.js';

/**
 * @typedef {Object} PlacementOptions
 * @property {string} id
 * @property {string} label
 * @property {()=>string} hint dynamic hint text (shows rotation/length)
 * @property {(game:any,x:number,y:number,opts?:any)=>any} command
 * @property {(x:number,y:number)=>{x:number,y:number}[]} footprint
 * @property {number} [catchment] radius to preview, if a station
 * @property {(e:KeyboardEvent)=>boolean} [key] handle tool keys; return true if consumed
 */

/**
 * @param {import('../app.js').App} app
 * @param {PlacementOptions} o
 * @returns {import('./index.js').Tool}
 */
export function createPlacementTool(app, o) {
  let hover = null;
  let lastKey = '';
  let last = { ok: false, label: '' };

  const refresh = () => {
    if (!hover) return;
    const ov = app.renderer.overlay;
    const key = `${hover.x},${hover.y},${o.hint()}`;
    if (key === lastKey && ov.preview) return;
    lastKey = key;
    const res = o.command(app.game, hover.x, hover.y, { dryRun: true });
    last = res && res.ok ? { ok: true, label: money(res.cost || 0) } : { ok: false, label: (res && res.error) || 'Not possible' };
    const tiles = o.footprint(hover.x, hover.y);
    ov.preview = { tiles, ok: last.ok, label: last.label };
    if (o.catchment) {
      const m = app.game.state.map;
      ov.catchment = catchmentAround(tiles, o.catchment, m.width, m.height);
    }
  };

  return {
    id: o.id,
    label: o.label,
    get hint() { return o.hint(); },
    move(t) { hover = t; refresh(); },
    down() {},
    up(t) {
      const res = o.command(app.game, t.x, t.y);
      lastKey = '';
      app.exec(res, { x: t.x, y: t.y, sound: 'build' });
      hover = t;
      refresh();
    },
    key(e) {
      if (!o.key) return false;
      const used = o.key(e);
      if (used) { lastKey = ''; refresh(); app.ui.updateHint(); }
      return used;
    },
    cancel() {
      hover = null;
      lastKey = '';
      app.renderer.overlay.preview = null;
      app.renderer.overlay.catchment = null;
    },
  };
}
