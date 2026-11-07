/**
 * Vehicle detail window: state, speed, load, reliability, age, profit + action buttons.
 */
import { el, setText, bar, setBar } from '../dom.js';
import { money, num, speed } from '../format.js';
import { condText } from '../../simulation/condOrders.js';
import { cargoName, cargoColor } from '../cargo.js';
import { kvGrid } from './common.js';
import { cargoSlices, currentOrder } from '../../simulation/orders.js';
import { platformWarning } from '../../simulation/platformLength.js';
import { findStation } from '../../simulation/state.js';
import { openRename } from '../rename.js';
import { STATE_LABEL } from './vehicleList.js';
import { orderFlagText, hasTimetable, isDepotOrder } from '../../simulation/orders.js';

/** True when the vehicle has any timetable value or autofill running. */
function hasTimetableOrders(v) {
  return !!v.autofill || (v.orders || []).some(hasTimetable);
}
import { dateFromDayNumber, formatDate } from '../../simulation/date.js';
import { refitCargos } from '../../simulation/cmdVehicle.js';
import { groupList } from '../../simulation/cmdGroup.js';
import { vehicleSpecs, consistRows } from '../../simulation/vehicleSpec.js';
import { monthlyRunningCost } from '../../simulation/loco/vehicle.js';
import { vehicleModel } from '../../simulation/vehicles.js';

/**
 * Age text; core stores `age` in days.
 * @param {number} age
 * @returns {string}
 */
function ageText(age) {
  const days = age || 0;
  return days >= 365 ? `${(days / 365).toFixed(1)} years` : `${Math.floor(days)} days`;
}

/**
 * @param {import('../app.js').App} app
 * @param {number} id vehicle id
 */
