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

/** Signed area test: is point p inside triangle a,b,c (any winding)? */
const PICK_EPS = 0.5; // px^2 tolerance so points on a shared edge (diagonal) count for both triangles
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < -PICK_EPS || d2 < -PICK_EPS || d3 < -PICK_EPS;
  const pos = d1 > PICK_EPS || d2 > PICK_EPS || d3 > PICK_EPS;
  return !(neg && pos);
}

/**
 * Height-aware pick against the DRAWN surface: each tile's ground is the quad of its four corner
 * heights [N,E,S,W] (split into two triangles like heights.js). Among tiles whose quad contains the
 * point, the front-most one (largest x+y) wins. Falls back to the flat pick when nothing matches.
 * @param {number} sx
 * @param {number} sy
 * @param {(x:number,y:number)=>number[]|null} cornersAt [hN,hE,hS,hW] or null when out of the map
 * @returns {{x:number,y:number}}
 */
export function pickTileQuad(sx, sy, cornersAt) {
  const f = screenToTileFloat(sx, sy);
  const bx = Math.round(f.x), by = Math.round(f.y);
  let best = null, bestS = -Infinity;
  // A raised tile covering the point sits at most ~ (maxHeight/2) tiles in front of the flat pick.
  for (let tx = bx - 3; tx <= bx + 12; tx++) {
    for (let ty = by - 3; ty <= by + 12; ty++) {
      const s = tx + ty;
      if (s <= bestS) continue;
      const c = cornersAt(tx, ty);
      if (!c) continue;
      // corners sit half a tile around the centre (same frame as Heights.surfaceH)
      const N = tileToScreen(tx - 0.5, ty - 0.5, c[0]), E = tileToScreen(tx + 0.5, ty - 0.5, c[1]);
      const S = tileToScreen(tx + 0.5, ty + 0.5, c[2]), W = tileToScreen(tx - 0.5, ty + 0.5, c[3]);
      if (inTri(sx, sy, N.x, N.y, E.x, E.y, S.x, S.y) || inTri(sx, sy, N.x, N.y, S.x, S.y, W.x, W.y)) {
        best = { x: tx, y: ty };
        bestS = s;
      }
    }
  }
  return best || { x: bx + 0, y: by + 0 };
}
