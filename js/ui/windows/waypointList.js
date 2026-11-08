/**
 * Waypoint list window (OpenTTD waypoint list): every player waypoint (rail and road) with
 * type and location. Sort by name / type, filter by name, click a row to centre the view and
 * open the waypoint window; Rename… uses the shared rename dialog.
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';
import { sortControls, nameSearch } from './sortControls.js';
import { makeSortMemo, filterByName, matchesName } from './listSort.js';
import { isWaypointRecord, waypointDisplayName } from '../../simulation/cmdRename.js';
import { openRename } from '../rename.js';

/** Sort keys for the waypoint list (sortControls tuple format). */
export const WAYPOINT_SORTS = [['name', 'Name'], ['type', 'Type'], ['id', 'Id']];

/** True for road waypoints (every tile kind waypoint with road:true). */
export function isRoadWaypoint(st) {
  return !!st && st.tiles && st.tiles.length > 0 && st.tiles.every((p) => p.kind === 'waypoint' && p.road === true);
}

/** Human type label for a waypoint record. */
export function waypointTypeLabel(st) {
  return isRoadWaypoint(st) ? 'Road' : 'Rail';
}

/**
 * Build derived waypoint rows (pure). Player waypoints only (ownerId == null).
 * @param {any} state
 * @returns {{id:number,name:string,type:string,x:number,y:number,st:any}[]}
 */
export function waypointRows(state) {
  const stations = state.stations || [];
  return stations
    .filter((st) => st.ownerId == null && isWaypointRecord(st))
    .map((st) => ({
      id: st.id,
      name: waypointDisplayName(st),
      type: waypointTypeLabel(st),
      x: st.x,
      y: st.y,
      st,
    }))
    .sort((a, b) => a.id - b.id);
}

/**
 * Sort waypoint rows (pure, does not mutate input).
 * @param {any[]} rows
 * @param {{sort?:string, dir?:number, query?:string}} opts
 * @returns {any[]}
 */
export function sortWaypoints(rows, opts = {}) {
  const { sort = 'name', dir = 1, query = '' } = opts;
  const list = rows.filter((r) => matchesName(r.name, query));
  const val = (r) => {
    if (sort === 'type') return r.type || '';
    if (sort === 'id') return r.id || 0;
    return String(r.name || '');
  };
  return list.sort((a, b) => {
    const va = val(a), vb = val(b);
    let c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    if (c === 0) c = a.id - b.id;
    return c * (dir < 0 ? -1 : 1);
  });
}

/**
 * @param {import('../app.js').App} app
 */
export function openWaypointList(app) {
  const state = { sort: 'name', dir: 1, query: '' };
  return app.wm.open('waypoints', {
    title: 'Waypoints',
    width: 340,
    build(body) {
      const summary = el('div.muted');
      const cols = '1.6fr 0.6fr auto auto';
      const head = el('div.table-head', { style: { gridTemplateColumns: cols } },
        el('span', { text: 'Name' }), el('span', { text: 'Type' }),
        el('span', { text: '' }), el('span', { text: '' }));
      const list = el('div.list.scroll.table');
      const memo = makeSortMemo((xs) => sortWaypoints(xs, state), (r) => [r.name || '', r.type || '']);
      const controls = sortControls(WAYPOINT_SORTS, state, () => app.wm.updateAll());
      const search = nameSearch(state, 'Search waypoints by name', () => app.wm.updateAll());
      body.append(controls.bar, search, summary, head, list);
      const refresh = () => {
        const rows = filterByName(memo(waypointRows(app.game.state), `${state.sort}:${state.dir}`), state.query, (r) => r.name || '');
        setText(summary, `${rows.length} waypoint(s)`);
        listOrEmpty(list, rows, (r) => r.id,
          (r) => el('div.table-row.list-row', { role: 'button', tabindex: '0', title: 'Click: centre view on waypoint',
            style: { display: 'grid', gridTemplateColumns: cols, textAlign: 'left', cursor: 'pointer' },
            onclick: () => { app.centerOn(r.x, r.y); } },
          el('span.name'), el('span.muted'), 
          el('button.btn.sm', { type: 'button', text: 'Open', title: 'Open waypoint window',
            onclick: (e) => { e.stopPropagation(); app.open('waypoint', r.id); } }),
          el('button.btn.sm', { type: 'button', text: 'Rename', title: 'Rename waypoint',
            onclick: (e) => { e.stopPropagation(); openRename(app, 'waypoint', r.id, () => app.wm.updateAll()); } })),
          (row, r) => {
            const c = row.children;
            setText(c[0], `${r.name} · (${r.x}, ${r.y})`);
            setText(c[1], r.type);
          }, 'No waypoints yet — build a rail or road waypoint to see it here');
      };
      refresh();
      return refresh;
    },
  });
}
