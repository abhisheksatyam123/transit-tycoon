/**
 * Smooth vehicle poses on the net renderer's ribbons (render-only).
 * Vehicles project their tile-space position onto the smooth edge centreline of the net and take
 * its tangent as heading, so they drive along the drawn road/rail (diagonals, curves) instead of
 * the tile grid. Only tiles covered by the net are affected; node tiles keep the sim pose.
 */
import { getNet, netCovers } from './index.js';
import { netActive } from './state.js';

/** Shared output record: smoothPose returns this same object each call (read it immediately). */
const OUT = { x: 0, y: 0, angle: 0, edge: -1, s: 0, w: 1 };
/** Blend length (tile units) over which a pose fades from the sim lane at edge ends. */
const POSE_BLEND = 0.25;
/** Heading weight in the edge choice (squared tile distance units). */
const HEADING_W = 0.05;

/** @type {any} map used by the renderer-side helpers (set once per frame by the renderer). */
let poseMap = null;
/** @param {any} map the game map (or null to disable) */
export function setPoseMap(map) { poseMap = map || null; }
/** @returns {any} the current pose map */
export function getPoseMap() { return poseMap; }

/** Heading (rad) of a travel bit (1=N, 2=E, 4=S, 8=W) in tile space. */
export function angleFromBit(bit) {
  return bit === 1 ? -Math.PI / 2 : bit === 8 ? Math.PI : bit === 4 ? Math.PI / 2 : 0;
}

/**
 * Project (x,y) onto the smooth centreline of the net and return the closest point, its tangent
 * oriented with `heading` (when given) and its arc position. Returns null when the tile has no
 * ribbon. The returned object is shared (OUT); copy fields before the next call.
 * @param {any} map
 * @param {'road'|'rail'} kind
 * @param {number} x tile-space x (tile centres at integers)
 * @param {number} y tile-space y
 * @param {number} [headingRad] travel heading; orients the tangent and breaks ties between edges
 * @returns {{x:number,y:number,angle:number,edge:number,s:number,w:number}|null} w: 0..1 blend
 *   weight (fades to 0 within POSE_BLEND of a node end of the edge)
 */
export function smoothPose(map, kind, x, y, headingRad) {
  if (!map) return null;
  const W = map.width, H = map.height;
  const tx = Math.round(x), ty = Math.round(y);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return null;
  const net = getNet(map, kind);
  const spans = net.byTile[ty * W + tx];
  if (!spans || !spans.length) return null;
  const hasH = headingRad !== undefined && headingRad !== null;
  const hc = hasH ? Math.cos(headingRad) : 0, hs = hasH ? Math.sin(headingRad) : 0;
  let best = Infinity, bx = 0, by = 0, bdx = 1, bdy = 0, be = -1, bs = 0, bk = 0, bt = 0;
  for (let q = 0; q < spans.length; q++) {
    const sp = spans[q], P = net.edges[sp.e].pts, L = net.edges[sp.e].len;
    for (let k = sp.i0; k + 1 <= sp.i1; k++) {
      const ax = P[2 * k], ay = P[2 * k + 1];
      const dx = P[2 * k + 2] - ax, dy = P[2 * k + 3] - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - x, py = ay + dy * t - y;
      const d2 = px * px + py * py;
      let score = d2;
      const l = Math.sqrt(l2) || 1;
      if (hasH) score += HEADING_W * (1 - Math.abs((dx * hc + dy * hs) / l));
      if (score < best) {
        best = score; bx = ax + dx * t; by = ay + dy * t; bdx = dx / l; bdy = dy / l;
        be = sp.e; bk = k; bt = t; bs = L[k] + (L[k + 1] - L[k]) * t;
      }
    }
  }
  if (be < 0) return null;
  let ang = Math.atan2(bdy, bdx);
  if (hasH && Math.cos(ang - headingRad) < 0) ang += Math.PI;
  const E = net.edges[be];
  const total = E.len[E.len.length - 1];
  let w = 1;
  if (E.a >= 0 && bs < POSE_BLEND) w = Math.min(w, bs / POSE_BLEND);
  if (E.b >= 0 && total - bs < POSE_BLEND) w = Math.min(w, Math.max(0, total - bs) / POSE_BLEND);
  void bk; void bt;
  OUT.x = bx; OUT.y = by; OUT.angle = ang; OUT.edge = be; OUT.s = bs; OUT.w = w;
  return OUT;
}

/**
 * Whether the smooth pose applies at tile-space (x,y) for `kind` (net on and tile covered).
 * @param {any} map
 * @param {'road'|'rail'} kind
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function poseCovered(map, kind, x, y) {
  return !!map && netActive() && netCovers(map, kind, Math.round(x), Math.round(y));
}
