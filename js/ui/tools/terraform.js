/**
 * Terraform tools: raise / lower / level land (C cycles the mode) and plant trees.
 * Drag a rectangle; the preview highlights the tiles that will change and shows the estimated cost
 * (red + reason when invalid or unaffordable). Commits on release via game.terraform.
 */
import { money } from '../format.js';
import { rectTiles } from './geometry.js';

export const TERRA_MODES = ['raise', 'lower', 'level'];
const MODE_LABEL = { raise: 'Raise', lower: 'Lower', level: 'Level' };

/**
 * @param {import('../app.js').App} app
 * @param {{id:'terraform'|'plant', label:string}} o
 * @returns {import('./index.js').Tool}
 */
function makeTerraformTool(app, o) {
  let mode = 'raise';
  let start = null;
  let lastKey = '';
  /** @type {{ok:boolean,label:string}} */
  let last = { ok: false, label: '' };
  const opFor = () => (o.id === 'plant' ? 'plant' : mode);

  const preview = (end) => {
    if (!start || !end) return;
    const key = `${opFor()},${start.x},${start.y},${end.x},${end.y}`;
    if (key !== lastKey) {
      lastKey = key;
      const rect = { x0: start.x, y0: start.y, x1: end.x, y1: end.y };
      const plan = app.game.planTerraform(opFor(), rect);
      if (!plan.ok) {
        const est = app.game.estimateTerraform(opFor(), rect);
        last = { ok: false, label: plan.error + (est.cost ? ` (${money(est.cost)})` : '') };
      } else {
        const est = app.game.estimateTerraform(opFor(), rect);
        last = est.ok
          ? { ok: true, label: `${money(est.cost)} · ${est.tiles} tile${est.tiles === 1 ? '' : 's'}` }
          : { ok: false, label: `${est.error} (${money(est.cost)})` };
      }
      app.ui?.updateHint?.();
    }
    const plan = app.game.planTerraform(opFor(), { x0: start.x, y0: start.y, x1: end.x, y1: end.y });
    const tiles = plan.ok ? plan.changes.map((c) => ({ x: c.x, y: c.y })) : rectTiles(start.x, start.y, end.x, end.y);
    app.renderer.overlay.preview = { tiles, ok: last.ok, label: last.label };
  };

  return {
    id: o.id,
    label: o.label,
    get hint() {
      if (o.id === 'plant') {
        const live = start && last.label ? ` Now: ${last.label}.` : '';
        return `Drag a rectangle over grass to plant trees (25 each, demolish clears them).${live} Esc cancels.`;
      }
      const modes = TERRA_MODES.map((k) => (k === mode ? `[${MODE_LABEL[k]}]` : MODE_LABEL[k])).join(' | ');
      const live = start && last.label ? ` Now: ${last.label}.` : '';
      const what = mode === 'level' ? 'Drag from the tile whose height you want; the rectangle is levelled to it.'
        : 'Click a tile or drag a rectangle; each tile moves one level.';
      return `Mode: ${modes} (C cycles). ${what} Neighbours adjust; no change next to water, buildings or track.${live}`;
    },
    key(e) {
      if (o.id !== 'terraform') return false;
      if (e.key !== 'c' && e.key !== 'C') return false;
      mode = TERRA_MODES[(TERRA_MODES.indexOf(mode) + 1) % TERRA_MODES.length];
      lastKey = '';
      if (start) preview(start);
      app.ui?.updateHint?.();
      app.toast?.(`Terraform: ${MODE_LABEL[mode]}`, 'info');
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
      const res = app.game.terraform(opFor(), { x0: s.x, y0: s.y, x1: t.x, y1: t.y });
      app.exec(res, { x: t.x, y: t.y, sound: 'build' });
      app.ui?.updateHint?.();
    },
    cancel() {
      start = null;
      lastKey = '';
      app.renderer.overlay.preview = null;
    },
  };
}

/** @param {import('../app.js').App} app */
export function createTerraformTool(app) {
  return makeTerraformTool(app, { id: 'terraform', label: 'Terraform' });
}

/** @param {import('../app.js').App} app */
export function createPlantTool(app) {
  return makeTerraformTool(app, { id: 'plant', label: 'Plant trees' });
}
