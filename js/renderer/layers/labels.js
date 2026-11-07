/**
 * Town and station name signs (screen space, constant pixel size). Drawn after the world and the
 * floating texts; the hit list is rebuilt each frame so a click can open the matching window.
 * Object pool: no per-frame allocation beyond the reused hit records.
 */
import { loadLabelPrefs, townSignText, signRect, rectInView, stationSignsVisible, stationSignStyle, TOWN_POP_MIN_ZOOM } from '../labels.js';


const FONT = '600 12px "JetBrains Mono", ui-monospace, monospace';
const PAD_X = 6, H = 18, RADIUS = 4;
/** @type {Map<string, number>} measured text widths (bounded) */
const widthCache = new Map();

function textWidth(ctx, text) {
  let w = widthCache.get(text);
  if (w === undefined) {
    w = ctx.measureText(text).width;
    if (widthCache.size > 2000) widthCache.clear();
    widthCache.set(text, w);
  }
  return w;
}

/**
 * Draw all visible signs and rebuild renderer.labelHits (screen rects, last drawn on top).
 * @param {CanvasRenderingContext2D} ctx context with the CSS-px transform set
 * @param {any} renderer
 * @param {{x:number,y:number,zoom:number,viewW:number,viewH:number,worldToScreen:Function}} cam
 */
export function drawLabels(ctx, renderer, cam) {
  const hits = renderer.labelHits || (renderer.labelHits = []);
  hits.length = 0;
  const prefs = loadLabelPrefs();
  const state = renderer.game.state;
  const zoom = cam.zoom;
  const showStations = prefs.stations && stationSignsVisible(zoom) && !renderer.showMetro;
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const place = (kind, id, wx, wy, text, fill, textCol, border) => {
    const p = cam.worldToScreen(wx, wy);
    const w = textWidth(ctx, text) + PAD_X * 2;
    const r = signRect(p.x, p.y, w, H);
    if (!rectInView(r, cam.viewW, cam.viewH, 8)) return;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, RADIUS);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = border;
    ctx.stroke();
    ctx.fillStyle = textCol;
    ctx.fillText(text, r.x + PAD_X, r.y + H / 2 + 0.5);
    hits.push({ kind, id, x: r.x, y: r.y, w: r.w, h: r.h });
  };
  if (prefs.towns) {
    const popOn = zoom >= TOWN_POP_MIN_ZOOM;
    for (const t of state.towns) {
      const c = renderer.tileCenterScreen(t.x, t.y);
      place('town', t.id, c.x, c.y, townSignText(t.name, t.population, zoom), 'rgba(10,15,26,0.88)', '#f8fafc', popOn ? '#94a3b8' : '#64748b');
    }
  }
  if (showStations) {
    for (const st of state.stations) {
      const c = renderer.tileCenterScreen(st.x, st.y);
      const sty = stationSignStyle(state, st);
      place('station', st.id, c.x, c.y, st.name, sty.fill, '#ffffff', sty.rival ? '#fde68a' : 'rgba(255,255,255,0.7)');
    }
  }
  // map signs (OpenTTD signs): player text labels, always shown; lazy state.signs (absent = none)
  const signs = state.signs;
  if (signs && signs.length) {
    for (const sg of signs) {
      const c = renderer.tileCenterScreen(sg.x, sg.y);
      place('sign', sg.id, c.x, c.y, sg.text, '#fef3c7', '#1c1917', '#b45309');
    }
  }
  ctx.textAlign = 'left';
}

/**
 * Topmost sign under a viewport point (CSS px), or null. Later hits are drawn on top, so scan backwards.
 * @returns {{kind:'town'|'station'|'sign', id:number}|null}
 */
export function labelAt(hits, px, py) {
  if (!hits) return null;
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return { kind: h.kind, id: h.id };
  }
  return null;
}
