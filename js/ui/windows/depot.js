/**
 * Depot window: vehicles inside, start/sell them, buy a new vehicle.
 */
import { el, setText } from '../dom.js';
import { money } from '../format.js';
import { cargoName } from '../cargo.js';
import { listOrEmpty } from './common.js';

/**
 * @param {import('../app.js').App} app
 * @param {number} id depot id
 */
export function openDepot(app, id) {
  return app.wm.open('depot:' + id, {
    title: 'Depot',
    width: 320,
    build(body, win) {
      const info = el('div.muted');
      const list = el('div.list.scroll');
      const buy = el('button.btn.primary', { type: 'button', text: 'Buy vehicle…', onclick: () => app.open('buyVehicle', id) });
      const center = el('button.btn', { type: 'button', text: 'Center view', onclick: () => { const d = app.findDepot(id); if (d) app.centerOn(d.x, d.y); } });
      const startAll = el('button.btn', { type: 'button', text: 'Start all', title: 'Start every vehicle inside this depot', onclick: () => {
        const ids = app.game.state.vehicles.filter((v) => v.depotId === id && v.state === 'depot').map((v) => v.id);
        app.exec(app.game.massStartStop(ids, true), { sound: 'horn' });
      } });
      const stopAll = el('button.btn', { type: 'button', text: 'Stop all', title: 'Stop every vehicle that belongs to this depot and is out on the road', onclick: () => {
        const ids = app.game.state.vehicles.filter((v) => v.depotId === id && v.state !== 'depot').map((v) => v.id);
        app.exec(app.game.massStartStop(ids, false), { sound: 'click' });
      } });
      body.append(info, list, el('div.btn-row', null, buy, center, startAll, stopAll));
      return () => {
        const d = app.findDepot(id);
        if (!d) { win.close(); return; }
        win.setTitle(d.kind === 'rail' ? 'Train Depot' : 'Road Vehicle Depot');
        const inside = app.game.state.vehicles.filter((v) => v.depotId === id && v.state === 'depot');
        setText(info, `${inside.length} vehicle(s) inside · (${d.x}, ${d.y})`);
        listOrEmpty(list, inside, (v) => v.id,
          (v) => el('div.list-row.split', null,
            el('button.link', { type: 'button', onclick: () => app.open('vehicle', v.id) }),
            el('span.row-actions', null,
              el('button.btn.sm', { type: 'button', text: 'Orders', onclick: () => app.open('orders', v.id) }),
              el('button.btn.sm', { type: 'button', text: 'Start', onclick: () => app.exec(app.game.startVehicle(v.id), { sound: 'horn' }) }),
              el('button.btn.sm.danger', { type: 'button', text: 'Sell', onclick: () => app.exec(app.game.sellVehicle(v.id), { sound: 'click' }) }))),
          (row, v) => setText(row.firstChild, `${v.name} · ${cargoName(v.cargoId)} · ${money(v.value || 0)}`),
          'Empty — buy a vehicle');
      };
    },
  });
}
