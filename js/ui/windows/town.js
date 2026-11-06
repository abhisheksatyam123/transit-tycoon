/**
 * Town window: population, houses, passengers, growth; the company's local authority rating (T8) and the
 * authority actions (advertising, statue, fund buildings) with their costs.
 */
import { el } from '../dom.js';
import { num, money } from '../format.js';
import { kvGrid } from './common.js';
import { openRename } from '../rename.js';
import { actionList, ratingTitle, townRating } from '../../simulation/townAuthority.js';

/**
 * @param {import('../app.js').App} app
 * @param {number} id town id
 */
export function openTown(app, id) {
  return app.wm.open('town:' + id, {
    title: 'Town',
    width: 280,
    build(body, win) {
      const set = kvGrid(body, ['Population', 'Houses', 'Passengers last month', 'Passengers transported', 'Goods delivered', 'Growth', 'Local authority']);
      body.appendChild(el('div.btn-row', null, el('button.btn', { type: 'button', text: 'Center view', onclick: () => {
        const t = app.findTown(id);
        if (t) app.centerOn(t.x, t.y);
      } }), el('button.btn', { type: 'button', text: 'Rename…', onclick: () => openRename(app, 'town', id) })));
      const auth = el('div.town-auth');
      auth.appendChild(el('div.town-auth-title', { text: 'Authority actions' }));
      const rows = el('div.town-auth-list');
      auth.appendChild(rows);
      body.appendChild(auth);
      let lastKey = '';
      return () => {
        const t = app.findTown(id);
        if (!t) { win.close(); return; }
        win.setTitle(t.name);
        set['Population'](num(t.population));
        set['Houses'](num(t.houses ? t.houses.length : 0));
        set['Passengers last month'](num(t.passengersLastMonth));
        set['Passengers transported'](num(t.passengersTransported));
        set['Goods delivered'](num(t.goodsDelivered));
        const g = t.passengersTransported > 0 || t.goodsDelivered > 0 ? 'Fast (served)' : 'Slow (no service)';
        set['Growth'](g);
        const r = townRating(t);
        set['Local authority'](`${ratingTitle(r)} (${r})`);
        const list = actionList(app.game.state, t);
        // rebuild the action buttons only when the state they show changes (cheap per-tick refresh)
        const key = list.map((a) => `${a.id}:${a.enabled}:${a.cost}:${a.detail}`).join('|');
        if (key !== lastKey) {
          lastKey = key;
          rows.replaceChildren(...list.map((a) => el('div.town-auth-row', null,
            el('button.btn', { type: 'button', text: `${a.label} · ${money(a.cost)}`, disabled: !a.enabled, onclick: () => {
              app.exec(app.game.townAction(id, a.id), { quiet: true });
              lastKey = '';
            } }),
            el('div.town-auth-detail', { text: a.detail }))));
        }
      };
    },
  });
}