export function openVehicleDetail(app, id) {
  const g = () => app.game;
  return app.wm.open('vehicle:' + id, {
    title: 'Vehicle',
    width: 330,
    onClose: () => { if (app.renderer.overlay.selectedVehicleId === id && app.followId !== id) app.renderer.overlay.selectedVehicleId = null; },
    build(body, win) {
      app.renderer.overlay.selectedVehicleId = id;
      const set = kvGrid(body, ['State', 'Speed', 'Cargo', 'Load', 'Reliability', 'Age', 'Profit this year', 'Profit last year', 'Transfer credits', 'Value', 'Next order', 'Platform', 'Altitude', 'Service interval', 'Last service', 'Timetable']);
      const loadBar = bar(0);
      body.appendChild(loadBar);
      // OpenTTD VehicleDetailsWindow extra lines: only fields TT stores or derives from its models (vehicleSpec.js)
      const specSet = kvGrid(body, ['Running cost (monthly)', 'Max. age', 'Weight', 'Power', 'Breakdowns (total)']);
      const consistBox = el('div.consist-list');
      body.appendChild(consistBox);
      let consistSig = '';
      const startStop = el('button.btn', { type: 'button' });
      startStop.addEventListener('click', () => {
        const v = app.findVehicle(id);
        if (!v) return;
        if (v.state === 'stopped' || v.state === 'depot') {
          if (app.exec(g().startVehicle(id), { sound: 'horn' })) app.toast(`${v.name} started`, 'good');
        } else if (app.exec(g().stopVehicle(id), { sound: 'click' })) app.toast(`${v.name} stopped`, 'info');
      });
      const svcLabel = el('span.muted.small', { text: 'Service' });
      const setSvc = (days) => {
        const v = app.findVehicle(id);
        if (v) app.exec(g().setServiceInterval(id, Math.max(0, days)), { quiet: true, sound: 'click' });
      };
      const svcBtns = el('span.row-actions', null,
        el('button.btn.sm', { type: 'button', text: '−7', title: 'Shorter interval: service more often', onclick: () => { const v = app.findVehicle(id); if (v) setSvc((v.serviceIntervalDays || 0) - 7); } }),
        el('button.btn.sm', { type: 'button', text: '+7', title: 'Longer interval: service less often (from off: every 7 days)', onclick: () => { const v = app.findVehicle(id); if (v) setSvc((v.serviceIntervalDays || 0) + 7); } }),
        el('button.btn.sm', { type: 'button', text: 'Off', title: 'No scheduled servicing', onclick: () => setSvc(0) }));
      const followBtn = el('button.btn', { type: 'button', text: 'Follow', onclick: () => app.follow(app.followId === id ? null : id) });
      const reverseBtn = el('button.btn', { type: 'button', text: 'Reverse', title: 'Turn the train around and re-plan to its current order (trains only)', onclick: () => {
        const v = app.findVehicle(id);
        if (v && v.kind === 'train') app.exec(g().reverseVehicle(id), { sound: 'click' });
        else if (v && v.kind === 'road') app.exec(g().turnRoadVehicle(id), { sound: 'click' });
      } });
      // gap #25: a rival's vehicle is read-only (owner line, no action buttons)
      if (app.findVehicle(id) && app.findVehicle(id).ownerId != null) {
        const rv = app.findVehicle(id);
        const rival = (app.game.state.rivals || []).find((r) => r.id === rv.ownerId);
        body.appendChild(el('div.muted', { text: `Owned by ${rival ? rival.name : 'a rival company'}. Orders and sales are not available.` }));
        return;
      }
      body.appendChild(el('div.btn-row', null,
        startStop,
        el('button.btn', { type: 'button', text: 'Orders', onclick: () => app.open('orders', id) }),
        el('button.btn', { type: 'button', text: 'Rename…', onclick: () => openRename(app, 'vehicle', id) }),
        el('button.btn', { type: 'button', text: 'Autoreplace…', title: 'Model replacement rules (applied when stopped in a depot)', onclick: () => app.open('autoreplace') }),
        reverseBtn,
        el('button.btn', { type: 'button', text: 'Send to depot', onclick: () => app.exec(g().sendToDepot(id), { sound: 'click' }) }),
        el('button.btn', { type: 'button', text: 'Center', onclick: () => { const v = app.findVehicle(id); if (v) app.centerOn(v.tx, v.ty); } }),
        followBtn,
        el('button.btn.danger', { type: 'button', text: 'Sell', title: 'Vehicle must be stopped in a depot', onclick: () => {
          if (app.exec(g().sellVehicle(id), { sound: 'click' })) win.close();
        } })));
      body.appendChild(el('div.btn-row', null,
        el('button.btn', { type: 'button', text: 'Clone', title: 'Buy a copy of this vehicle in its depot (copies orders)', onclick: () => app.exec(g().cloneVehicle(id, { shareOrders: false }), { sound: 'horn' }) }),
        el('button.btn', { type: 'button', text: 'Clone (share orders)', title: "Buy a copy that shares this vehicle's order list", onclick: () => app.exec(g().cloneVehicle(id, { shareOrders: true }), { sound: 'horn' }) })));
      body.appendChild(el('div.btn-row', null, svcLabel, svcBtns));
      // vehicle group selector (OpenTTD group window): ungrouped or one of the company's groups
      const groupSel = /** @type {HTMLSelectElement} */ (el('select.input', { 'aria-label': 'Vehicle group', title: 'Vehicle group' }));
      let groupSig = '';
      groupSel.onchange = () => {
        const val = groupSel.value === 'none' ? null : Number(groupSel.value);
        app.exec(g().addVehicleToGroup(id, val), { quiet: true, sound: 'click' });
      };
      body.appendChild(el('div.row-actions', null, el('span.muted.small', { text: 'Group' }), groupSel));
      // Refit (OpenTTD refit): only for a vehicle stopped in its depot; options = cargos its model supports
      const refitRow = el('div.refit-row');
      const refitSel = /** @type {HTMLSelectElement} */ (el('select.input.refit-sel', { title: 'Cargo to carry after refit (vehicle must be in a depot and empty)' }));
      const refitBtn = el('button.btn.sm', { type: 'button', text: 'Refit' });
      const refitNote = el('span.muted.small');
      const v0 = app.findVehicle(id);
      const cargos = v0 ? refitCargos(v0) || [] : [];
      for (const c of cargos) refitSel.appendChild(el('option', { value: c, text: cargoName(c) }));
      refitSel.disabled = cargos.length < 2;
      refitBtn.addEventListener('click', () => {
        const cargo = refitSel.value;
        if (cargo) app.exec(g().refitVehicle(id, cargo), { sound: 'click' });
      });
      refitRow.append(el('span.muted.small', { text: 'Refit' }), refitSel, refitBtn, refitNote);
      body.appendChild(refitRow);
      return () => {
        const v = app.findVehicle(id);
        if (!v) { win.close(); return; }
        win.setTitle(v.name);
        set['State'](STATE_LABEL[v.state] || v.state);
        set['Speed'](`${speed(v.speed, v.kind)} / ${speed(v.maxSpeed, v.kind)}`);
        const co = currentOrder(v);
        const platWarn = platformWarning(g().state, v, co ? findStation(g().state, co.stationId) : null);
        set['Platform'](platWarn || '');
        set['Altitude'](v.kind !== 'aircraft' ? '—' : (v.alt || 0) > 0.01 ? (v.alt >= 0.99 ? `${Math.round(v.alt * 100)}% · cruising` : `${Math.round(v.alt * 100)}% · climbing / descending`) : 'on the ground');
        set['Cargo'](`${v.consist ? cargoSlices(v).map((c) => cargoName(c.cargoId)).join(' + ') : cargoName(v.cargoId)}${v.kind === 'train' ? ` · ${v.wagons} wagon(s)` : ''}`);
        const amt = v.load ? v.load.amount || 0 : 0;
        set['Load'](`${num(amt)} / ${num(v.capacity)}`);
        if (v.consist) { // mixed consist: one line per cargo carried (with its share of the capacity)
          const lines = cargoSlices(v).map((c) => `${cargoName(c.cargoId)} ${num((v.loads && v.loads[c.cargoId] && v.loads[c.cargoId].amount) || 0)} / ${num(c.capacity)}`);
          set['Load'](`${num(amt)} / ${num(v.capacity)} · ${lines.join(' · ')}`);
        }
        setBar(loadBar, v.capacity ? amt / v.capacity : 0, cargoColor(v.cargoId));
        set['Reliability'](Math.round((v.reliability || 0) * (v.reliability <= 1 ? 100 : 1)) + '%');
        const model = vehicleModel(v);
        const specs = vehicleSpecs(v, model);
        specSet['Running cost (monthly)'](money(monthlyRunningCost(v, g().state)));
        specSet['Max. age'](v.maxAge ? `${Math.round(v.maxAge / 365)} years` : '—');
        specSet['Weight'](`${num(specs.weightLoaded)} t loaded · ${num(specs.weightEmpty)} t empty`);
        specSet['Power'](specs.power ? `${num(specs.power)} hp` : '—');
        specSet['Breakdowns (total)'](String(v.breakdowns || 0));
        if (v.kind === 'train') {
          const rows = consistRows(v);
          const sig = rows.map((r) => r.name + ':' + (r.cargoId || '') + ':' + r.capacity).join('|');
          if (sig !== consistSig) {
            consistSig = sig;
            consistBox.replaceChildren(el('div.muted.small', { text: 'Consist' }), ...rows.map((r, i) => el('div.small.mono', {
              text: i === 0 ? `${r.name} (engine)` : `${i}. ${r.name} · ${r.cargoId ? cargoName(r.cargoId) : 'empty'} · ${num(r.capacity)} cap`,
            })));
          }
          consistBox.hidden = false;
        } else { consistBox.hidden = true; consistSig = ''; }
        set['Age'](ageText(v.age));
        set['Profit this year'](money(v.profitThisYear));
        set['Profit last year'](money(v.profitLastYear));
        if (v.transferCredits) set['Transfer credits'](`${money(v.transferCredits)} (virtual, not cash)`);
        set['Value'](money(v.value));
        const groups = groupList(app.game.state);
        const sig = groups.map((x) => x.id + ':' + x.name).join('|');
        if (sig !== groupSig) {
          groupSig = sig;
          groupSel.replaceChildren(el('option', { value: 'none', text: 'Ungrouped' }),
            ...groups.map((x) => el('option', { value: String(x.id), text: x.name })));
        }
        groupSel.value = v.groupId != null && groups.some((x) => x.id === v.groupId) ? String(v.groupId) : 'none';
        const o = v.orders && v.orders.length ? v.orders[v.orderIndex % v.orders.length] : null;
        const depotOrd = isDepotOrder(o);
        const st = o && !depotOrd && o.cond == null ? app.findStation(o.stationId) : null;
        const nextDep = depotOrd && o.depotId != null ? app.game.state.depots.find((d) => d.id === o.depotId) : null;
        set['Next order'](o && o.cond != null ? condText(o.cond) : st ? `${st.name}${orderFlagText(o)}` : depotOrd ? (o.depot === 'nearest' ? `Nearest depot${orderFlagText(o)}` : `Depot at ${nextDep ? `${nextDep.x},${nextDep.y}` : '(removed)'}${orderFlagText(o)}`) : 'No orders');
        win.setTitle(v.name || 'Vehicle');
        reverseBtn.hidden = v.kind !== 'train' && v.kind !== 'road';
        setText(reverseBtn, v.kind === 'road' ? 'Turn around' : 'Reverse');
        reverseBtn.title = v.kind === 'road' ? 'Turn around and re-plan to the current order (road vehicles; refused on one-way roads, in stops or depots)' : 'Turn the train around and re-plan to its current order (trains only)';
        setText(startStop, v.state === 'stopped' || v.state === 'depot' ? 'Start' : 'Stop');
        followBtn.classList.toggle('active', app.followId === id);
        set['Timetable'](!hasTimetableOrders(v) ? 'No timetable'
          : v.lateDays == null ? 'On time' : v.lateDays > 0 ? `${v.lateDays} day${v.lateDays === 1 ? '' : 's'} late` : `${-v.lateDays} day${v.lateDays === -1 ? '' : 's'} early`);
        set['Service interval'](v.serviceIntervalDays ? `every ${v.serviceIntervalDays} days` : 'Off');
        set['Last service'](v.serviceIntervalDays && v.lastServiceDay != null
          ? formatDate(dateFromDayNumber(v.lastServiceDay)) + (v.serviceDue || v.serviceTrip ? ' · due' : '') : '—');
        setText(svcLabel, v.serviceIntervalDays ? 'Service interval' : 'Service: off');
        const inDepot = v.state === 'depot';
        const loaded = (v.load ? v.load.amount || 0 : 0) > 0;
        // follow the vehicle's cargo only when it changes; keep a pending choice the user made meanwhile
        if (refitSel.dataset.cargo !== v.cargoId) { refitSel.dataset.cargo = v.cargoId; refitSel.value = v.cargoId; }
        refitBtn.disabled = !inDepot || loaded || refitSel.disabled || refitSel.value === v.cargoId;
        setText(refitNote, !cargos.length ? '' : !inDepot ? 'Depot only' : loaded ? 'Unload first' : '');
      };
    },
  });
}
