/**
 * Distant-join picker (OpenTTD station picker): Ctrl+click when placing a station on a spot with
 * no station of ours adjacent opens a small list of our stations within the spread limit plus
 * "New station". The choice is passed to the build command as opts.joinStationId.
 */
import { el } from '../dom.js';
import { spreadOk } from '../../simulation/stations.js';
import { getSetting } from '../../simulation/settings.js';

/** True when one of the footprint tiles is 4-adjacent to a station tile of ours. */
export function adjacentOwn(state, tiles) {
  const m = state.map;
  for (const p of tiles) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy;
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue;
      const b = m.tiles[y * m.width + x].building;
      if (b && b.type === 'station') {
        const st = state.stations.find((q) => q.id === b.stationId);
        if (!st || st.ownerId == null) return true; // rival stations (ownerId) are not ours
      }
    }
  }
  return false;
}

/** Our stations (any facility, as in OpenTTD) that the footprint could join (within spread). */
export function joinChoices(state, kind, tiles) {
  const limit = getSetting(state, 'stationSpread');
  if (getSetting(state, 'distantJoinStations') === false) return []; // OpenTTD distant_join off: no picker
  return state.stations.filter((st) => st.ownerId == null && spreadOk(st, tiles, limit))
    .map((st) => ({ id: st.id, name: st.name }));
}

/**
 * Small floating list at screen point (x,y). `onPick(id|null)` runs once; null = New station.
 * Escape or a click outside dismisses it without building.
 */
export function openJoinPicker(app, { x, y, choices, onPick }) {
  document.querySelectorAll('.join-picker').forEach((n) => n.remove());
  let done = false;
  let armTimer = 0;
  // Always removes every listener it may have attached (the pointerdown one is armed a tick later).
  const close = () => {
    if (done) return;
    done = true;
    clearTimeout(armTimer);
    root.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
  };
  const pick = (id) => { if (done) return; close(); onPick(id); };
  // Escape cancels only the picker: stopPropagation keeps input.js from also cancelling the station tool or closing a window.
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const onOutside = (e) => { if (!root.contains(e.target)) close(); };
  const btn = (label, id) => el('button.btn', { type: 'button', text: label, onclick: () => pick(id) });
  const root = el('div.join-picker', { role: 'menu', 'aria-label': 'Join station' },
    el('div.muted', { text: 'Join station' }),
    ...choices.map((c) => btn(c.name, c.id)),
    btn('New station', null));
  root.style.position = 'fixed';
  root.style.left = `${Math.round(x || 0)}px`;
  root.style.top = `${Math.round(y || 0)}px`;
  root.style.zIndex = '1000';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = '4px';
  root.style.padding = '6px';
  root.style.background = 'var(--panel, #1f2937)';
  root.style.border = '1px solid #4b5563';
  document.body.appendChild(root);
  document.addEventListener('keydown', onKey, true);
  armTimer = setTimeout(() => { if (!done) document.addEventListener('pointerdown', onOutside, true); }, 0);
  return { close };
}
