/**
 * Station list window (OpenTTD CompanyStationsWindow / OpenLoco StationList): every station with
 * facilities, waiting cargo and best rating. Sort by name / waiting / rating (click a header or the
 * dropdown; click the active sort again to flip direction), filter by facility, click a row to open
 * the station window and centre the view.
 */
import { el, setText } from '../dom.js';
import { num } from '../format.js';
import { listOrEmpty, packetTotal } from './common.js';
import { matchesName, filterStations } from './listSort.js';
import { nameSearch } from './sortControls.js';
import { appendOrder } from '../tools/addOrder.js';
import { isWaypointRecord } from '../../simulation/cmdRename.js';

/** Sort keys offered in the dropdown / header buttons. */
export const STATION_SORTS = [
  { key: 'name', label: 'Name' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'rating', label: 'Max rating' },
];

/** Facility filters: [value, label]. 'all' shows every station. */
export const STATION_FILTERS = [
  ['all', 'All'], ['rail', 'Rail'], ['bus', 'Bus'], ['truck', 'Truck'], ['airport', 'Airport'],
];

/** Facility letters in display order, [key, letter, title]. */
const FACILITIES = [['rail', 'R', 'Rail'], ['bus', 'B', 'Bus'], ['truck', 'T', 'Truck'], ['airport', 'A', 'Airport']];

/**
 * Derived per-station numbers used for sorting and display (pure).
 * @param {any} st
 */
export function stationStats(st) {
  const cargo = st.cargo || {};
  const ids = new Set([...Object.keys(cargo), ...Object.keys(st.rating || {})]);
  let waiting = 0;
  for (const c of Object.keys(cargo)) waiting += packetTotal(cargo[c]);
  let maxRating = -1;
  for (const c of Object.keys(st.rating || {})) {
    const r = st.rating[c];
    if (typeof r === 'number' && r > maxRating) maxRating = r;
  }
  return { waiting, maxRating: maxRating < 0 ? null : maxRating, cargoCount: ids.size };
}

/**
 * Whether a station has a facility (airport counts when kinds.airport or any tile is airport-typed).
 * @param {any} st
 * @param {string} facility rail|bus|truck|airport
 */
export function hasFacility(st, facility) {
  const k = st.kinds || {};
  if (facility === 'airport') return !!k.airport;
  return !!k[facility];
}

/**
 * Filter (facility + case-insensitive name query, OpenTTD station_gui.cpp QueryString) then sort stations.
 * Pure: does not mutate the input.
 * @param {any[]} stations
 * @param {{sort?:string, dir?:number, filter?:string, query?:string}} opts dir: 1 ascending, -1 descending
 * @returns {any[]}
 */
export function sortStations(stations, opts = {}) {
  const { sort = 'name', dir = 1, filter = 'all', query = '' } = opts;
  const facList = filter === 'all' ? stations : stations.filter((st) => hasFacility(st, filter));
  const list = filterStations(facList, query);
  const val = (st) => {
    if (sort === 'waiting') return stationStats(st).waiting;
    if (sort === 'rating') return stationStats(st).maxRating ?? -1;
    return String(st.name || '');
  };
  return list.sort((a, b) => {
    const va = val(a), vb = val(b);
    let c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    if (c === 0) c = a.id - b.id;
    return c * (dir < 0 ? -1 : 1);
  });
}

/** Human-readable rating-colour (same thresholds as the station window). */
function ratingColor(r) {
  return r < 35 ? '#ef4444' : r < 60 ? '#f59e0b' : '#22c55e';
}

/**
 * @param {import('../app.js').App} app
 */
