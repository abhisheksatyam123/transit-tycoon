/**
 * Vehicle detail window: state, speed, load, reliability, age, profit + action buttons.
 */
import { el, setText, bar, setBar } from '../dom.js';
import { money, num, speed } from '../format.js';
import { cargoName, cargoColor } from '../cargo.js';
import { kvGrid } from './common.js';
import { STATE_LABEL } from './vehicleList.js';

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
      const set = kvGrid(body, ['State', 'Speed', 'Cargo', 'Load', 'Reliability', 'Age', 'Profit this year', 'Profit last year', 'Value', 'Next order', 'Altitude']);
      const loadBar = bar(0);
      body.appendChild(loadBar);
      const startStop = el('button.btn', { type: 'button' });
      startStop.addEventListener('click', () => {
        const v = app.findVehicle(id);
        if (!v) return;
        if (v.state === 'stopped' || v.state === 'depot') app.exec(g().startVehicle(id), { sound: 'horn' });
        else app.exec(g().stopVehicle(id), { sound: 'click' });
      });
      const followBtn = el('button.btn', { type: 'button', text: 'Follow', onclick: () => app.follow(app.followId === id ? null : id) });
      body.appendChild(el('div.btn-row', null,
        startStop,
        el('button.btn', { type: 'button', text: 'Orders', onclick: () => app.open('orders', id) }),
        el('button.btn', { type: 'button', text: 'Send to depot', onclick: () => app.exec(g().sendToDepot(id), { sound: 'click' }) }),
        el('button.btn', { type: 'button', text: 'Center', onclick: () => { const v = app.findVehicle(id); if (v) app.centerOn(v.tx, v.ty); } }),
        followBtn,
        el('button.btn.danger', { type: 'button', text: 'Sell', title: 'Vehicle must be stopped in a depot', onclick: () => {
          if (app.exec(g().sellVehicle(id), { sound: 'click' })) win.close();
        } })));
      return () => {
        const v = app.findVehicle(id);
        if (!v) { win.close(); return; }
        win.setTitle(v.name);
        set['State'](STATE_LABEL[v.state] || v.state);
        set['Speed'](`${speed(v.speed)} / ${speed(v.maxSpeed)}`);
        set['Altitude'](v.kind !== 'aircraft' ? '—' : (v.alt || 0) > 0.01 ? (v.alt >= 0.99 ? `${Math.round(v.alt * 100)}% · cruising` : `${Math.round(v.alt * 100)}% · climbing / descending`) : 'on the ground');
        set['Cargo'](`${cargoName(v.cargoId)}${v.kind === 'train' ? ` · ${v.wagons} wagon(s)` : ''}`);
        const amt = v.load ? v.load.amount || 0 : 0;
        set['Load'](`${num(amt)} / ${num(v.capacity)}`);
        setBar(loadBar, v.capacity ? amt / v.capacity : 0, cargoColor(v.cargoId));
        set['Reliability'](Math.round((v.reliability || 0) * (v.reliability <= 1 ? 100 : 1)) + '%');
        set['Age'](ageText(v.age));
        set['Profit this year'](money(v.profitThisYear));
        set['Profit last year'](money(v.profitLastYear));
        set['Value'](money(v.value));
        const o = v.orders && v.orders.length ? v.orders[v.orderIndex % v.orders.length] : null;
        const st = o ? app.findStation(o.stationId) : null;
        set['Next order'](st ? `${st.name}${o.full ? ' (full load)' : ''}` : 'No orders');
        setText(startStop, v.state === 'stopped' || v.state === 'depot' ? 'Start' : 'Stop');
        followBtn.classList.toggle('active', app.followId === id);
      };
    },
  });
}
