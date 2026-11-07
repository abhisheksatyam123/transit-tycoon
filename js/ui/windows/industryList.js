/**
 * Industry list window: all industries sortable by name / type / production / transported %
 * (ascending or descending). Sort is window UI state only (OpenTTD industry_gui.cpp SortIndustries).
 */
import { el, setText } from '../dom.js';
import { num } from '../format.js';
import { listOrEmpty } from './common.js';
import { INDUSTRY_BY_ID } from '../../config/industries.js';
import { sortIndustries, INDUSTRY_SORTS, makeSortMemo, sumMap, transportedPct } from './listSort.js';
import { sortControls } from './sortControls.js';

/**
 * @param {import('../app.js').App} app
 */
export function openIndustryList(app) {
  const state = { sort: 'type', dir: 1 };
  return app.wm.open('industries', {
    title: 'Industries',
    width: 340,
    build(body) {
      const list = el('div.list.scroll');
      const memo = makeSortMemo((xs) => sortIndustries(xs, state),
        (i) => [i.name || '', String((INDUSTRY_BY_ID[i.typeId] || {}).name || i.typeId), sumMap(i.producedLastMonth), transportedPct(i)]);
      const controls = sortControls(INDUSTRY_SORTS, state, () => app.wm.updateAll());
      body.append(controls.bar, list);
      return () => {
        const inds = memo(app.game.state.industries, `${state.sort}:${state.dir}`);
        listOrEmpty(list, inds, (i) => i.id,
          (i) => el('button.list-row', { type: 'button', title: 'Click: details · Double-click: center view',
            onclick: () => app.open('industry', i.id), ondblclick: () => app.centerOn(i.x + 1, i.y + 1) },
          el('i.swatch', { style: { background: (INDUSTRY_BY_ID[i.typeId] || {}).color || '#888' } }), el('span.name'), el('span.mono.num')),
          (row, i) => {
            setText(row.children[1], i.name);
            const made = sumMap(i.producedLastMonth);
            setText(row.children[2], made ? `${num(made)} · ${transportedPct(i)}%` : '—');
          });
      };
    },
  });
}
