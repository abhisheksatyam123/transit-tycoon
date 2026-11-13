/**
 * Camera: pan / zoom / clamp in world-screen space and visible tile range.
 */
import { HALF_W, HALF_H, TILE_H, HEIGHT_STEP, tileToScreen, screenToTileFloat } from './iso.js';

const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

export class Camera {
  constructor() {
    /** world-screen x/y at the viewport centre */
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.viewW = 800;
    this.viewH = 600;
    this.mapW = 64;
    this.mapH = 64;
  }

  /**
   * Set map dimensions for clamping.
   * @param {number} w
   * @param {number} h
   */
  setMap(w, h) {
    this.mapW = w;
    this.mapH = h;
    this.clamp();
  }

  /**
   * Set viewport size in CSS pixels.
   * @param {number} w
   * @param {number} h
   */
  setViewport(w, h) {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  /** Keep the camera centre within the map's projected bounds. */
  clamp() {
    const minX = -this.mapH * HALF_W;
    const maxX = this.mapW * HALF_W;
    const minY = -TILE_H * 2;
    const maxY = (this.mapW + this.mapH) * HALF_H;
    this.x = Math.max(minX, Math.min(maxX, this.x));
    this.y = Math.max(minY, Math.min(maxY, this.y));
  }

  /**
   * Pan by screen pixels.
   * @param {number} dx
   * @param {number} dy
   */
  pan(dx, dy) {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.clamp();
  }

  /**
   * Zoom around a viewport point (CSS pixels).
   * @param {number} factor multiplicative
   * @param {number} [px] viewport x (defaults centre)
   * @param {number} [py]
   */
  zoomAt(factor, px = this.viewW / 2, py = this.viewH / 2) {
    const before = this.screenToWorld(px, py);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(px, py);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  /**
   * Centre the view on a tile.
   * @param {number} tx
   * @param {number} ty
   * @param {number} [h]
   */
  /**
   * Tile coordinate under the viewport centre (flat projection, clamped to map bounds).
   * @returns {{x:number, y:number}}
   */
  centerTile() {
    const f = screenToTileFloat(this.x, this.y);
    return {
      x: Math.max(0, Math.min(this.mapW - 1, Math.round(f.x))),
      y: Math.max(0, Math.min(this.mapH - 1, Math.round(f.y))),
    };
  }

  centerOn(tx, ty, h = 0) {
    const p = tileToScreen(tx, ty, h);
    this.x = p.x;
    this.y = p.y;
    this.clamp();
  }

  /**
   * Viewport (CSS px) -> world-screen.
   * @param {number} px
   * @param {number} py
   * @returns {{x:number,y:number}}
   */
  screenToWorld(px, py) {
    return { x: (px - this.viewW / 2) / this.zoom + this.x, y: (py - this.viewH / 2) / this.zoom + this.y };
  }

  /**
   * World-screen -> viewport (CSS px).
   * @param {number} wx
   * @param {number} wy
   * @returns {{x:number,y:number}}
   */
  worldToScreen(wx, wy) {
    return { x: (wx - this.x) * this.zoom + this.viewW / 2, y: (wy - this.y) * this.zoom + this.viewH / 2 };
  }

  /**
   * World-screen rectangle currently visible (with margin in world px).
   * @param {number} [margin]
   * @returns {{x0:number,y0:number,x1:number,y1:number}}
   */
  worldRect(margin = 0) {
    const hw = this.viewW / 2 / this.zoom + margin;
    const hh = this.viewH / 2 / this.zoom + margin;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }

  /**
   * Bounding tile range covering the viewport (clamped to the map).
   * Extra rows below account for raised terrain and tall sprites.
   * @returns {{x0:number,y0:number,x1:number,y1:number}}
   */
  visibleTileRange() {
    const r = this.worldRect(TILE_H * 2);
    const yBottom = r.y1 + 7 * HEIGHT_STEP;
    const yTop = r.y0 - 0;
    const pts = [
      screenToTileFloat(r.x0, yTop), screenToTileFloat(r.x1, yTop),
      screenToTileFloat(r.x0, yBottom), screenToTileFloat(r.x1, yBottom),
    ];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    return {
      x0: Math.max(0, Math.floor(x0) - 1), y0: Math.max(0, Math.floor(y0) - 1),
      x1: Math.min(this.mapW - 1, Math.ceil(x1) + 1), y1: Math.min(this.mapH - 1, Math.ceil(y1) + 1),
    };
  }
}
