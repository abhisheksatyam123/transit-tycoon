/**
 * Orders editor: list, load/unload flags, skip, delete, move up/down, and "Add order" map mode.
 * All edits go through game.setOrders(id, orders).
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';
import { createAddOrderTool, appendOrder, appendDepotOrder } from '../tools/addOrder.js';
import { stopKindOk } from '../../simulation/routing.js';
import { unloadMode, stopMode, hasTimetable, orderFlagText } from '../../simulation/orders.js';
import { refitCargos } from '../../simulation/refit.js';
import { cargoName } from '../../simulation/orders.js';
import { timetableComplete, roundTicks } from '../../simulation/ttSchedule.js';
import { TICKS_PER_DAY } from '../../simulation/constants.js';
import { sharers } from '../../simulation/sharedOrders.js';
import { orderCargoWarning } from '../../simulation/orderCargo.js';

const LOAD_OPTIONS = [['normal', 'Normal load'], ['full', 'Full load'], ['fullAny', 'Full load any'], ['none', 'No loading']];
const UNLOAD_OPTIONS = [['normal', 'Normal unload'], ['all', 'Unload all'], ['transfer', 'Transfer'], ['none', 'No unloading']];
const STOP_OPTIONS = [['non', 'Non-stop'], ['all', 'Stop at all stations'], ['via', 'Go via']];

/** Order row text, OpenTTD style: "Go non-stop to X" / "Go to X" (stop all) / "Go via X". */
export function orderVerb(o) {
  const m = stopMode(o);
  return m === 'via' ? 'Go via' : m === 'all' ? 'Go to' : 'Go non-stop to';
}

/** Whether a station has a facility this vehicle can stop at (buses also use bus stops, trams too). */
function usableBy(v, st) {
  const k = st.kinds || {};
  return ['rail', 'bus', 'truck', 'airport', 'ship'].some((x) => k[x] && stopKindOk(v, x));
}

/** Whether a depot can take this vehicle (kind match; a plane only at an airport it fits). */
function depotKindOk(v, d) {
  const kind = v.kind === 'train' ? 'rail' : v.kind === 'aircraft' ? 'air' : v.kind === 'ship' ? 'ship' : 'road';
  return d.kind === kind;
}

