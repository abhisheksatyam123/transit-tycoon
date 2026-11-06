/**
 * Distant-join picker (OpenTTD station picker): Ctrl+click when placing a station on a spot with
 * no station of ours adjacent opens a small list of our stations within the spread limit plus
 * "New station". The choice is passed to the build command as opts.joinStationId.
 */
import { el } from '../dom.js';
import { spreadOk } from '../../simulation/stations.js';

/** True when one of the footprint tiles is 4-adjacent to a station tile of ours. */
export function adjacentOwn(state, tiles) {
  const m = state.map;
  for (const p of tiles) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy;
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue;
      const b = m.tiles[y * m.width + x].building;
      if (b && b.type === 'station') return true;
    }
  }
  return false;
}

/** Our stations of `kind` that the footprint could join (within spread). */
export function joinChoices(state, kind, tiles) {
  return state.stations.filter((st) => st.kinds && st.kinds[kind] && spreadOk(st, tiles))
    .map((st) => ({ id: st.id, name: st.name }));
}

/**
 * Small floating list at screen point (x,y). `onPick(id|null)` runs once; null = New station.
 * Escape or a click outside dismisses it without building.
 */
export function openJoinPicker(app, { x, y, choices, onPick }) {
  document.querySelectorAll('.join-picker').forEach((n) => n.remove());
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    root.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
  };
  const pick = (id) => { if (done) return; close(); onPick(id); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
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
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
  return { close };
}
