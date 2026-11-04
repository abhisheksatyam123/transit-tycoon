/**
 * Isometric projection helpers (2:1 diamond tiles).
 * Integer tile coordinates (x,y) refer to the CENTRE of tile (x,y).
 * World-screen space: sx = (x - y) * TILE_W/2, sy = (x + y) * TILE_H/2 - height * HEIGHT_STEP.
 */

export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;
export const HEIGHT_STEP = 8;

/**
 * Project tile coordinates (float allowed) to world-screen pixels.
 * @param {number} x
 * @param {number} y
 * @param {number} [h] height level
 * @returns {{x:number,y:number}}
 */
export function tileToScreen(x, y, h = 0) {
  return { x: (x - y) * HALF_W, y: (x + y) * HALF_H - h * HEIGHT_STEP };
}

/**
 * Inverse projection at height 0 (float tile coordinates, tile centres are integers).
 * @param {number} sx
 * @param {number} sy
 * @returns {{x:number,y:number}}
 */
export function screenToTileFloat(sx, sy) {
  const a = sx / HALF_W;
  const b = sy / HALF_H;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * Is world-screen point inside the (raised) diamond of the tile?
 * @param {number} sx
 * @param {number} sy
 * @param {number} tx
 * @param {number} ty
 * @param {number} h
 * @returns {boolean}
 */
export function pointInTile(sx, sy, tx, ty, h) {
  const cx = (tx - ty) * HALF_W;
  const cy = (tx + ty) * HALF_H - h * HEIGHT_STEP;
  return Math.abs(sx - cx) / HALF_W + Math.abs(sy - cy) / HALF_H <= 1;
}

/**
 * Pick the tile under a world-screen point, accounting for terrain height
 * (front-most raised tile wins).
 * @param {number} sx
 * @param {number} sy
 * @param {(x:number,y:number)=>number} heightAt returns height or -1 if out of bounds
 * @returns {{x:number,y:number}} may be outside the map
 */
export function pickTile(sx, sy, heightAt) {
  const f = screenToTileFloat(sx, sy);
  const bx = Math.round(f.x);
  const by = Math.round(f.y);
  for (let k = 5; k >= 0; k--) {
    for (let o = 0; o < 3; o++) {
      const tx = bx + k + (o === 1 ? 1 : 0);
      const ty = by + k + (o === 2 ? 1 : 0);
      const h = heightAt(tx, ty);
      if (h < 0) continue;
      if (h * HEIGHT_STEP < (k - 0.5) * TILE_H) continue;
      if (pointInTile(sx, sy, tx, ty, h)) return { x: tx, y: ty };
    }
  }
  return { x: bx, y: by };
}
