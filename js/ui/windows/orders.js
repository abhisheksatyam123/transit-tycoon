/**
 * Orders editor: list, load/unload flags, skip, delete, move up/down, and "Add order" map mode.
 * All edits go through game.setOrders(id, orders).
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';
import { createAddOrderTool } from '../tools/addOrder.js';
import { unloadMode } from '../../simulation/orders.js';
import { sharers } from '../../simulation/sharedOrders.js';

const LOAD_OPTIONS = [['normal', 'Normal load'], ['full', 'Full load'], ['none', 'No loading']];
const UNLOAD_OPTIONS = [['normal', 'Normal unload'], ['all', 'Unload all'], ['transfer', 'Transfer'], ['none', 'No unloading']];

/** Current load mode of an order. */
function loadModeOf(o) {
  return o.load || (o.full ? 'full' : 'normal');
}

/**
 * @param {import('../app.js').App} app
 * @param {number} id vehicle id
 */
export function openOrders(app, id) {
  return app.wm.open('orders:' + id, {
    title: 'Orders',
    width: 400,
    onClose: () => { if (app.tool && app.tool.id === 'addOrder') app.setTool(null); },
    build(body, win) {
      const list = el('div.list.orders');
      const addBtn = el('button.btn.primary', { type: 'button', text: '+ Add order' });
      const startBtn = el('button.btn', { type: 'button', text: 'Start vehicle', onclick: () => { const v = app.findVehicle(id); if (app.exec(app.game.startVehicle(id), { sound: 'horn' })) app.toast(`${v ? v.name : 'Vehicle'} started`, 'good'); } });
      const sharedLabel = el('div.muted.small.shared-orders', { text: '' });
      const unshareBtn = el('button.btn.sm', { type: 'button', text: 'Unshare', title: 'Give this vehicle its own copy of the order list', onclick: () => app.exec(app.game.unshareOrders(id), { quiet: true, sound: 'click' }) });
      const hint = el('div.muted.small', { text: 'Add stations in the order the vehicle should visit them. "Full load" waits until full.' });
      const needs2 = el('div.warn.small', { text: 'Needs 2+ orders (stations) to run a route.' });
      needs2.hidden = true;
      const autofillBtn = el('button.btn.sm', { type: 'button', text: 'Autofill timetable', title: 'Record the measured wait and travel times over one round of orders', onclick: () => {
        const v = app.findVehicle(id);
        if (v) app.exec(app.game.setTimetableAutofill(id, !v.autofill), { quiet: true, sound: 'click' });
      } });
      const resetBtn = el('button.btn.sm', { type: 'button', text: 'Reset late', title: 'Clear the recorded lateness', onclick: () => app.exec(app.game.resetLateness(id), { quiet: true, sound: 'click' }) });
      body.append(list, el('div.btn-row', null, addBtn, startBtn), el('div.btn-row', null, sharedLabel, unshareBtn), el('div.btn-row', null, autofillBtn, resetBtn), needs2, hint);

      const edit = (fn) => {
        const v = app.findVehicle(id);
        if (!v) return;
        const orders = v.orders.map((o) => ({ ...o }));
        fn(orders);
        app.exec(app.game.setOrders(id, orders), { quiet: true, sound: 'click' });
      };
      addBtn.addEventListener('click', () => {
        if (app.tool && app.tool.id === 'addOrder') app.setTool(null);
        else app.setTool(createAddOrderTool(app, id));
      });

      return () => {
        const v = app.findVehicle(id);
        if (!v) { win.close(); return; }
        win.setTitle(`Orders — ${v.name}`);
        needs2.hidden = new Set(v.orders.map((o) => o.stationId)).size >= 2;
        const adding = !!app.tool && app.tool.id === 'addOrder';
        addBtn.classList.toggle('active', adding);
        setText(addBtn, adding ? 'Click a station… (Esc)' : '+ Add order');
        startBtn.hidden = !(v.state === 'depot' || v.state === 'stopped');
        const n = sharers(app.game.state, v).length;
        sharedLabel.hidden = !n;
        unshareBtn.hidden = !n;
        setText(sharedLabel, n ? `Shared with ${n} other vehicle${n === 1 ? '' : 's'}` : '');
        setText(autofillBtn, v.autofill ? 'Autofill: on (recording)' : 'Autofill timetable');
        autofillBtn.classList.toggle('active', !!v.autofill);
        resetBtn.hidden = v.lateDays == null;
        const items = v.orders.map((o, i) => ({ o, i, key: i + ':' + o.stationId }));
        listOrEmpty(list, items, (it) => it.key,
          (it) => el('div.order-row', null,
            el('span.order-idx.mono'), el('span.name'),
            el('span.order-flags', null,
              el('select.input', { title: 'Load', onchange: (e) => edit((os) => { os[it.i].load = e.target.value; os[it.i].full = e.target.value === 'full'; }) },
                ...LOAD_OPTIONS.map(([val, label]) => el('option', { value: val, text: label }))),
              el('select.input', { title: 'Unload', onchange: (e) => edit((os) => { os[it.i].unload = e.target.value; }) },
                ...UNLOAD_OPTIONS.map(([val, label]) => el('option', { value: val, text: label }))),
              el('label.small', { text: 'wait ' }, el('input.input', { type: 'number', min: '0', max: '365', step: '1', title: 'Wait days: minimum days to wait at this stop (blank = auto)', placeholder: 'wait days', style: 'width:5em',
                onchange: (e) => app.exec(app.game.setOrderTimetable(id, it.i, { waitDays: Number(e.target.value) || 0 }), { quiet: true, sound: 'click' }) }),
                el('span', { text: ' d' })),
              el('label.small', { text: ' travel ' }, el('input.input', { type: 'number', min: '0', max: '365', step: '1', title: 'Travel days: scheduled days from the previous stop (blank = auto)', placeholder: 'travel days', style: 'width:5.5em',
                onchange: (e) => app.exec(app.game.setOrderTimetable(id, it.i, { travelDays: Number(e.target.value) || 0 }), { quiet: true, sound: 'click' }) }),
                el('span', { text: ' d' }))),
            el('span.row-actions', null,
              el('button.btn.sm', { type: 'button', text: 'Skip', title: 'Go to this order now', onclick: () => app.exec(app.game.skipToOrder(id, it.i), { quiet: true, sound: 'click' }) }),
              el('button.btn.sm', { type: 'button', text: '▲', title: 'Move up', onclick: () => edit((os) => { if (it.i > 0) os.splice(it.i - 1, 0, os.splice(it.i, 1)[0]); }) }),
              el('button.btn.sm', { type: 'button', text: '▼', title: 'Move down', onclick: () => edit((os) => { if (it.i < os.length - 1) os.splice(it.i + 1, 0, os.splice(it.i, 1)[0]); }) }),
              el('button.btn.sm.danger', { type: 'button', text: '✕', title: 'Delete', onclick: () => edit((os) => { os.splice(it.i, 1); }) }))),
          (row, it) => {
            const st = app.findStation(it.o.stationId);
            setText(row.children[0], String(it.i + 1));
            setText(row.children[1], st ? st.name : `Station #${it.o.stationId} (removed)`);
            row.classList.toggle('current', it.i === v.orderIndex);
            const [loadSel, unloadSel] = /** @type {HTMLSelectElement[]} */ (Array.from(row.querySelectorAll('select')));
            if (loadSel.value !== loadModeOf(it.o)) loadSel.value = loadModeOf(it.o);
            if (unloadSel.value !== unloadMode(it.o)) unloadSel.value = unloadMode(it.o);
            const [waitIn, travelIn] = /** @type {HTMLInputElement[]} */ (Array.from(row.querySelectorAll('input')));
            if (document.activeElement !== waitIn) waitIn.value = it.o.waitDays ? String(it.o.waitDays) : '';
            if (document.activeElement !== travelIn) travelIn.value = it.o.travelDays ? String(it.o.travelDays) : '';
          }, 'No orders — click "Add order", then a station on the map');
      };
    },
  });
}
