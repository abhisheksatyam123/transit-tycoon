/**
 * Town list window: all towns, sortable by name / population / rating (ascending or descending);
 * click to open, double-click to center. Sort is window UI state only (OpenTTD town_gui.cpp SortTownWindow).
 */
import { el, setText } from '../dom.js';
import { num } from '../format.js';
import { listOrEmpty, singleClick } from './common.js';
import { sortTowns, TOWN_SORTS, makeSortMemo, filterTowns } from './listSort.js';
import { sortControls, nameSearch } from './sortControls.js';
import { townRating } from '../../simulation/townAuthority.js';

/**
 * @param {import('../app.js').App} app
 */
export function openTownList(app) {
  const state = { sort: 'population', dir: -1, query: '' };
  return app.wm.open('towns', {
    title: 'Towns',
    width: 300,
    build(body) {
      const total = el('div.muted');
      const list = el('div.list.scroll');
      const memo = makeSortMemo((ts) => sortTowns(ts, state), (t) => [t.name || '', t.population || 0, townRating(t)]);
      const controls = sortControls(TOWN_SORTS, state, () => app.wm.updateAll());
      const search = nameSearch(state, 'Search towns by name', () => app.wm.updateAll());
      body.append(controls.bar, search, total, list);
      return () => {
        const towns = app.game.state.towns;
        let pop = 0;
        for (const t of towns) pop += t.population;
        const sorted = filterTowns(memo(towns, `${state.sort}:${state.dir}`), state.query);
        setText(total, `${sorted.length === towns.length ? '' : `${sorted.length} of `}${towns.length} towns · total population ${num(pop)}`);
        listOrEmpty(list, sorted, (t) => t.id,
          (t) => el('button.list-row', { type: 'button', title: 'Click: details · Double-click: center view',
            onclick: singleClick(() => app.open('town', t.id)), ondblclick: () => app.centerOn(t.x, t.y) },
          el('span.name'), el('span.mono.num')),
          (row, t) => { setText(row.firstChild, t.name); setText(row.lastChild, num(t.population)); });
      };
    },
  });
}
