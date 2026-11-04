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

/**
 * Overlays drawn under objects (catchment, selection).
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} map
 * @param {OverlayState} o
 */
export function drawUnderlays(ctx, map, o) {
  if (o.catchment) for (const t of o.catchment) tileDiamond(ctx, map, t.x, t.y, OVERLAY.catchment, null, 1);
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
   * Advance and draw in world space (context already transformed).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} dt seconds
   * @param {number} zoom current zoom (to keep text size constant on screen)
   */
  draw(ctx, dt, zoom) {
    if (!this.items.length) return;
    ctx.font = `700 ${Math.round(13 / zoom)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let w = 0;
    for (const it of this.items) {
      it.age += dt;
      if (it.age >= 2.2) continue;
      const a = it.age < 1.6 ? 1 : 1 - (it.age - 1.6) / 0.6;
      const y = it.wy - 30 - it.age * 22;
      ctx.globalAlpha = a;
      ctx.lineWidth = 3 / zoom;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(it.text, it.wx, y);
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, it.wx, y);
      this.items[w++] = it;
    }
    this.items.length = w;
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}
