/**
 * Vehicle list window: every vehicle with state and profit this/last year.
 * Sort by name / number, profit this year, profit last year, age, reliability; filter by kind.
 * Sort and filter live on the window instance (not saved). OpenLoco VehicleList / OpenTTD vehicle_gui.
 */
import { el, setText } from '../dom.js';
import { money } from '../format.js';
import { listOrEmpty } from './common.js';
import { hasTimetable } from '../../simulation/orders.js';

/** Human label + css class for a vehicle state. */
export const STATE_LABEL = {
  depot: 'In depot', running: 'Running', loading: 'Loading', stopped: 'Stopped', broken: 'Broken down', lost: 'Lost',
};

/** Sort keys: [key, label]. */
export const VEHICLE_SORTS = [
  ['name', 'Name'], ['profitThisYear', 'Profit this year'], ['profitLastYear', 'Profit last year'],
  ['age', 'Age'], ['reliability', 'Reliability'], ['lateDays', 'Lateness'],
];

/** True when the vehicle runs to a timetable (any order with a wait or travel time). */
export function hasVehicleTimetable(v) {
  return Array.isArray(v.orders) && v.orders.some((o) => hasTimetable(o));
}

/**
 * Label of the late column: '' for vehicles without a timetable, else 'on time', '+N d' (late), '−N d' (early).
 * @param {any} v
 */
export function lateLabel(v) {
  if (!hasVehicleTimetable(v)) return '';
  const d = Number(v.lateDays) || 0;
  if (!d) return 'on time';
  return d > 0 ? `+${d} d` : `${d} d`;
}

/** Kind filters: [value, label]. */
export const VEHICLE_FILTERS = [['all', 'All'], ['train', 'Trains'], ['road', 'Road'], ['aircraft', 'Aircraft']];

/** Reliability as a 0..1 fraction (older saves store percent). */
function relFraction(v) {
  const r = Number(v.reliability) || 0;
  return r <= 1 ? r : r / 100;
}

/**
 * Filter then sort vehicles. Pure: does not mutate the input. Ties break on unit number then id.
 * @param {any[]} vehicles
 * @param {{sort?:string, dir?:number, filter?:string}} opts dir: 1 ascending, -1 descending
 * @returns {any[]}
 */
export function sortVehicles(vehicles, opts = {}) {
  const { sort = 'name', dir = 1, filter = 'all' } = opts;
  const list = vehicles.filter((v) => filter === 'all' || v.kind === filter);
  const val = (v) => {
    switch (sort) {
      case 'profitThisYear': return Number(v.profitThisYear) || 0;
      case 'profitLastYear': return Number(v.profitLastYear) || 0;
      case 'age': return Number(v.age) || 0;
      case 'reliability': return relFraction(v);
      case 'lateDays': return Number(v.lateDays) || 0;
      default: return null; // name: string compare
    }
  };
  return list.sort((a, b) => {
    let c;
    if (sort === 'name') c = String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
    else c = val(a) - val(b);
    if (c === 0) c = (a.unitNumber || 0) - (b.unitNumber || 0) || a.id - b.id;
    return c * (dir < 0 ? -1 : 1);
  });
}

/**
 * @param {import('../app.js').App} app
 */
export function openVehicleList(app) {
  /** Window-instance state. */
  const state = { sort: 'name', dir: 1, filter: 'all' };
  return app.wm.open('vehicles', {
    title: 'Vehicles',
    width: 440,
    build(body) {
      const summary = el('div.muted');
      const sortSel = el('select.input', { style: { width: 'auto' }, 'aria-label': 'Sort vehicles', title: 'Sort' },
        VEHICLE_SORTS.map(([k, l]) => el('option', { value: k, text: l })));
      const filterSel = el('select.input', { style: { width: 'auto' }, 'aria-label': 'Filter by kind', title: 'Kind filter' },
        VEHICLE_FILTERS.map(([v, l]) => el('option', { value: v, text: l })));
      const dirBtn = el('button.btn.sm', { type: 'button', title: 'Toggle ascending / descending' });
      sortSel.onchange = () => { state.sort = sortSel.value; state.dir = 1; refresh(); };
      filterSel.onchange = () => { state.filter = filterSel.value; refresh(); };
      dirBtn.onclick = () => { state.dir = -state.dir; refresh(); };
      // mass start/stop act on the vehicles the current kind filter shows (gap #40)
      const massBtn = (label, start) => el('button.btn.sm', { type: 'button', text: label, title: `${label} the vehicles shown by the filter`, onclick: () => {
        const ids = sortVehicles(app.game.state.vehicles, state).map((v) => v.id);
        app.exec(app.game.massStartStop(ids, start), { sound: start ? 'horn' : 'click' });
        refresh();
      } });
      const controls = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
        el('span.muted', { text: 'Sort' }), sortSel, dirBtn, el('span.muted', { text: 'Show' }), filterSel,
        massBtn('Start all', true), massBtn('Stop all', false),
        el('button.btn.sm', { type: 'button', text: 'Autoreplace…', title: 'Replace models with newer ones when stopped in a depot', onclick: () => app.open('autoreplace') }));
      const head = el('div.table-head', null, el('span', { text: 'Vehicle' }), el('span', { text: 'State' }), el('span', { text: 'This year' }), el('span', { text: 'Last year' }), el('span', { text: 'Late' }), el('span'));
      const list = el('div.list.scroll.table');
      body.append(summary, controls, head, list);
      const refresh = () => {
        sortSel.value = state.sort;
        filterSel.value = state.filter;
        setText(dirBtn, state.dir < 0 ? '▼' : '▲');
        const all = app.game.state.vehicles;
        let p = 0;
        for (const v of all) p += v.profitThisYear || 0;
        const vs = sortVehicles(all, state);
        setText(summary, `${vs.length} of ${all.length} vehicle(s) · profit this year ${money(p)}`);
        listOrEmpty(list, vs, (v) => v.id,
          (v) => el('div.table-row', null,
            el('button.link', { type: 'button', onclick: () => app.open('vehicle', v.id) }),
            el('span.state'), el('span.mono.num'), el('span.mono.num'), el('span.mono.num.late'),
            el('button.btn.sm', { type: 'button', text: 'Follow', title: 'Follow with camera', onclick: () => { app.follow(v.id); } })),
          (row, v) => {
            const c = row.children;
            setText(c[0], v.name);
            setText(c[1], STATE_LABEL[v.state] || v.state);
            c[1].className = 'state st-' + v.state;
            setText(c[2], money(v.profitThisYear));
            c[2].classList.toggle('neg', v.profitThisYear < 0);
            setText(c[3], money(v.profitLastYear));
            c[3].classList.toggle('neg', v.profitLastYear < 0);
            setText(c[4], lateLabel(v));
            c[4].classList.toggle('neg', hasVehicleTimetable(v) && (Number(v.lateDays) || 0) > 0);
          }, 'No vehicles yet — build a depot and buy one');
      };
      refresh();
      return refresh;
    },
  });
}
