/**
 * Orders editor: list, toggle full load, delete, move up/down, and "Add order" map mode.
 * All edits go through game.setOrders(id, orders).
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';
import { createAddOrderTool } from '../tools/addOrder.js';

/**
 * @param {import('../app.js').App} app
 * @param {number} id vehicle id
 */
export function openOrders(app, id) {
  return app.wm.open('orders:' + id, {
    title: 'Orders',
    width: 340,
    onClose: () => { if (app.tool && app.tool.id === 'addOrder') app.setTool(null); },
    build(body, win) {
      const list = el('div.list.orders');
      const addBtn = el('button.btn.primary', { type: 'button', text: '+ Add order' });
      const startBtn = el('button.btn', { type: 'button', text: 'Start vehicle', onclick: () => app.exec(app.game.startVehicle(id), { sound: 'horn' }) });
      const hint = el('div.muted.small', { text: 'Add stations in the order the vehicle should visit them. "Full load" waits until full.' });
      body.append(list, el('div.btn-row', null, addBtn, startBtn), hint);

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
        const adding = !!app.tool && app.tool.id === 'addOrder';
        addBtn.classList.toggle('active', adding);
        setText(addBtn, adding ? 'Click a station… (Esc)' : '+ Add order');
        startBtn.hidden = !(v.state === 'depot' || v.state === 'stopped');
        const items = v.orders.map((o, i) => ({ o, i, key: i + ':' + o.stationId }));
        listOrEmpty(list, items, (it) => it.key,
          (it) => el('div.order-row', null,
            el('span.order-idx.mono'), el('span.name'),
            el('label.chk', null, el('input', { type: 'checkbox', onchange: (e) => edit((os) => { os[it.i].full = e.target.checked; }) }), el('span', { text: 'Full load' })),
            el('span.row-actions', null,
              el('button.btn.sm', { type: 'button', text: '▲', title: 'Move up', onclick: () => edit((os) => { if (it.i > 0) os.splice(it.i - 1, 0, os.splice(it.i, 1)[0]); }) }),
              el('button.btn.sm', { type: 'button', text: '▼', title: 'Move down', onclick: () => edit((os) => { if (it.i < os.length - 1) os.splice(it.i + 1, 0, os.splice(it.i, 1)[0]); }) }),
              el('button.btn.sm.danger', { type: 'button', text: '✕', title: 'Delete', onclick: () => edit((os) => { os.splice(it.i, 1); }) }))),
          (row, it) => {
            const st = app.findStation(it.o.stationId);
            setText(row.children[0], String(it.i + 1));
            setText(row.children[1], st ? st.name : `Station #${it.o.stationId} (removed)`);
            row.classList.toggle('current', it.i === v.orderIndex);
            const cb = /** @type {HTMLInputElement} */ (row.children[2].firstChild);
            if (cb.checked !== !!it.o.full) cb.checked = !!it.o.full;
          }, 'No orders — click "Add order", then a station on the map');
      };
    },
  });
}