/** Stop modes apply to trains and road vehicles only (OpenTTD; ships and aircraft are always non-stop here). */
function canStopAtIntermediate(v) {
  return v.kind === 'train' || v.kind === 'road';
}

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
      const pickSel = el('select.input', { 'aria-label': 'Station to add', title: 'Pick a station this vehicle can use', style: { flex: '1', minWidth: '0' } });
      const pickBtn = el('button.btn', { type: 'button', text: 'Add', title: 'Append the selected station or depot to the orders', onclick: () => {
        const val = pickSel.value;
        if (!val) return;
        if (val.startsWith('d:')) appendDepotOrder(app, id, Number(val.slice(2)));
        else appendOrder(app, id, Number(val));
      } });
      const pickRow = el('div.btn-row', null, el('span.muted.small', { text: 'Add order:' }), pickSel, pickBtn);
      let pickSig = '';
      const fillPicker = (v) => {
        const sts = app.game.state.stations.filter((st) => st.ownerId == null && usableBy(v, st));
        const deps = depotsFor(v);
        const sig = sts.map((st) => st.id + ':' + st.name).join('|') + '#' + deps.map((d) => d.id).join(',');
        if (sig === pickSig) return;
        pickSig = sig;
        pickSel.replaceChildren(el('option', { value: '', text: sts.length || deps.length ? 'Choose a station or depot…' : 'No station this vehicle can use' }),
          ...sts.map((st) => el('option', { value: String(st.id), text: st.name })),
          ...deps.map((d) => el('option', { value: 'd:' + d.id, text: `Go to depot at ${d.x},${d.y}` })));
        pickBtn.disabled = !sts.length && !deps.length;
      };
      // OpenTTD timetable start: days from now (0 = now); blank clears. Spread evenly over the shared group.
      const startIn = el('input.input', { type: 'number', min: '0', max: '3650', step: '1', title: 'Timetable start date: days from now (blank = no start date)', placeholder: 'days', 'aria-label': 'Timetable start in days', style: 'width:5em',
        onchange: (e) => {
          const raw = String(e.target.value).trim();
          const n = Number(raw);
          if (raw === '') app.exec(app.game.setTimetableStart(id, null), { quiet: true, sound: 'click' });
          else if (!Number.isFinite(n) || n < 0) app.toast('Start date must be 0 or more days from now', 'error', true);
          else app.exec(app.game.setTimetableStart(id, app.game.state.tick + Math.round(n) * TICKS_PER_DAY), { quiet: true, sound: 'click' });
        } });
      const startLabel = el('span.muted.small', { text: '' });
      const spreadBtn = el('button.btn.sm', { type: 'button', text: 'Spread evenly', title: 'Set the start dates of all vehicles sharing these orders so they are evenly spaced over the timetable round (needs a complete timetable)',
        onclick: () => app.exec(app.game.spreadTimetableStart(id), { quiet: true, sound: 'click' }) });
      const totalLabel = el('div.muted.small.tt-total', { text: '' });
      const lateLine = el('div.small.tt-late', { text: '' });
      const ttRow = el('div.btn-row', null, el('span.small', { text: 'Start date: ' }), startIn, el('span.small', { text: ' days from now ' }), startLabel, spreadBtn);
      body.append(list, el('div.btn-row', null, addBtn, startBtn), pickRow, el('div.btn-row', null, sharedLabel, unshareBtn), el('div.btn-row', null, autofillBtn, resetBtn), ttRow, totalLabel, lateLine, needs2, hint);

      /** Stop mode select (OpenTTD non-stop / stop at all / go via); only trains and road vehicles. */
      const stopSel = (it) => el('select.input', { title: 'Stop', 'aria-label': 'Stop', onchange: (e) => app.exec(app.game.setOrderStop(id, it.i, e.target.value), { quiet: true, sound: 'click' }) },
        ...STOP_OPTIONS.map(([val, label]) => el('option', { value: val, text: label })));
      /** Depots this vehicle can be sent to (same kind, company's own; aircraft use the airport checks). */
      const depotsFor = (v) => app.game.state.depots.filter((d) => d.ownerId == null && depotKindOk(v, d));
      const refitSel = el('select.input', { title: 'Refit to', 'aria-label': 'Refit to', onchange: (e) => edit((os) => {
        const i = Number(e.target.dataset.i);
        if (e.target.value) os[i].refit = e.target.value; else delete os[i].refit;
      }) });
      const svcChk = el('input', { type: 'checkbox', title: 'Service only if needed: skip this depot when the vehicle is not due for service', 'aria-label': 'Service only if needed' });
      const depotRowCtl = el('span.depot-ctl', null,
        el('label.small', { text: ' service only if needed ' }, svcChk),
        el('label.small', { text: ' refit ' }, refitSel));
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
        fillPicker(v);
        addBtn.classList.toggle('active', adding);
        setText(addBtn, adding ? 'Click a station… (Esc)' : '+ Add order');
        if (adding) setText(hint, 'Click a station on the map or in the Stations list (or use the picker above). Esc cancels.');
        else setText(hint, 'Add stations in the order the vehicle should visit them. "Full load" waits until full.');
        startBtn.hidden = !(v.state === 'depot' || v.state === 'stopped');
        const n = sharers(app.game.state, v).length;
        sharedLabel.hidden = !n;
        unshareBtn.hidden = !n;
        setText(sharedLabel, n ? `Shared with ${n} other vehicle${n === 1 ? '' : 's'}` : '');
        setText(autofillBtn, v.autofill ? 'Autofill: on (recording)' : 'Autofill timetable');
        autofillBtn.classList.toggle('active', !!v.autofill);
        resetBtn.hidden = v.lateDays == null;
        const st = app.game.state;
        const tc = timetableComplete(v);
        const roundDays = Math.round(roundTicks(v.orders) / TICKS_PER_DAY);
        setText(totalLabel, roundDays > 0 ? `Total time: ${roundDays} day${roundDays === 1 ? '' : 's'}${tc ? '' : ' (incomplete: every order needs a travel time)'}` : '');
        setText(startLabel, v.ttStart != null ? (v.ttStart > st.tick ? `starts in ${Math.ceil((v.ttStart - st.tick) / TICKS_PER_DAY)} days` : 'started') : 'no start date');
        if (document.activeElement !== startIn) startIn.value = v.ttStart != null && v.ttStart > st.tick ? String(Math.ceil((v.ttStart - st.tick) / TICKS_PER_DAY)) : '';
        spreadBtn.disabled = !tc;
        spreadBtn.title = tc ? spreadBtn.title : 'Needs a complete timetable: every order needs a travel time';
        const late = v.lateDays;
        setText(lateLine, !v.orders.some(hasTimetable) ? '' : late == null ? 'This vehicle is on time' : late > 0 ? `This vehicle is running ${late} day${late === 1 ? '' : 's'} late` : `This vehicle is running ${-late} day${late === -1 ? '' : 's'} early`);
        const items = v.orders.map((o, i) => ({ o, i, key: i + ':' + o.stationId }));
        listOrEmpty(list, items, (it) => it.key,
          (it) => el('div.order-row', null,
            el('span.order-idx.mono'), el('span.name'),
            el('span.order-flags', null,
              depotRowCtl,
              el('select.input', { title: 'Load', onchange: (e) => edit((os) => { os[it.i].load = e.target.value; os[it.i].full = e.target.value === 'full'; }) },
                ...LOAD_OPTIONS.map(([val, label]) => el('option', { value: val, text: label }))),
              el('select.input', { title: 'Unload', onchange: (e) => edit((os) => { os[it.i].unload = e.target.value; }) },
                ...UNLOAD_OPTIONS.map(([val, label]) => el('option', { value: val, text: label }))),
              stopSel(it),
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
            const isDepot = it.o.depotId != null;
            const dep = isDepot ? app.game.state.depots.find((d) => d.id === it.o.depotId) : null;
            const depotName = dep ? (dep.name || `Depot at ${dep.x},${dep.y}`) : `depot #${it.o.depotId} (removed)`;
            const depotText = `Go to ${depotName}${orderFlagText(it.o)}`;
            setText(row.children[1], isDepot ? depotText
              : `${orderVerb(it.o)} ${st ? st.name : `Station #${it.o.stationId} (removed)`}`);
            const ctl = row.querySelector(':scope > .order-flags > .depot-ctl');
            if (ctl) {
              ctl.hidden = !isDepot;
              const svc = ctl.querySelector('input'), rsel = ctl.querySelector('select');
              if (isDepot) {
                svc.checked = !!it.o.serviceOnly;
                svc.onchange = (e) => edit((os) => { if (e.target.checked) os[it.i].serviceOnly = true; else delete os[it.i].serviceOnly; });
                const opts = refitCargos(v) || [];
                const sig = opts.join(',');
                if (rsel.dataset.sig !== sig) {
                  rsel.dataset.sig = sig;
                  rsel.replaceChildren(el('option', { value: '', text: 'No refit' }), ...opts.map((c) => el('option', { value: c, text: cargoName(c) })));
                }
                rsel.dataset.i = String(it.i);
                rsel.value = it.o.refit || '';
              }
            }

            const stopEl = row.querySelector('select[title="Stop"]');
            if (stopEl && stopEl.value !== stopMode(it.o)) stopEl.value = stopMode(it.o);
            if (stopEl) stopEl.hidden = isDepot || !canStopAtIntermediate(v);
            for (const x of Array.from(row.querySelectorAll(':scope > .order-flags > select[title="Load"], :scope > .order-flags > select[title="Unload"], :scope > .order-flags > label'))) {
              x.hidden = isDepot;
            }
            // P7: warn when this stop neither accepts nor supplies any cargo the vehicle carries
            // no warning on depot orders, nor on go-via (waypoint) orders: the vehicle passes through without loading
            const warn = st && !isDepot && stopMode(it.o) !== 'via' ? orderCargoWarning(app.game.state, v, st) : '';
            let w = row.querySelector(':scope > .order-warn');
            if (!w) { w = el('span.order-warn', { title: 'This stop cannot take the cargo this vehicle carries' }); row.children[1].after(w); }
            setText(w, warn ? '⚠ ' + warn : '');
            w.hidden = !warn;
            row.classList.toggle('current', it.i === v.orderIndex);
            if (!isDepot) {
              const [loadSel, unloadSel] = /** @type {HTMLSelectElement[]} */ (Array.from(row.querySelectorAll(':scope > .order-flags > select[title="Load"], :scope > .order-flags > select[title="Unload"]')));
              if (loadSel.value !== loadModeOf(it.o)) loadSel.value = loadModeOf(it.o);
              if (unloadSel.value !== unloadMode(it.o)) unloadSel.value = unloadMode(it.o);
              const [waitIn, travelIn] = /** @type {HTMLInputElement[]} */ (Array.from(row.querySelectorAll(':scope > .order-flags > label > input')));
              if (document.activeElement !== waitIn) waitIn.value = it.o.waitDays ? String(it.o.waitDays) : '';
              if (document.activeElement !== travelIn) travelIn.value = it.o.travelDays ? String(it.o.travelDays) : '';
            }
          }, 'No orders — click "Add order", then a station on the map');
      };
    },
  });
}
