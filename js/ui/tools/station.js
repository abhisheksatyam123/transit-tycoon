/**
 * Rail station tool: R rotates axis, [ and ] change platform length (1-6), S cycles the
 * station style available in the current year. Dragging a rectangle builds N platforms x
 * length (the rectangle's long side along the axis, its other side = platform count).
 * A plain click builds one platform of `length`, as before.
 */
import { AXIS_BITS } from '../../simulation/constants.js';
import { createPlacementTool } from './placement.js';
import { stationFootprint } from './geometry.js';
import { availableStyles, styleById, DEFAULT_STYLE } from '../../config/stationTypes.js';

const RADIUS = 4;

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createStationTool(app) {
  let axis = /** @type {'x'|'y'} */ ('x');
  let length = 3;
  let style = DEFAULT_STYLE;
  let dragStart = /** @type {{x:number,y:number}|null} */ (null);
  const year = () => app.game.state.date.year;
  /**
   * Axis actually used at (x,y) (OpenLoco-style auto orientation): a one-tile-thick drag runs along its
   * long side; a plain click on straight track follows the track; otherwise the R-rotated axis.
   */
  const axisAt = (x, y) => {
    if (dragStart && (dragStart.x !== x || dragStart.y !== y)) {
      const w = Math.abs(dragStart.x - x) + 1, h = Math.abs(dragStart.y - y) + 1;
      if (h === 1 && w > 1) return 'x';
      if (w === 1 && h > 1) return 'y';
      return axis;
    }
    const t = app.game.tile ? app.game.tile(x, y) : null;
    const bits = t ? t.rail | 0 : 0;
    if (bits === AXIS_BITS.x) return 'x';
    if (bits === AXIS_BITS.y) return 'y';
    return axis;
  };
  /** Drag rectangle from dragStart to (x,y): origin, length and platforms (null = plain click). */
  const rectFor = (x, y) => {
    if (!dragStart || (dragStart.x === x && dragStart.y === y)) return null;
    const a = axisAt(x, y);
    const x0 = Math.min(dragStart.x, x), y0 = Math.min(dragStart.y, y);
    const w = Math.abs(dragStart.x - x) + 1, h = Math.abs(dragStart.y - y) + 1;
    const along = a === 'x' ? w : h;
    const across = a === 'x' ? h : w;
    return { x: x0, y: y0, length: Math.min(10, along), platforms: Math.min(6, across), axis: a };
  };
  const plan = (x, y) => {
    const r = rectFor(x, y);
    if (r) return r;
    return { x, y, length, platforms: 1, axis: axisAt(x, y) };
  };
  const tool = createPlacementTool(app, {
    id: 'station', label: 'Rail Station', catchment: RADIUS, joinKind: 'rail',
    hint: () => {
      const s = styleById('rail', style);
      const drag = dragStart ? ' Drag a rectangle: long side = length, short side = platforms.' : '';
      return `Rail station: axis ${axis.toUpperCase()}, length ${length}, style ${s.name}. R rotates, [ ] length, S style, Ctrl+click joins a distant station.${drag}`;
    },
    command: (g, x, y, opts) => {
      const p = (opts && opts.plan) || plan(x, y);
      return g.buildRailStation(p.x, p.y, p.axis || axis, p.length, { ...(opts || {}), plan: undefined, platforms: p.platforms, style, player: true });
    },
    footprint: (x, y) => {
      const p = plan(x, y);
      const a = p.axis;
      if (p.platforms === 1) return stationFootprint(p.x, p.y, a, p.length);
      const out = [];
      for (let q = 0; q < p.platforms; q++) out.push(...stationFootprint(p.x + (a === 'y' ? q : 0), p.y + (a === 'x' ? q : 0), a, p.length));
      return out;
    },
    key(e) {
      if (e.key === 'r' || e.key === 'R') { axis = axis === 'x' ? 'y' : 'x'; return true; }
      if (e.key === '[') { length = Math.max(1, length - 1); return true; }
      if (e.key === ']') { length = Math.min(6, length + 1); return true; }
      if (e.key === 's' || e.key === 'S') {
        const list = availableStyles('rail', year()).map((s) => s.id);
        const i = list.indexOf(style);
        style = list[(i + 1) % list.length];
        return true;
      }
      return false;
    },
  });
  const base = { down: tool.down, move: tool.move, up: tool.up, cancel: tool.cancel };
  tool.down = (t) => { dragStart = { x: t.x, y: t.y }; base.down(t); };
  tool.move = (t) => base.move(t);
  tool.up = (t) => {
    try { base.up({ ...t, plan: plan(t.x, t.y) }); } finally { dragStart = null; }
  };
  tool.cancel = () => { dragStart = null; base.cancel(); };
  return tool;
}
