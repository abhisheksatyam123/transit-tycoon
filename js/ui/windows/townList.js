/**
 * Town list window: all towns by population; click to open, double-click to center.
 */
import { el, setText } from '../dom.js';
import { num } from '../format.js';
import { listOrEmpty } from './common.js';

/**
 * @param {import('../app.js').App} app
 */
export function openTownList(app) {
  return app.wm.open('towns', {
    title: 'Towns',
    width: 300,
    build(body) {
      const total = el('div.muted');
      const list = el('div.list.scroll');
      body.append(total, list);
      return () => {
        const towns = app.game.state.towns.slice().sort((a, b) => b.population - a.population);
        let pop = 0;
        for (const t of towns) pop += t.population;
        setText(total, `${towns.length} towns · total population ${num(pop)}`);
        listOrEmpty(list, towns, (t) => t.id,
          (t) => el('button.list-row', { type: 'button', title: 'Click: details · Double-click: center view',
            onclick: () => app.open('town', t.id), ondblclick: () => app.centerOn(t.x, t.y) },
          el('span.name'), el('span.mono.num')),
          (row, t) => { setText(row.firstChild, t.name); setText(row.lastChild, num(t.population)); });
      };
    },
  });
}
