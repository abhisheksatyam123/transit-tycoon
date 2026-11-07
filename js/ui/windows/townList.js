/**
 * Town list window: all towns, sortable by name / population / rating (ascending or descending);
 * click to open, double-click to center. Sort is window UI state only (OpenTTD town_gui.cpp SortTownWindow).
 */
import { el, setText } from '../dom.js';
import { num } from '../format.js';
import { listOrEmpty } from './common.js';
import { sortTowns, TOWN_SORTS, makeSortMemo } from './listSort.js';
import { sortControls } from './sortControls.js';
import { townRating } from '../../simulation/townAuthority.js';

/**
 * @param {import('../app.js').App} app
 */
export function openTownList(app) {
  const state = { sort: 'population', dir: -1 };
  return app.wm.open('towns', {
    title: 'Towns',
    width: 300,
    build(body) {
      const total = el('div.muted');
      const list = el('div.list.scroll');
      const memo = makeSortMemo((ts) => sortTowns(ts, state), (t) => [t.name || '', t.population || 0, townRating(t)]);
      const controls = sortControls(TOWN_SORTS, state, () => app.wm.updateAll());
      body.append(controls.bar, total, list);
      return () => {
        const towns = app.game.state.towns;
        let pop = 0;
        for (const t of towns) pop += t.population;
        setText(total, `${towns.length} towns · total population ${num(pop)}`);
        const sorted = memo(towns, `${state.sort}:${state.dir}`);
        listOrEmpty(list, sorted, (t) => t.id,
          (t) => el('button.list-row', { type: 'button', title: 'Click: details · Double-click: center view',
            onclick: () => app.open('town', t.id), ondblclick: () => app.centerOn(t.x, t.y) },
          el('span.name'), el('span.mono.num')),
          (row, t) => { setText(row.firstChild, t.name); setText(row.lastChild, num(t.population)); });
      };
    },
  });
}
