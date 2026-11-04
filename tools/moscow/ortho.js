/**
 * OpenTTD-style road straightening on the rasterised road grid (roads are axis-aligned in OpenTTD).
 * The road grid is split into chains between nodes (junctions/dead ends, degree != 2). Every chain
 * that turns is re-routed between its two fixed end nodes as straight legs: Douglas-Peucker vertices,
 * then per segment a straight run, an L, or a long-leg staircase (legs >= MIN_LEG tiles). Because both
 * ends stay put, connectivity is preserved. Corners never go on water or rail; a chain whose new path
 * would break that keeps its original tiles.
 */
import { WIDTH, HEIGHT } from './proj.js';
import { N, E, S, W } from './raster.js';
import { simplifyDP } from './network.js';

const DIRS = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]];
const OPP = { [N]: S, [S]: N, [E]: W, [W]: E };
const CORNER = new Set([N | E, E | S, S | W, W | N]);
/** Minimum perpendicular leg length of a staircase step. */
export const MIN_LEG = 4;
/** Target leg length used to split long diagonals into steps. */
const STEP = 6;

const popcount = (b) => (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);

/** Walk the grid into chains [node, ..., node] (every edge once). */
function chains(bits) {
  const n = bits.length;
  const isNode = (t) => popcount(bits[t]) !== 2;
  const seen = new Set(); // edge keys t*4+k
  const out = [];
  const walk = (start, d0) => {
    const path = [start];
    let t = start, d = d0;
    for (;;) {
      const [, dx, dy] = DIRS.find((q) => q[0] === d);
      const u = t + dx + dy * WIDTH;
      seen.add(t * 16 + d); seen.add(u * 16 + OPP[d]);
      path.push(u);
      if (isNode(u) || u === start) return path;
      const nd = DIRS.find((q) => (bits[u] & q[0]) && q[0] !== OPP[d]);
      if (!nd) return path;
      t = u; d = nd[0];
    }
  };
  for (let t = 0; t < n; t++) {
    if (!bits[t] || !isNode(t)) continue;
    for (const [d] of DIRS) if ((bits[t] & d) && !seen.has(t * 16 + d)) out.push(walk(t, d));
  }
  // pure loops (no node): start anywhere
  for (let t = 0; t < n; t++) {
    if (!bits[t]) continue;
    for (const [d] of DIRS) if ((bits[t] & d) && !seen.has(t * 16 + d)) out.push(walk(t, d));
  }
  return out;
}

