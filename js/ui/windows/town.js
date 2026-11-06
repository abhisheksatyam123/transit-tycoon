/**
 * Town window: population, houses, passengers, growth.
 */
import { el } from '../dom.js';
import { num } from '../format.js';
import { kvGrid } from './common.js';
import { openRename } from '../rename.js';

/**
 * @param {import('../app.js').App} app
 * @param {number} id town id
 */
export function openTown(app, id) {
  return app.wm.open('town:' + id, {
    title: 'Town',
    width: 280,
    build(body, win) {
      const set = kvGrid(body, ['Population', 'Houses', 'Passengers last month', 'Passengers transported', 'Goods delivered', 'Growth']);
      body.appendChild(el('div.btn-row', null, el('button.btn', { type: 'button', text: 'Center view', onclick: () => {
        const t = app.findTown(id);
        if (t) app.centerOn(t.x, t.y);
      } }), el('button.btn', { type: 'button', text: 'Rename…', onclick: () => openRename(app, 'town', id) })));
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
      };
    },
  });
}
