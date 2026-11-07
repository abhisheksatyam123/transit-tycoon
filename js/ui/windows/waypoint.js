/**
 * Waypoint window (OpenTTD waypoint_gui.cpp): title = waypoint name, Center view, Rename…, and the
 * vehicles whose orders use this waypoint (click one to open it). Rail and road waypoints.
 */
import { el, setText } from '../dom.js';
import { listOrEmpty } from './common.js';
import { openRename } from '../rename.js';
import { waypointDisplayName, isWaypointRecord } from '../../simulation/cmdRename.js';

/** Open the waypoint window for station record `id` (a waypoint). */
export function openWaypoint(app, id) {
  return app.wm.open('waypoint:' + id, {
    title: 'Waypoint',
    width: 300,
    build(body, win) {
      const info = el('div.muted');
      const list = el('div.list.scroll');
      const rename = el('button.btn', { type: 'button', text: 'Rename…', onclick: () => openRename(app, 'waypoint', id) });
      const center = el('button.btn', { type: 'button', text: 'Center view', onclick: () => { const w = app.findStation(id); if (w) app.centerOn(w.x, w.y); } });
      body.append(info, list, el('div.btn-row', null, rename, center));
      return () => {
        const w = app.findStation(id);
        if (!w || !isWaypointRecord(w)) { win.close(); return; }
        const name = waypointDisplayName(w);
        win.setTitle(name);
        const road = !!w.tiles[0].road;
        setText(info, `${road ? 'Road waypoint' : 'Rail waypoint'} · (${w.x}, ${w.y})`);
        const vs = app.game.state.vehicles.filter((v) => v.orders && v.orders.some((o) => o.stationId === id));
        listOrEmpty(list, vs, (v) => v.id,
          (v) => el('button.list-row', { type: 'button', onclick: () => app.open('vehicle', v.id) }, el('span.name'), el('span.muted.state')),
          (row, v) => {
            setText(row.firstChild, v.name);
            setText(row.lastChild, `${v.state} · ${v.orders.filter((o) => o.stationId === id).length} order(s) via here`);
          });
      };
    },
  });
}
