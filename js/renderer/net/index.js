/**
 * Network graph for the smooth road/rail renderer (render-only; the simulation keeps 4-dir tile bits).
 * getNet(map, kind) traces the tile-bit network into EDGES between NODES and caches the result.
 *  - node tile: connection degree != 2, any building (station/depot/landmark), road+rail crossing,
 *    rail tunnel (bridges over water are edge tiles: the net draws a continuous deck). Nodes keep the old per-tile sprites; edges start/end at the node tile's
 *    edge midpoint, axis-aligned, so ribbons join the node sprites.
 *  - edge: { pts: Float32Array [x0,y0,x1,y1,...] (tile units, tile (x,y) centre = (x,y), edges at ±0.5),
 *            len: Float32Array cumulative arc length per point, tiles: Int32Array interior tile indices in order,
 *            a, b: node tile index at each end (-1 for a closed loop), cls: road class (tile.avenue|0) }
 *  - byTile[i]: array of { e, i0, i1 } point-index spans of edges whose ribbon may touch tile i (or undefined).
 *  - covered: Uint8Array, 1 for tiles drawn by the net (edge interior tiles).
 * Raw path = tile-boundary midpoints; fit.js smoothPath() turns it into Locomotion-style geometry.
 */
import { smoothPath } from './fit.js';

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], BIT = [1, 2, 4, 8], OPP = [2, 3, 0, 1];
const cache = new WeakMap();
/** Ribbon half-width margin (tile units) used for byTile. */
export const RIBBON_MARGIN = 0.5;

function bitsOf(t, kind) {
  if (kind === 'rail') return t.tunnel ? 0 : (t.rail | 0);
  return t.road | 0;
}

/**
 * @param {{width:number,height:number,tiles:any[]}} map
 * @param {'road'|'rail'} kind
 */
export function getNet(map, kind) {
  let c = cache.get(map);
  if (!c) { c = {}; cache.set(map, c); }
  return c[kind] || (c[kind] = build(map, kind));
}

/** Drop cached nets (after any build/demolish command). */
export function invalidateNet(map) { if (map) cache.delete(map); }

/** Whether tile (x,y) is drawn by the net for `kind`. */
export function netCovers(map, kind, x, y) {
  return getNet(map, kind).covered[y * map.width + x] === 1;
}

function build(map, kind) {
  const W = map.width, H = map.height, n = W * H, T = map.tiles;
  const conn = new Uint8Array(n); // mutual connections
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, b = bitsOf(T[i], kind);
    if (!b) continue;
    let m = 0;
    for (let d = 0; d < 4; d++) {
      if (!(b & BIT[d])) continue;
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (bitsOf(T[ny * W + nx], kind) & BIT[OPP[d]]) m |= BIT[d];
    }
    conn[i] = m;
  }
  const isNode = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!conn[i]) continue;
    const t = T[i], m = conn[i];
    const deg = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
    // Metro tunnels run underground: for the road net a tunnel tile is plain street (otherwise every street over a
    // metro line broke into per-tile sprites and drew staircases); surface road+rail crossings stay nodes.
    const crossing = (t.road | 0) && (t.rail | 0) && (kind === 'rail' || !t.tunnel);
    if (deg !== 2 || t.building || crossing || (kind === 'rail' && t.tunnel)) isNode[i] = 1; // water = bridge: drawn by the net
  }
  const covered = new Uint8Array(n);
  const usedDir = new Uint8Array(n); // per tile, directions already walked
  const edges = [];
  const walk = (start, d0) => {
    // start: node (or loop seed) tile; walk through interior tiles until a node / back to start
    const tiles = []; const steps = [d0];
    let i = start, d = d0;
    usedDir[start] |= BIT[d0];
    for (;;) {
      const x = i % W, y = (i / W) | 0;
      const j = (y + DY[d]) * W + x + DX[d];
      if (isNode[j] || j === start) { usedDir[j] |= BIT[OPP[d]]; return { tiles, steps, end: j }; }
      tiles.push(j); covered[j] = 1;
      const m = conn[j] & ~BIT[OPP[d]];
      usedDir[j] |= conn[j];
      d = m === 1 ? 0 : m === 2 ? 1 : m === 4 ? 2 : 3;
      steps.push(d);
      i = j;
    }
  };
  const addEdge = (start, d0, loop) => {
    const { tiles, steps, end } = walk(start, d0);
    const raw = pathPoints(start, steps, W);
    const pts = smoothPath(raw, { kind, loop, map, tiles, steps, cls: T[tiles[0] ?? start].avenue | 0 });
    edges.push(finish(pts, tiles, loop ? -1 : start, loop ? -1 : end, T[tiles[0] ?? start].avenue | 0));
  };
  for (let i = 0; i < n; i++) {
    if (!isNode[i]) continue;
    for (let d = 0; d < 4; d++) if ((conn[i] & BIT[d]) && !(usedDir[i] & BIT[d])) addEdge(i, d, false);
  }
  for (let i = 0; i < n; i++) { // closed loops without nodes
    if (!conn[i] || isNode[i] || covered[i]) continue;
    const m = conn[i]; const d = m & 1 ? 0 : m & 2 ? 1 : m & 4 ? 2 : 3;
    covered[i] = 1;
    addEdge(i, d, true);
  }
  const byTile = new Array(n);
  edges.forEach((e, ei) => indexEdge(e, ei, byTile, W, H));
  return { kind, edges, byTile, covered };
}

/** Boundary-midpoint path: start node centre-edge, then each crossed tile boundary. */
function pathPoints(start, steps, W) {
  let x = start % W, y = (start / W) | 0;
  const out = [];
  for (const d of steps) {
    out.push(x + DX[d] * 0.5, y + DY[d] * 0.5);
    x += DX[d]; y += DY[d];
  }
  return out;
}

function finish(pts, tiles, a, b, cls) {
  const P = Float32Array.from(pts);
  const len = new Float32Array(P.length / 2);
  for (let k = 1; k < len.length; k++) len[k] = len[k - 1] + Math.hypot(P[2 * k] - P[2 * k - 2], P[2 * k + 1] - P[2 * k - 1]);
  return { pts: P, len, tiles: Int32Array.from(tiles), a, b, cls };
}

function indexEdge(e, ei, byTile, W, H) {
  const P = e.pts, m = RIBBON_MARGIN;
  let cur = null;
  for (let k = 0; k + 1 < P.length / 2; k++) {
    const x0 = Math.min(P[2 * k], P[2 * k + 2]) - m, x1 = Math.max(P[2 * k], P[2 * k + 2]) + m;
    const y0 = Math.min(P[2 * k + 1], P[2 * k + 3]) - m, y1 = Math.max(P[2 * k + 1], P[2 * k + 3]) + m;
    for (let ty = Math.max(0, Math.round(y0)); ty <= Math.min(H - 1, Math.round(y1)); ty++) {
      for (let tx = Math.max(0, Math.round(x0)); tx <= Math.min(W - 1, Math.round(x1)); tx++) {
        const i = ty * W + tx;
        const list = byTile[i] || (byTile[i] = []);
        const last = list[list.length - 1];
        if (last && last.e === ei && last.i1 >= k) last.i1 = k + 1;
        else list.push({ e: ei, i0: k, i1: k + 1 });
      }
    }
  }
  return cur;
}
