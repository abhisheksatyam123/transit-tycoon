/**
 * Industry list window: all industries grouped by type with production summary.
 */
import { el, setText } from '../dom.js';
import { num } from '../format.js';
import { listOrEmpty } from './common.js';
import { INDUSTRY_BY_ID } from '../../config/industries.js';

/**
 * @param {import('../app.js').App} app
 */
export function openIndustryList(app) {
  return app.wm.open('industries', {
    title: 'Industries',
    width: 340,
    build(body) {
      const list = el('div.list.scroll');
      body.append(list);
      return () => {
        const inds = app.game.state.industries.slice().sort((a, b) => String(a.typeId).localeCompare(String(b.typeId)) || a.id - b.id);
        listOrEmpty(list, inds, (i) => i.id,
          (i) => el('button.list-row', { type: 'button', title: 'Click: details · Double-click: center view',
            onclick: () => app.open('industry', i.id), ondblclick: () => app.centerOn(i.x + 1, i.y + 1) },
          el('i.swatch', { style: { background: (INDUSTRY_BY_ID[i.typeId] || {}).color || '#888' } }), el('span.name'), el('span.mono.num')),
          (row, i) => {
            setText(row.children[1], i.name);
            const made = Object.values(i.producedLastMonth || {}).reduce((a, b) => a + b, 0);
            const moved = Object.values(i.transportedLastMonth || {}).reduce((a, b) => a + b, 0);
            setText(row.children[2], made ? `${num(made)} · ${Math.round((moved / made) * 100)}%` : '—');
          });
      };
    },
  });
}
