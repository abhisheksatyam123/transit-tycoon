/**
 * Depot window: vehicles inside, start/sell them, buy a new vehicle.
 */
import { el, setText } from '../dom.js';
import { money } from '../format.js';
import { cargoName, cargoColor } from '../cargo.js';
import { MODEL_BY_ID } from '../../config/vehicles.js';
import { wagonList } from '../../simulation/consist.js';
import { listOrEmpty } from './common.js';

/**
 * Consist editor strip (T19): one block per engine/wagon and +/- wagon buttons. Only for trains in a depot.
 * Rules (simulation/cmdVehicle.js addWagons/removeWagons): empty train, max MAX_WAGONS, min 0 wagons.
 */
function consistStrip(app, id) {
  const blocks = el('span.consist-blocks');
  const pick = el('select.sm', { title: 'Wagon model to add', 'aria-label': 'Wagon model' });
  const add = el('button.btn.sm', { type: 'button', text: '+ wagon', onclick: () => {
    const modelId = pick.value;
    const r = modelId ? app.game.addWagonModel(id, modelId) : app.game.addWagons(id, 1);
    app.exec(r, { sound: 'click' });
  } });
  const del = el('button.btn.sm.danger', { type: 'button', text: '− wagon', onclick: () => app.exec(app.game.removeWagons(id, 1), { sound: 'click' }) });
  const note = el('span.muted.small');
  const row = el('div.consist-row', null, blocks, pick, add, del, note);
  row._pick = pick;
  return row;
}

/** Wagon models that can be bought in the current year (the picker's options). */
function wagonOptions(app) {
  return app.game.listModels('wagon').filter((m) => m.kind === 'wagon');
}

/** Refresh a consist strip: per-wagon blocks (with move / sell), button labels (price / refund), disabled reasons. */
function updateConsistStrip(strip, app, v) {
  const [blocks, pick, add, del, note] = strip.children;
  const g = app.game;
  // picker: keep the current options (wagon models) and the last choice
  if (!pick.options.length || pick.dataset.n !== String(wagonOptions(app).length)) {
    pick.textContent = '';
    for (const m of wagonOptions(app)) pick.appendChild(el('option', { value: m.id, text: `${m.name} (${money(m.cost)})` }));
    pick.dataset.n = String(wagonOptions(app).length);
  }
  blocks.textContent = '';
  blocks.appendChild(el('span.consist-block.engine', { text: 'E', title: 'Engine' }));
  const list = wagonList(v);
  list.forEach((w, i) => {
    const m = MODEL_BY_ID[w.modelId];
    const title = `${m ? m.name : w.modelId} (${cargoName(w.cargoId)})`;
    const b = el('span.consist-block.wagon', { text: 'W', title });
    b.dataset.index = String(i);
    b.style.background = cargoColor(w.cargoId);
    const toLeft = el('button.btn.sm.wagon-move', { type: 'button', text: '◀', title: 'Move wagon towards the engine', onclick: () => app.exec(g.moveWagon(v.id, i, -1), { sound: 'click' }) });
    const toRight = el('button.btn.sm.wagon-move', { type: 'button', text: '▶', title: 'Move wagon away from the engine', onclick: () => app.exec(g.moveWagon(v.id, i, 1), { sound: 'click' }) });
    const sell = el('button.btn.sm.danger.wagon-sell', { type: 'button', text: '×', title: `Sell this ${title}`, onclick: () => app.exec(g.sellWagon(v.id, i), { sound: 'click' }) });
    blocks.appendChild(el('span.wagon-cell', null, toLeft, b, toRight, sell));
  });
  const a = g.addWagonModel(v.id, pick.value || 'wag_hopper', { dryRun: true });
  const r = g.removeWagons(v.id, 1, { dryRun: true });
  add.textContent = a.ok ? `+ wagon (${money(a.cost)})` : '+ wagon';
  add.disabled = !a.ok;
  add.title = a.ok ? 'Buy one more wagon of the chosen model at the end of this train' : a.error;
  del.textContent = r.ok ? `− last wagon (refund ${money(r.cost)})` : '− wagon';
  del.disabled = !r.ok;
  del.title = r.ok ? 'Sell the last wagon of this train' : r.error;
  const mixed = !!v.consist;
  setText(note, `${v.wagons || 0} wagon(s) · ${v.capacity || 0} capacity${mixed ? ' · mixed consist' : ''}`);
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
        win.setTitle(d.kind === 'rail' ? 'Train Depot' : d.kind === 'air' ? 'Hangar' : d.kind === 'ship' ? 'Ship Depot' : 'Road Vehicle Depot');
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
