/**
 * Station window: waiting cargo, ratings, acceptance, vehicles with this station in orders.
 * Opening it selects the station (catchment overlay on the map).
 */
import { el, setText, bar, setBar } from '../dom.js';
import { cargoChip, cargoName } from '../cargo.js';
import { num } from '../format.js';
import { heading, packetTotal, listOrEmpty } from './common.js';
import { openRename } from '../rename.js';

/**
 * Rating colour (red -> yellow -> green).
 * @param {number} r 0..100
 * @returns {string}
 */
function ratingColor(r) {
  return r < 35 ? '#ef4444' : r < 60 ? '#f59e0b' : '#22c55e';
}

/**
 * @param {import('../app.js').App} app
 * @param {number} id station id
 */
export function openStation(app, id) {
  app.selectStation(id);
  return app.wm.open('station:' + id, {
    title: 'Station',
    width: 330,
    onClose: () => { if (app.selectedStationId === id) app.selectStation(null); },
    build(body, win) {
      const kinds = el('div.muted');
      const cargoList = el('div.list');
      const accepts = el('div.chips');
      const vehList = el('div.list');
      body.append(kinds, heading('Waiting cargo & rating'), cargoList, heading('Accepts'), accepts, heading('Vehicles serving'), vehList,
        el('div.btn-row', null, el('button.btn', { type: 'button', text: 'Center view', onclick: () => {
          const st = app.findStation(id);
          if (st) app.centerOn(st.x, st.y);
        } }), el('button.btn', { type: 'button', text: 'Rename…', onclick: () => openRename(app, 'station', id) })));
      let accSig = '';
      return () => {
        const st = app.findStation(id);
        if (!st) { win.close(); return; }
        win.setTitle(st.name);
        const k = st.kinds || {};
        const airport = k.airport || (st.tiles || []).some((t) => { const tt = app.game.state.map.tiles[t.y * app.game.state.map.width + t.x]; return tt && tt.building && tt.building.kind === 'airport'; });
        setText(kinds, airport ? `Airport · ${st.tiles.length} tile(s)` : ['rail', 'bus', 'truck'].filter((x) => k[x]).map((x) => (x === 'rail' ? 'Rail' : x === 'bus' ? 'Bus' : 'Truck')).join(' · ') + ` station · ${st.tiles.length} tile(s)`);
        const ids = new Set([...Object.keys(st.cargo || {}), ...Object.keys(st.rating || {})]);
        const rows = Array.from(ids).map((c) => ({ c, n: packetTotal(st.cargo && st.cargo[c]), r: st.rating ? st.rating[c] : undefined }));
        listOrEmpty(cargoList, rows, (r) => r.c,
          (r) => el('div.cargo-row', null, cargoChip(r.c), el('span.mono.num'), bar(0), el('span.mono.pct')),
          (row, r) => {
            const [, n, b, p] = /** @type {any} */ (row.children);
            setText(n, num(r.n));
            const rating = typeof r.r === 'number' ? r.r : 0;
            setBar(b, rating / 100, ratingColor(rating));
            setText(p, typeof r.r === 'number' ? Math.round(rating) + '%' : '—');
          }, 'No cargo yet');
        const acc = Object.keys(st.accepts || {}).filter((c) => st.accepts[c]);
        const sig = acc.join(',');
        if (sig !== accSig) {
          accSig = sig;
          accepts.textContent = '';
          if (!acc.length) accepts.appendChild(el('span.empty', { text: 'Nothing' }));
          for (const c of acc) accepts.appendChild(cargoChip(c));
        }
        const vs = app.game.state.vehicles.filter((v) => v.orders && v.orders.some((o) => o.stationId === id));
        listOrEmpty(vehList, vs, (v) => v.id,
          (v) => el('button.list-row', { type: 'button', onclick: () => app.open('vehicle', v.id) }, el('span.name'), el('span.muted.state')),
          (row, v) => {
            setText(row.firstChild, v.name);
            setText(row.lastChild, `${v.state} · ${cargoName(v.cargoId)}`);
          });
      };
    },
  });
}