export function openStationList(app) {
  /** Window-instance state (not saved). */
  const state = { sort: 'name', dir: 1, filter: 'all', query: '' };
  return app.wm.open('stations', {
    title: 'Stations',
    width: 380,
    build(body) {
      const summary = el('div.muted');
      const controls = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '4px' } });
      const sortSel = el('select.input', { style: { width: 'auto' }, 'aria-label': 'Sort stations', title: 'Sort' },
        STATION_SORTS.map((s) => el('option', { value: s.key, text: s.label })));
      const filterSel = el('select.input', { style: { width: 'auto' }, 'aria-label': 'Filter by facility', title: 'Facility filter' },
        STATION_FILTERS.map(([v, l]) => el('option', { value: v, text: l })));
      const dirBtn = el('button.btn.sm', { type: 'button', title: 'Toggle ascending / descending' });
      sortSel.value = state.sort;
      filterSel.value = state.filter;
      sortSel.onchange = () => { state.sort = sortSel.value; state.dir = 1; refresh(); };
      filterSel.onchange = () => { state.filter = filterSel.value; refresh(); };
      dirBtn.onclick = () => { state.dir = -state.dir; refresh(); };
      const depotsBtn = el('button.btn.sm', { type: 'button', text: 'Depots', title: 'Open the depot list', onclick: () => app.open('depots') });
      controls.append(el('span.muted', { text: 'Sort' }), sortSel, dirBtn, el('span.muted', { text: 'Show' }), filterSel, depotsBtn);
      const head = el('div.table-head', { style: { gridTemplateColumns: '1.6fr 0.8fr 1fr 0.7fr' } },
        ...STATION_SORTS.map((s) => el('button.link', {
          type: 'button', text: s.label, title: `Sort by ${s.label.toLowerCase()}`,
          style: { textAlign: 'left', padding: '0' },
          onclick: () => { if (state.sort === s.key) state.dir = -state.dir; else { state.sort = s.key; state.dir = 1; } refresh(); },
        })),
        el('span', { text: 'Facilities' }));
      const list = el('div.list.scroll.table');
      const search = nameSearch(state, 'Search stations by name', () => refresh());
      body.append(summary, controls, search, head, list);

      const refresh = () => {
        sortSel.value = state.sort;
        filterSel.value = state.filter;
        setText(dirBtn, state.dir < 0 ? '▼' : '▲');
        const all = app.game.state.stations.filter((st) => st.ownerId == null && !isWaypointRecord(st)); // player stations only (gap #25), exclude waypoints
        const stations = sortStations(all, state);
        let waiting = 0;
        for (const st of all) waiting += stationStats(st).waiting;
        setText(summary, `${stations.length} of ${all.length} station(s) · waiting cargo ${num(waiting)}`);
        listOrEmpty(list, stations, (st) => st.id,
          (st) => el('button.table-row.list-row', { type: 'button', title: 'Click: station window + centre view (in add-order mode: add this station to the vehicle\'s orders)',
            style: { display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 1fr 0.7fr', textAlign: 'left' },
            onclick: () => {
              const tool = app.tool;
              if (tool && tool.id === 'addOrder' && typeof tool.vehicleId === 'number') {
                appendOrder(app, tool.vehicleId, st.id); // add-order mode: the row is the order; keep this window open
                return;
              }
              app.open('station', st.id); app.centerOn(st.x, st.y);
            } },
          el('span.name'), el('span.mono.num'), el('span.mono.num'), el('span.fac')),
          (row, st) => {
            const c = row.children;
            setText(c[0], st.name);
            const facs = FACILITIES.filter(([k]) => hasFacility(st, k));
            const s = stationStats(st);
            setText(c[1], num(s.waiting));
            if (s.maxRating === null) setText(c[2], '—');
            else { setText(c[2], Math.round(s.maxRating) + '%'); c[2].style.color = ratingColor(s.maxRating); }
            setText(c[3], facs.map((f) => f[1]).join(' ') || '—');
            c[3].title = facs.map((f) => f[2]).join(', ') || 'None';
          }, 'No stations yet — build a station to see it here');
      };
      refresh();
      return refresh;
    },
  });
}
