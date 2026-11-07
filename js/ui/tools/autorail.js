/**
 * Autorail piece chooser (pure, UI-only). OpenTTD-style: a drag whose end is on a 45-degree
 * diagonal lays the staircase automatically; a single-tile click picks the straight piece
 * (X or Y axis) from where the cursor sits inside the tile.
 */
import { diagPath } from '../../simulation/shapes.js';

/**
 * True when the drag is a 45-degree diagonal (|dx| === |dy|, not a point).
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 */
export function isDiagonalDrag(x0, y0, x1, y1) {
  const ax = Math.abs(x1 - x0), ay = Math.abs(y1 - y0);
  return ax > 0 && ax === ay;
}

/**
 * Route for an autorail drag: the diagonal staircase when the drag is diagonal, else null
 * (the caller keeps its L/straight behaviour).
 * @returns {{path:{x:number,y:number}[], loop:boolean}|null}
 */
export function autorailRoute(x0, y0, x1, y1) {
  if (!isDiagonalDrag(x0, y0, x1, y1)) return null;
  return { path: diagPath(x0, y0, x1, y1), loop: false };
}

/**
 * Straight piece for a single-tile click. (u,v) is the cursor position inside the tile in
 * [0,1]x[0,1] (tile centre (0.5,0.5)). The X piece lies along the line v=0.5, the Y piece along
 * u=0.5; the piece whose line the cursor is nearer to wins (ties go to X).
 *
 * @param {number} u @param {number} v
 * @returns {'x'|'y'}
 */
export function choosePiece(u, v) {
  const du = Math.min(u, 1 - u), dv = Math.min(v, 1 - v);
  return du <= dv ? 'x' : 'y';
}
