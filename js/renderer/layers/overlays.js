/**
 * Overlay drawing: tile highlights (hover, selection, catchment, drag preview), cost labels,
 * floating income texts. The overlay *state* is owned by the UI and passed in each frame.
 */
import { HALF_W, HALF_H, HEIGHT_STEP } from '../iso.js';

/** @type {any} Heights instance used to lay overlay diamonds on the slopes (set by the renderer). */
let overlayHeights = null;

/**
 * Bind the continuous height source used by tileDiamond.
 * @param {any} heights Heights instance (or null for flat diamonds)
 */
export function setOverlayHeights(heights) {
  overlayHeights = heights;
}
import { OVERLAY } from '../palette.js';

/**
 * @typedef {Object} OverlayState
 * @property {{x:number,y:number}|null} hover
 * @property {{tiles:{x:number,y:number}[], ok:boolean, label?:string}|null} preview
 * @property {{x:number,y:number}[]|null} catchment
 * @property {{x:number,y:number}[]|null} selection
 * @property {number|null} selectedVehicleId
 */

/**
 * Create an empty overlay state.
 * @returns {OverlayState}
 */
export function createOverlayState() {
  return { hover: null, preview: null, catchment: null, selection: null, selectedVehicleId: null, trafficCars: true, trafficHeat: false };
}

/**
 * Fill + stroke a diamond at a tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} map
 * @param {number} x
 * @param {number} y
 * @param {string} fill
 * @param {string} [stroke]
 * @param {number} [inset]
 */
export function tileDiamond(ctx, map, x, y, fill, stroke, inset = 0) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
  const sx = (x - y) * HALF_W, fy = (x + y) * HALF_H;
  const c = overlayHeights ? overlayHeights.tileCorners(x, y) : [0, 0, 0, 0].map(() => map.tiles[y * map.width + x].height);
  const hw = HALF_W - inset * 2, hh = HALF_H - inset;
  ctx.beginPath();
  ctx.moveTo(sx, fy - hh - c[0] * HEIGHT_STEP);
  ctx.lineTo(sx + hw, fy - c[1] * HEIGHT_STEP);
  ctx.lineTo(sx, fy + hh - c[2] * HEIGHT_STEP);
  ctx.lineTo(sx - hw, fy - c[3] * HEIGHT_STEP);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
}

/** Cached membership grid for the catchment list (rebuilt only when the array identity changes). */
let catchGrid = null, catchSrc = null, catchW = 0, catchH = 0;

function catchmentGrid(map, list) {
  if (catchSrc === list && catchW === map.width && catchH === map.height && catchGrid) return catchGrid;
  catchSrc = list; catchW = map.width; catchH = map.height;
  catchGrid = new Uint8Array(map.width * map.height);
  for (const t of list) if (t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height) catchGrid[t.y * map.width + t.x] = 1;
  return catchGrid;
}

/**
 * Catchment area: translucent fill on every tile, plus a dark-backed light outline on the
 * outer border only (edges between in-catchment and out-of-catchment tiles).
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} map
 * @param {{x:number,y:number}[]} list
 */
function drawCatchment(ctx, map, list) {
  for (const t of list) tileDiamond(ctx, map, t.x, t.y, OVERLAY.catchment, null, 1);
  const g = catchmentGrid(map, list), W = map.width, H = map.height;
  const edge = (x, y, nx, ny) => nx < 0 || ny < 0 || nx >= W || ny >= H || !g[ny * W + nx];
  const hh = HALF_H, hw = HALF_W;
  // Each pass strokes all boundary edges once (dark halo first, light line on top).
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (const t of list) {
      const x = t.x, y = t.y;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const sx = (x - y) * hw, fy = (x + y) * hh;
      const c = overlayHeights ? overlayHeights.tileCorners(x, y) : [0, 0, 0, 0].map(() => map.tiles[y * W + x].height);
      const X0 = sx, Y0 = fy - hh - c[0] * HEIGHT_STEP; // top
      const X1 = sx + hw, Y1 = fy - c[1] * HEIGHT_STEP; // right
      const X2 = sx, Y2 = fy + hh - c[2] * HEIGHT_STEP; // bottom
      const X3 = sx - hw, Y3 = fy - c[3] * HEIGHT_STEP; // left
      // neighbour +x shares right-bottom edge; +y shares bottom-left; -x left-top; -y top-right
      if (edge(x, y, x + 1, y)) { ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); }
      if (edge(x, y, x, y + 1)) { ctx.moveTo(X2, Y2); ctx.lineTo(X3, Y3); }
      if (edge(x, y, x - 1, y)) { ctx.moveTo(X3, Y3); ctx.lineTo(X0, Y0); }
      if (edge(x, y, x, y - 1)) { ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); }
    }
    if (pass === 0) { ctx.strokeStyle = OVERLAY.catchmentEdgeDark; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; }
    else { ctx.strokeStyle = OVERLAY.catchmentEdge; ctx.lineWidth = 1.6; }
    ctx.stroke();
  }
}