/** Tile path (4-connected, inclusive) from a to b as straight legs along one axis then the other. */
function leg(path, x0, y0, x1, y1, xFirst) {
  let x = x0, y = y0;
  const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  const stepX = () => { while (x !== x1) { x += sx; path.push([x, y]); } };
  const stepY = () => { while (y !== y1) { y += sy; path.push([x, y]); } };
  if (xFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
}

/** Axis-aligned tile route through simplified vertices (first/last fixed). */
function route(verts, xFirstBias) {
  const path = [verts[0].slice()];
  let [cx, cy] = verts[0];
  for (let i = 1; i < verts.length; i++) {
    let [tx, ty] = verts[i];
    const last = i === verts.length - 1;
    const dx = tx - cx, dy = ty - cy, ax = Math.abs(dx), ay = Math.abs(dy);
    if (!last && Math.min(ax, ay) <= 2) { // nearly axis-aligned: snap the minor offset (carried on)
      if (ax >= ay) ty = cy; else tx = cx;
      leg(path, cx, cy, tx, ty, true);
      cx = tx; cy = ty;
      continue;
    }
    const m = Math.min(ax, ay);
    const steps = m < MIN_LEG * 2 ? 1 : Math.max(1, Math.min(Math.floor(m / MIN_LEG), Math.round(m / STEP)));
    const xFirst = ax >= ay ? true : xFirstBias;
    for (let k = 1; k <= steps; k++) {
      const nx = cx + Math.round((dx * k) / steps) - (k > 1 ? Math.round((dx * (k - 1)) / steps) : 0);
      const ny = cy + Math.round((dy * k) / steps) - (k > 1 ? Math.round((dy * (k - 1)) / steps) : 0);
      // half of the major leg, then the minor leg, then the rest (centred step)
      const px = path[path.length - 1][0], py = path[path.length - 1][1];
      if (xFirst) { const mx = px + Math.trunc((nx - px) / 2); leg(path, px, py, mx, py, true); leg(path, mx, py, nx, ny, false); }
      else { const my = py + Math.trunc((ny - py) / 2); leg(path, px, py, px, my, false); leg(path, px, my, nx, ny, true); }
      cx = nx; cy = ny;
    }
  }
  return path;
}

/** Count turning tiles in a tile path. */
function turns(path) {
  let n = 0;
  for (let i = 1; i + 1 < path.length; i++) {
    const a = path[i - 1], b = path[i], c = path[i + 1];
    if ((b[0] - a[0]) !== (c[0] - b[0]) || (b[1] - a[1]) !== (c[1] - b[1])) n++;
  }
  return n;
}

/** Bit of the step a->b. */
function stepBit(a, b) {
  return b[0] > a[0] ? E : b[0] < a[0] ? W : b[1] > a[1] ? S : N;
}

/**
 * Straighten all road chains in place.
 * @param {Uint8Array} bits road bits (modified)
 * @param {string[]} cls class letters (modified)
 * @param {{water:Uint8Array, rail:Uint8Array, mkad:Uint8Array, eps?:number}} o
 * @returns {{chains:number, rerouted:number, kept:number, invalid:number}}
 */
export function orthogonalize(bits, cls, o) {
  const eps = o.eps ?? 1.3;
  const all = chains(bits);
  const plans = [];
  let invalid = 0;
  for (const ch of all) {
    if (ch.length < 4) continue;
    const pts = ch.map((t) => [t % WIDTH, (t - (t % WIDTH)) / WIDTH]);
    const oldTurns = turns(pts);
    if (oldTurns === 0) continue;
    if (ch[0] === ch[ch.length - 1]) continue; // loops stay
    const verts = simplifyDP(pts.map(([x, y]) => ({ x, y })), eps).map((p) => [p.x, p.y]);
    let best = null;
    // DP vertices first; then coarser fallbacks (bigger eps, a single L between the ends)
    const cands = [verts, simplifyDP(pts.map(([x, y]) => ({ x, y })), eps * 2.5).map((p) => [p.x, p.y]), [pts[0], pts[pts.length - 1]]];
    for (const vs of cands) {
      for (const bias of [true, false]) {
        const p = route(vs, bias);
        if (!valid(p, ch, bits, o)) continue;
        if (!best || turns(p) < turns(best)) best = p;
      }
      if (best) break;
    }
    if (!best) { invalid++; continue; }
    if (turns(best) >= oldTurns && best.length >= pts.length) continue;
    plans.push({ ch, path: best });
  }
  // phase 1: clear old chains (internal tiles fully; end bits toward the chain)
  const chainCls = [];
  for (const { ch } of plans) {
    let c = '.';
    for (const t of ch) if (cls[t] !== '.' && (c === '.' || rank(cls[t]) > rank(c))) c = cls[t];
    chainCls.push(c);
    const mk = ch.some((t) => o.mkad[t]);
    for (let i = 1; i + 1 < ch.length; i++) { bits[ch[i]] = 0; cls[ch[i]] = '.'; if (mk) o.mkad[ch[i]] = 0; }
    const a = ch[0], b = ch[1], y = ch[ch.length - 1], z = ch[ch.length - 2];
    bits[a] &= ~bitBetween(a, b); bits[y] &= ~bitBetween(y, z);
  }
  // phase 2: lay new paths
  plans.forEach(({ ch, path }, k) => {
    const mk = ch.some((t) => o.mkad[t]) || ch.some((t) => o.mkadOrig && o.mkadOrig[t]);
    for (let i = 0; i < path.length; i++) {
      const t = path[i][1] * WIDTH + path[i][0];
      if (i > 0) bits[t] |= OPP[stepBit(path[i - 1], path[i])];
      if (i + 1 < path.length) bits[t] |= stepBit(path[i], path[i + 1]);
      if (cls[t] === '.' || rank(chainCls[k]) > rank(cls[t])) cls[t] = chainCls[k];
      if (mk) o.mkad[t] = 1;
    }
  });
  return { chains: all.length, rerouted: plans.length, kept: all.length - plans.length, invalid };
}

const RANKS = { '.': 0, s: 1, p: 2, t: 3, m: 4 };
const rank = (c) => RANKS[c] ?? 0;
function bitBetween(a, b) {
  const d = b - a;
  return d === 1 ? E : d === -1 ? W : d === WIDTH ? S : N;
}

/** New path must stay in the map, not turn on water/rail, and only cross water where the old chain did. */
function valid(path, ch, bits, o) {
  const oldWater = new Set(ch.filter((t) => o.water[t]));
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return false;
    const t = y * WIDTH + x;
    const turn = i > 0 && i + 1 < path.length &&
      ((path[i][0] - path[i - 1][0]) !== (path[i + 1][0] - path[i][0]) || (path[i][1] - path[i - 1][1]) !== (path[i + 1][1] - path[i][1]));
    if (turn && (o.water[t] || o.rail[t])) return false;
    if (o.water[t] && !oldWater.size) return false;
    if (o.water[t] && turn) return false;
  }
  return true;
}

export { CORNER };
