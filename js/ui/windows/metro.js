/**
 * Metro window: one row per metro line (colour, names, stations, trains, waiting passengers,
 * passengers last month). Clicking a row centres the camera on the line's first station and
 * turns the metro overlay on; the checkbox toggles the overlay alone; clicking a station name
 * opens the station window.
 */
import { el, setText } from '../dom.js';
import { num } from '../format.js';
import { listOrEmpty } from './common.js';
import { waitingAmount } from '../../simulation/stations.js';

/** Stations of a metro line that still exist, in line order. */
function lineStations(app, line) {
  const out = [];
  for (const id of line.stationIds || []) {
    const st = app.game.state.stations.find((s) => s.id === id);
    if (st) out.push(st);
  }
  return out;
}

/** Waiting passengers across a set of stations. */
function waitingPass(stations) {
  let n = 0;
  for (const st of stations) n += waitingAmount(st, 'PASS');
  return n;
}

/**
 * @param {import('../app.js').App} app
 */
export function openMetro(app) {
  return app.wm.open('metro', {
    title: 'Metro',
    width: 340,
    build(body) {
      const cb = el('input', { type: 'checkbox' });
      const label = el('label.muted', null, cb, ' Show metro map (J)');
      const list = el('div.list.scroll');
      body.append(label, list);
      cb.addEventListener('change', () => { if (app.renderer) app.renderer.showMetro = cb.checked; });
      return () => {
        const state = app.game.state;
        const lines = (state.metro && state.metro.lines) || [];
        cb.checked = !!(app.renderer && app.renderer.showMetro);
        listOrEmpty(list, lines, (l) => l.ref,
          (l) => el('div.list-row', { title: 'Click: centre on first station and show metro map' },
            el('span.swatch', { style: { display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', marginRight: '6px' } }),
            el('span.name'), el('span.mono.num', { title: 'Stations · trains' }),
            el('span.muted', { title: 'Passengers waiting' }),
            ),
          (row, l) => {
            const stations = lineStations(app, l);
            const trains = (l.vehicleIds || []).filter((id) => state.vehicles.some((v) => v.id === id)).length;
            row.firstChild.style.background = l.color;
            const name = row.children[1];
            setText(name, `${l.ref} ${l.nameEn || l.name}`);
            setText(row.children[2], `${stations.length} st · ${trains} tr`);
            setText(row.children[3], `${num(waitingPass(stations))} waiting`);
            row.onclick = () => {
              if (app.renderer) app.renderer.showMetro = true;
              cb.checked = true;
              const first = stations[0];
              if (first) app.centerOn(first.x, first.y);
            };
          });
      };
    },
  });
}