/**
 * Overlays drawn under objects (catchment, selection).
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} map
 * @param {OverlayState} o
 */
export function drawUnderlays(ctx, map, o) {
  if (o.catchment) drawCatchment(ctx, map, o.catchment);
  if (o.selection) for (const t of o.selection) tileDiamond(ctx, map, t.x, t.y, OVERLAY.select, OVERLAY.selectStroke, 1);
}

/**
 * Overlays drawn above objects (hover, drag preview).
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} map
 * @param {OverlayState} o
 */
export function drawOverlays(ctx, map, o) {
  if (o.preview) {
    const fill = o.preview.ok ? OVERLAY.valid : OVERLAY.invalid;
    const stroke = o.preview.ok ? OVERLAY.validStroke : OVERLAY.invalidStroke;
    for (const t of o.preview.tiles) tileDiamond(ctx, map, t.x, t.y, fill, stroke, 1);
  }
  if (o.hover) tileDiamond(ctx, map, o.hover.x, o.hover.y, OVERLAY.hover, OVERLAY.hoverStroke, 0.5);
}

/**
 * Screen-space label (e.g. estimated cost) near a point.
 * @param {CanvasRenderingContext2D} ctx screen-space context (CSS px transform)
 * @param {number} x
 * @param {number} y
 * @param {string} text
 * @param {boolean} ok
 */
export function drawLabel(ctx, x, y, text, ok) {
  ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = 'rgba(10,15,26,0.9)';
  ctx.strokeStyle = ok ? '#22c55e' : '#ef4444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 14, y - 26, w, 20, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ok ? '#bbf7d0' : '#fecaca';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 20, y - 16);
}

/**
 * Floating text items (income popups) in world-screen coordinates.
 */
export class FloatingTexts {
  constructor() {
    /** @type {{wx:number,wy:number,text:string,color:string,age:number}[]} */
    this.items = [];
  }
  /**
   * @param {number} wx
   * @param {number} wy
   * @param {string} text
   * @param {string} color
   */
  add(wx, wy, text, color) {
    if (this.items.length > 40) this.items.shift();
    this.items.push({ wx, wy, text, color, age: 0 });
  }
  /**
   * Advance and draw in screen space (CSS px context, call after all world geometry so texts are never occluded).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt seconds
   * @param {{x:number,y:number,zoom:number,viewW:number,viewH:number}} cam camera (same fields as Camera)
   * @param {boolean} [hidden] transparency 'text' class on: age the popups but draw nothing (OpenTTD TransparencyOption::Text)
   */
  draw(ctx, dt, cam, hidden = false) {
    if (!this.items.length) return;
    ctx.font = '700 13px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    const zoom = cam.zoom;
    let w = 0;
    for (const it of this.items) {
      it.age += dt;
      if (it.age >= 2.2) continue;
      const a = it.age < 1.6 ? 1 : 1 - (it.age - 1.6) / 0.6;
      const wy = it.wy - 30 - it.age * 22;
      const sx = (it.wx - cam.x) * zoom + cam.viewW / 2;
      const sy = (wy - cam.y) * zoom + cam.viewH / 2;
      this.items[w++] = it;
      if (hidden) continue;
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(it.text, sx, sy);
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, sx, sy);
    }
    this.items.length = w;
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}
