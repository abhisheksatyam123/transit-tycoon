/**
 * Depot window: vehicles inside, start/sell them, buy a new vehicle.
 */
import { el, setText } from '../dom.js';
import { money } from '../format.js';
import { cargoName } from '../cargo.js';
import { listOrEmpty } from './common.js';

/**
 * Consist editor strip (T19): one block per engine/wagon and +/- wagon buttons. Only for trains in a depot.
 * Rules (simulation/cmdVehicle.js addWagons/removeWagons): empty train, max MAX_WAGONS, min 0 wagons.
 */
function consistStrip(app, id) {
  const blocks = el('span.consist-blocks');
  const add = el('button.btn.sm', { type: 'button', text: '+ wagon', onclick: () => app.exec(app.game.addWagons(id, 1), { sound: 'click' }) });
  const del = el('button.btn.sm.danger', { type: 'button', text: '− wagon', onclick: () => app.exec(app.game.removeWagons(id, 1), { sound: 'click' }) });
  const note = el('span.muted.small');
  return el('div.consist-row', null, blocks, add, del, note);
}

/** Refresh a consist strip: blocks, button labels (price / refund) and disabled reasons. */
function updateConsistStrip(strip, app, v) {
  const [blocks, add, del, note] = strip.children;
  blocks.textContent = '';
  blocks.appendChild(el('span.consist-block.engine', { text: 'E', title: 'Engine' }));
  for (let i = 0; i < (v.wagons || 0); i++) blocks.appendChild(el('span.consist-block.wagon', { text: 'W', title: 'Wagon' }));
  const g = app.game;
  const a = g.addWagons(v.id, 1, { dryRun: true });
  const r = g.removeWagons(v.id, 1, { dryRun: true });
  add.textContent = a.ok ? `+ wagon (${money(a.cost)})` : '+ wagon';
  add.disabled = !a.ok;
  add.title = a.ok ? 'Buy one more wagon for this train' : a.error;
  del.textContent = r.ok ? `− wagon (refund ${money(r.cost)})` : '− wagon';
  del.disabled = !r.ok;
  del.title = r.ok ? 'Sell one wagon of this train' : r.error;
  setText(note, `${v.wagons || 0} wagon(s) · ${v.capacity || 0} capacity`);
}

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
          (v) => el('div.consist-wrap', null,
            el('div.list-row.split', null,
              el('button.link', { type: 'button', onclick: () => app.open('vehicle', v.id) }),
              el('span.row-actions', null,
                el('button.btn.sm', { type: 'button', text: 'Orders', onclick: () => app.open('orders', v.id) }),
                el('button.btn.sm', { type: 'button', text: 'Start', onclick: () => app.exec(app.game.startVehicle(v.id), { sound: 'horn' }) }),
                el('button.btn.sm.danger', { type: 'button', text: 'Sell', onclick: () => app.exec(app.game.sellVehicle(v.id), { sound: 'click' }) }))),
            v.kind === 'train' ? consistStrip(app, v.id) : null),
          (row, v) => {
            setText(row.firstChild.firstChild, `${v.name} · ${cargoName(v.cargoId)} · ${money(v.value || 0)}`);
            if (v.kind === 'train') updateConsistStrip(row.lastChild, app, v);
          },
          'Empty — buy a vehicle');
      };
    },
  });
}
