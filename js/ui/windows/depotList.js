/**
 * Depot list window (OpenTTD DepotWindow list / OpenLoco depot list): every player depot (rail, road,
 * airport hangar) with its kind, nearest town, and vehicles currently inside. Click a row to centre the
 * view on the depot; the Open button shows the depot window.
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';
import { depotDisplayName } from '../../simulation/cmdRename.js';

/** Display labels per depot kind. */
export const DEPOT_KIND_LABELS = { rail: 'Rail', road: 'Road', air: 'Airport hangar', water: 'Ship', ship: 'Ship' };

/**
 * Derived rows for the depot list (pure).
 * @param {any} state
 * @returns {{id:number, kind:string, kindLabel:string, x:number, y:number, town:string, inside:number, total:number}[]}
 */
export function depotRows(state) {
  const depots = state.depots || [];
  const vehicles = state.vehicles || [];
  const inside = new Map();
  const total = new Map();
  for (const v of vehicles) {
    if (v.depotId == null) continue;
    total.set(v.depotId, (total.get(v.depotId) || 0) + 1);
    if (v.state === 'depot') inside.set(v.depotId, (inside.get(v.depotId) || 0) + 1);
  }
  const towns = state.towns || [];
  return depots.map((d) => {
    let town = '', bd = Infinity;
    for (const t of towns) {
      const dist = Math.abs(t.x - d.x) + Math.abs(t.y - d.y);
      if (dist < bd) { bd = dist; town = t.name; }
    }
    return {
      id: d.id,
      kind: d.kind,
      kindLabel: DEPOT_KIND_LABELS[d.kind] || String(d.kind),
      x: d.x,
      y: d.y,
      town,
      name: depotDisplayName(d),
      inside: inside.get(d.id) || 0,
      total: total.get(d.id) || 0,
    };
  }).sort((a, b) => a.id - b.id);
}

/**
 * @param {import('../app.js').App} app
 */
export function openDepotList(app) {
  return app.wm.open('depots', {
    title: 'Depots',
    width: 340,
    build(body) {
      const summary = el('div.muted');
      const cols = '0.9fr 1.3fr 0.6fr 0.6fr auto';
      const head = el('div.table-head', { style: { gridTemplateColumns: cols } },
        el('span', { text: 'Depot' }), el('span', { text: 'Nearest town' }),
        el('span', { text: 'Inside' }), el('span', { text: 'Total' }), el('span', { text: '' }));
      const list = el('div.list.scroll.table');
      body.append(summary, head, list);
      const refresh = () => {
        const rows = depotRows(app.game.state);
        const inside = rows.reduce((s, r) => s + r.inside, 0);
        setText(summary, `${rows.length} depot(s) · ${inside} vehicle(s) inside`);
        listOrEmpty(list, rows, (r) => r.id,
          (r) => el('div.table-row.list-row', { role: 'button', tabindex: '0', title: 'Click: centre view on depot',
            style: { display: 'grid', gridTemplateColumns: cols, textAlign: 'left', cursor: 'pointer' },
            onclick: () => { app.centerOn(r.x, r.y); } },
          el('span.name'), el('span.name'), el('span.mono.num'), el('span.mono.num'),
          el('button.btn.sm', { type: 'button', text: 'Open', title: 'Open depot window',
            onclick: (e) => { e.stopPropagation(); app.open('depot', r.id); } })),
          (row, r) => {
            const c = row.children;
            setText(c[0], `${r.name} · ${r.kindLabel}`);
            setText(c[1], r.town || '—');
            setText(c[2], String(r.inside));
            setText(c[3], String(r.total));
          }, 'No depots yet — build a road or rail depot to see it here');
      };
      refresh();
      return refresh;
    },
  });
}
