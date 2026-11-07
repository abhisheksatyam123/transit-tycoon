/**
 * Town window: population, houses, passengers, growth; the company's local authority rating (T8) and the
 * authority actions (advertising, statue, fund buildings) with their costs.
 */
import { el } from '../dom.js';
import { num, money } from '../format.js';
import { kvGrid } from './common.js';
import { openRename } from '../rename.js';
import { actionList, ratingTitle, townRating } from '../../simulation/townAuthority.js';
import { isArctic, snowLineOf, isTropic, tropicZoneAt } from '../../simulation/climate.js';

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
      // F13: OTTD-style growth requirements (only in sub-tropic desert / sub-arctic snow-line towns)
      const needWrap = el('div');
      const needSet = kvGrid(needWrap, ['Food required to grow', 'Water required to grow']);
      needWrap.hidden = true;
      body.appendChild(needWrap);
      body.appendChild(el('div.btn-row', null, el('button.btn', { type: 'button', text: 'Center view', onclick: () => {
        const t = app.findTown(id);
        if (t) app.centerOn(t.x, t.y);
      } }), el('button.btn', { type: 'button', text: 'Rename…', onclick: () => openRename(app, 'town', id) })));
      // scenario editor only (OpenLoco TownWindow: expand / delete buttons shown in editor/sandbox)
      const edit = el('div.btn-row', null,
        el('button.btn', { type: 'button', text: 'Expand town', onclick: () => {
          app.exec(app.game.expandTown(id), { quiet: true });
        } }),
        el('button.btn.danger', { type: 'button', text: 'Delete town', onclick: () => {
          if (app.exec(app.game.deleteTown(id), { quiet: true })) win.close();
        } }));
      body.appendChild(edit);
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
        edit.hidden = !app.game.state.editor;
        set['Population'](num(t.population));
        set['Houses'](num(t.houses ? t.houses.length : 0));
        set['Passengers last month'](num(t.passengersLastMonth));
        set['Passengers transported'](num(t.passengersTransported));
        set['Goods delivered'](num(t.goodsDelivered));
        const g = t.passengersTransported > 0 || t.goodsDelivered > 0 ? 'Fast (served)' : 'Slow (no service)';
        set['Growth'](g);
        const need = growthNeeds(app.game.state, t);
        needWrap.hidden = !need;
        if (need) {
          needSet['Food required to grow'](`delivered ${num(t.foodLastMonth || 0)} last month`);
          needSet['Water required to grow'](need.water ? `delivered ${num(t.waterLastMonth || 0)} last month` : 'not required here');
        }
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

/**
 * OTTD town growth requirements for a town (F13). Sub-tropic desert towns need FOOD and WATER; sub-arctic towns whose
 * centre is at or above the snow line need FOOD. Null for every other town (temperate towns unchanged).
 * @returns {{food:boolean, water:boolean}|null}
 */
export function growthNeeds(state, t) {
  if (!state || !t || !state.map) return null;
  if (isTropic(state) && tropicZoneAt(state.map, t.x, t.y) === 1) return { food: true, water: true };
  if (isArctic(state)) {
    const tile = state.map.tiles[t.y * state.map.width + t.x];
    if (tile && tile.height >= snowLineOf(state)) return { food: true, water: false };
  }
  return null;
}
