/**
 * Metro overlay (renderer.showMetro, key J): a schematic metro map drawn over the city. Tunnel
 * rail tiles become thick line-colour strokes between tile centres, stations are white dots with a
 * coloured ring and name labels when zoomed in, and trains are glowing capsules.
 * Per-tile line lists are precomputed once per game (cache keyed on the map object).
 */
import { HALF_W, HALF_H, HEIGHT_STEP } from '../iso.js';

/** Bit per direction (N,E,S,W) as in the simulation. */
const DIRS = [
  { bit: 1, dx: 0, dy: -1 }, { bit: 2, dx: 1, dy: 0 }, { bit: 4, dx: 0, dy: 1 }, { bit: 8, dx: -1, dy: 0 },
];

/** Per-game cache: { map, edges: [{a,b,color}], stations: [...] }. */
let cache = null;

/** Parse a '#RRGGBB' colour (fallback grey). */
function hex(c) {
  return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#9ca3af';
}

/**
 * Build tunnel edges (tile pairs with a colour) and metro station list once per map.
 * @param {any} state
 */
function build(state) {
  const map = state.map;
  const W = map.width;
  const lines = (state.metro && state.metro.lines) || [];
  const edges = [];
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (!t.tunnel || !t.rail) continue;
    const col = lines[t.metroColor] ? hex(lines[t.metroColor].color) : '#9ca3af';
    for (const d of DIRS) {
      if (!(t.rail & d.bit)) continue;
      const x = i % W + d.dx, y = Math.floor(i / W) + d.dy;
      if (x < 0 || y < 0 || x >= W || y >= map.height) continue;
      const j = y * W + x;
      if (j < i) continue; // each edge once
      const u = map.tiles[j];
      if (!u.tunnel) continue;
      edges.push({ a: i, b: j, color: col });
    }
  }
  const stations = [];
  for (const st of state.stations || []) {
    const color = st.tiles && st.tiles.length ? st.tiles.map((p) => map.tiles[p.y * W + p.x].building).find((b) => b && b.metro) : null;
    if (!color) continue;
    stations.push({ id: st.id, name: st.name, x: st.x, y: st.y, color: hex(color.color) });
  }
  return { map, edges, stations, lines };
}

/**
 * Metro data for the current game (built lazily, rebuilt when the map object changes).
 * @param {any} state
 */
export function metroData(state) {
  if (!state.metro || !state.map) return null;
  if (!cache || cache.map !== state.map) cache = build(state);
  return cache;
}

/**
 * Draw the metro overlay for the visible tile range.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} renderer renderer (game, heights, camera)
 * @param {{x0:number,y0:number,x1:number,y1:number}} range visible tiles
 */
export function drawMetroOverlay(ctx, renderer, range) {
  const data = metroData(renderer.game.state);
  if (!data) return;
  const { map, edges } = data;
  const W = map.width;
  const cam = renderer.camera;
  const zoom = cam.zoom;
  const pt = (i) => {
    const x = i % W, y = Math.floor(i / W);
    if (x < range.x0 - 1 || x > range.x1 + 1 || y < range.y0 - 1 || y > range.y1 + 1) return null;
    const h = renderer.heights.surfaceH(x + 0.5, y + 0.5);
    return { x: (x + 0.5 - (y + 0.5)) * HALF_W, y: (x + 0.5 + y + 0.5) * HALF_H - h * HEIGHT_STEP };
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = Math.max(2, 5 / zoom);
  let cur = null;
  for (const e of edges) {
    const p = pt(e.a), q = pt(e.b);
    if (!p || !q) continue;
    if (cur !== e.color) { ctx.strokeStyle = e.color; cur = e.color; }
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // stations
  const showLabels = zoom >= 0.9;
  ctx.font = `600 ${Math.round(11 / zoom)}px "JetBrains Mono", ui-monospace, monospace`;
  for (const s of data.stations) {
    const i = s.y * W + s.x;
    const p = pt(i);
    if (!p) continue;
    const r = Math.max(3.5, 7 / zoom);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 2.5 / zoom);
    ctx.strokeStyle = s.color;
    ctx.stroke();
    if (showLabels && s.name) {
      ctx.fillStyle = 'rgba(10,15,26,0.85)';
      ctx.fillText(s.name, p.x + r + 3 / zoom, p.y + 3 / zoom);
    }
  }
  // trains
  for (const v of renderer.game.state.vehicles) {
    if (!v.metroLine || v.state === 'depot') continue;
    const lineCol = v.livery || '#ffffff';
    const p = pt(Math.round(v.ty) * W + Math.round(v.tx));
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2 / zoom, Math.max(3, 6 / zoom), 0, Math.PI * 2);
    ctx.fillStyle = hex(lineCol);
    ctx.shadowColor = hex(lineCol);
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}
