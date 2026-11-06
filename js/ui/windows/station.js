/**
 * Station window: waiting cargo, ratings, acceptance, vehicles with this station in orders.
 * Opening it selects the station (catchment overlay on the map).
 */
import { el, setText, bar, setBar } from '../dom.js';
import { cargoChip, cargoName } from '../cargo.js';
import { num } from '../format.js';
import { heading, packetTotal, listOrEmpty } from './common.js';
import { openRename } from '../rename.js';
import { styleById } from '../../config/stationTypes.js';
import { catchRadius } from '../../simulation/stations.js';
import { viaBreakdown } from '../../simulation/cargodist.js';

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
      const catchLine = el('div.muted');
      const cargoList = el('div.list');
      const noSource = el('div.muted.small', { text: 'No cargo produced here yet — place the stop near an industry or houses', style: { fontStyle: 'italic' } });
      noSource.hidden = true;
      const accepts = el('div.chips');
      const vehList = el('div.list');
      // B1: airports with an air depot (hangar, or a heliport's helipad) get Open hangar / Buy aircraft
      const hangarRow = el('div.btn-row');
      hangarRow.hidden = true;
      let hangarDepot = null;
      const cdVia = el('div.list');
      body.append(kinds, catchLine, heading('Waiting cargo & rating'), cargoList, cdVia, noSource, heading('Accepts'), accepts, heading('Vehicles serving'), vehList,
        hangarRow,
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
        // radius = what the catchment code uses (airports per type, docks their own radius)
        const radius = (st.tiles || []).reduce((m, t) => Math.max(m, catchRadius(app.game.state, t)), 0);
        const railLike = (st.tiles || []).some((t) => ['rail', 'bus', 'truck'].includes(t.kind));
        if (railLike && !airport) {
          const sk = (st.tiles || []).find((t) => t.style);
          const kindKey = ['rail', 'bus', 'truck'].find((x) => k[x]) || 'rail';
          const styleName = sk ? styleById(sk.kind, sk.style).name : styleById(kindKey, null).name;
          setText(catchLine, `Style: ${styleName} · catchment radius ${radius}`);
        } else {
          setText(catchLine, `Catchment radius ${radius}`);
        }
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
        // cargodist (setting on): passengers / mail waiting here, grouped by the next hop they ride to
        cdVia.textContent = '';
        const cdOn = app.game.state.settings && app.game.state.settings.cargodist && app.game.state.settings.cargodist !== 'off';
        if (cdOn) {
          for (const c of ['PASS', 'MAIL']) {
            const rows = viaBreakdown(app.game.state, st, c);
            if (!rows.length) continue;
            cdVia.append(el('div.muted.small', { text: cargoName(c) + ' by next hop:' }));
            for (const r of rows) {
              const name = r.via == null ? 'any vehicle' : (app.findStation(r.via) ? app.findStation(r.via).name : 'station ' + r.via);
              cdVia.append(el('div.small.mono', { text: `  via ${name}: ${num(r.amount)}` }));
            }
          }
        }
        // muted hint: a bus/truck stop nobody supplies yet (no waiting cargo, no rating)
        noSource.hidden = !(rows.length === 0 && (k.bus || k.truck) && !k.rail && !airport);
        const acc = Object.keys(st.accepts || {}).filter((c) => st.accepts[c]);
        const sig = acc.join(',');
        if (sig !== accSig) {
          accSig = sig;
          accepts.textContent = '';
          if (!acc.length) accepts.appendChild(el('span.empty', { text: 'Nothing' }));
          for (const c of acc) accepts.appendChild(cargoChip(c));
        }
        // air depot on one of this station's tiles (hangar or helipad)
        const depotId = (st.tiles || []).reduce((found, t) => {
          if (found != null) return found;
          const tt = app.game.state.map.tiles[t.y * app.game.state.map.width + t.x];
          return tt && tt.building && tt.building.depotId != null && tt.building.kind !== 'rail' ? tt.building.depotId : null;
        }, null);
        const dep = depotId != null ? app.findDepot(depotId) : null;
        if (dep && dep.kind === 'air') {
          if (hangarDepot !== depotId) {
            hangarDepot = depotId;
            hangarRow.textContent = '';
            hangarRow.append(
              el('button.btn', { type: 'button', text: 'Open hangar', onclick: () => app.open('depot', depotId) }),
              el('button.btn.primary', { type: 'button', text: 'Buy aircraft…', onclick: () => app.open('buyVehicle', depotId) }));
          }
          hangarRow.hidden = false;
        } else {
          hangarDepot = null;
          hangarRow.hidden = true;
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
