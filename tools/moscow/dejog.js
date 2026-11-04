/**
 * Post-pass (R5a2): removes 1-tile lateral offsets ("jogs") from the baked octilinear road grid.
 * Jog = two adjacent corner tiles A,B joined by edge a, whose outer arms are opposite and whose
 * straight runs continue on both sides (a Z-step between parallel runs). Fix: the run on the
 * shorter side is removed and re-routed octilinearly from its far end onto the other corner.
 * A fix is kept only if the jog count drops and the component count does not increase.
 */
import { WIDTH, HEIGHT } from './proj.js';

/** Opposite bit: N=1 S=4, E=2 W=8. */
export const OPP = { 1: 4, 4: 1, 2: 8, 8: 2 };
/** [bit, dx, dy] for N,E,S,W. */
const DIRS = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
const pc = (b) => (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);
const isCorner = (b) => pc(b) === 2 && b !== 5 && b !== 10;

/** Neighbour index of tile t in bit direction d, or -1 off-map. */
function nbr(t, d, W, H) {
  const x = t % W, y = (t - x) / W;
  const q = DIRS.find((e) => e[0] === d);
  const X = x + q[1], Y = y + q[2];
  return X < 0 || Y < 0 || X >= W || Y >= H ? -1 : Y * W + X;
}

/** Jog through edge (t, a), or null. @returns {{A:number,B:number,a:number,p:number,q:number}|null} */
export function jogAt(bits, t, a, W, H) {
  const b = bits[t];
  if (!isCorner(b) || !(b & a)) return null;
  const B = nbr(t, a, W, H);
  if (B < 0 || !isCorner(bits[B]) || !(bits[B] & OPP[a])) return null;
  const p = b ^ a, q = bits[B] ^ OPP[a];
  if (p !== OPP[q]) return null;
  const P = nbr(t, p, W, H), Q = nbr(B, q, W, H);
  if (P < 0 || Q < 0) return null;
  if (bits[P] !== (p | OPP[p]) || bits[Q] !== (q | OPP[q])) return null;
  return { A: t, B, a, p, q };
}

/** All jog edges. @returns {number} count */
export function countJogs(bits, W, H) {
  let n = 0;
  for (let t = 0; t < bits.length; t++) {
    if (!bits[t]) continue;
    for (const [a] of DIRS) if (jogAt(bits, t, a, W, H)) n++;
  }
  return n;
}

/** 4-connected road components (edges only where both tiles link). @returns {number} */
export function countComps(bits, W, H) {
  const seen = new Uint8Array(bits.length);
  const st = [];
  let comps = 0;
  for (let s = 0; s < bits.length; s++) {
    if (!bits[s] || seen[s]) continue;
    comps++;
    seen[s] = 1; st.push(s);
    while (st.length) {
      const t = st.pop();
      for (const [d] of DIRS) {
        if (!(bits[t] & d)) continue;
        const n = nbr(t, d, W, H);
        if (n >= 0 && !seen[n] && bits[n]) { seen[n] = 1; st.push(n); }
      }
    }
  }
  return comps;
}

/** Minimal binary heap of [cost, state]. */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(c, s) {
    const a = this.a; a.push([c, s]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/**
 * Octilinear shortest path of free tiles from F (existing road end) to B (existing corner).
 * Interior tiles must touch no road; step cost 2 + 1 per turn (state = tile, heading).
 * @returns {number[]|null} tiles F..B inclusive
 */
function routePath(bits, water, F, B, maxCost, W, H) {
  const fx = F % W, fy = (F - fx) / W, bx = B % W, by = (B - bx) / W;
  const m = 6;
  const x0 = Math.max(0, Math.min(fx, bx) - m), x1 = Math.min(W - 1, Math.max(fx, bx) + m);
  const y0 = Math.max(0, Math.min(fy, by) - m), y1 = Math.min(H - 1, Math.max(fy, by) + m);
  const dist = new Map(), prev = new Map();
  const heap = new Heap();
  const key = (t, h) => t * 5 + h; // h = heading index 0..3, 4 = start
  const start = key(F, 4);
  dist.set(start, 0); heap.push(0, start);
  let goal = -1, goalCost = Infinity;
  while (heap.size) {
    const [c, s] = heap.pop();
    if (c > (dist.get(s) ?? Infinity) || c > maxCost) continue;
    const t = Math.floor(s / 5), h = s % 5;
    const x = t % W, y = (t - x) / W;
    for (let k = 0; k < 4; k++) {
      const [d, dx, dy] = DIRS[k];
      const X = x + dx, Y = y + dy;
      if (X < x0 || X > x1 || Y < y0 || Y > y1) continue;
      const n = Y * W + X;
      if (t === F && (bits[F] & d)) continue;
      const cc = c + 2 + (h !== 4 && h !== k ? 1 : 0);
      if (n === B) {
        if (bits[B] & OPP[d]) continue;
        if (cc < goalCost) { goalCost = cc; goal = key(B, k); prev.set(goal, s); }
        continue;
      }
      if (bits[n] || water[n]) continue;
      // interior tile must not touch any other road (the predecessor t is allowed if it is F)
      let touch = 0;
      for (const [d2] of DIRS) { const q = nbr(n, d2, W, H); if (q >= 0 && bits[q] && q !== F && q !== B) touch++; }
      if (touch > Number(process.env.DEJOG_TOUCH || 0)) continue;
      const ns = key(n, k);
      if (cc < (dist.get(ns) ?? Infinity)) { dist.set(ns, cc); prev.set(ns, s); heap.push(cc, ns); }
    }
  }
  if (goal < 0) return null;
  const path = [];
  for (let s = goal; s !== undefined; s = prev.get(s)) {
    path.push(Math.floor(s / 5));
    if (Math.floor(s / 5) === F) break;
  }
  return path.reverse();
}

/** Straight run leaving s along v: tiles from s (inclusive) and the first non-straight tile beyond. */
function runFrom(bits, s, v, W, H) {
  const tiles = [s];
  let cur = nbr(s, v, W, H);
  while (cur >= 0 && bits[cur] === (v | OPP[v]) && tiles.length < 60) { tiles.push(cur); cur = nbr(cur, v, W, H); }
  return { tiles, end: cur };
}

/**
 * Try to fix jog J by removing run `which` (0: from A, 1: from B) and re-routing its far end to
 * the other corner. Reverts everything if the result does not reduce jogs or raises comps.
 * @returns {boolean} true if kept
 */
function tryFix(ctx, J, which) {
  const { bits, cls, water, W, H } = ctx;
  const s = which === 0 ? J.A : J.B, o = which === 0 ? J.B : J.A;
  const v = which === 0 ? J.p : J.q;
  const sideO = which === 0 ? OPP[J.a] : J.a; // o's arm pointing at s
  const run = runFrom(bits, s, v, W, H);
  const F = run.end;
  if (F < 0 || !bits[F] || run.tiles.length > 12) return false;
  const saved = new Map();
  const save = (t) => { if (!saved.has(t)) saved.set(t, [bits[t], cls[t]]); };
  const rollback = () => { for (const [t, [b, c]] of saved) { bits[t] = b; cls[t] = c; } return false; };
  const j0 = countJogs(bits, W, H), c0 = countComps(bits, W, H);
  for (const t of run.tiles) { save(t); bits[t] = 0; }
  save(F); save(o);
  bits[F] &= ~OPP[v];
  bits[o] &= ~sideO;
  const cls0 = cls[s];
  const path = routePath(bits, water, F, o, 2 * (run.tiles.length + Number(process.env.DEJOG_SLACK || 8)), W, H);
  if (!path) return rollback();
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    const d = dirTo(a, b, W);
    save(a); save(b);
    bits[a] |= d; bits[b] |= OPP[d];
    if (cls[a] === '.') cls[a] = cls0;
    if (cls[b] === '.') cls[b] = cls0;
  }
  for (const t of run.tiles) cls[t] = '.';
  if (countJogs(bits, W, H) < j0 && countComps(bits, W, H) <= c0) return true;
  return rollback();
}

/** Bit from tile a to adjacent tile b. @returns {number} */
function dirTo(a, b, W) {
  const d = b - a;
  if (d === -W) return 1;
  if (d === 1) return 2;
  if (d === W) return 4;
  if (d === -1) return 8;
  throw new Error('dejog: tiles not adjacent');
}

/**
 * Remove jogs from the road grid in place.
 * @param {Uint8Array} bits road bits (mutated)
 * @param {string[]} cls per-tile road class (mutated)
 * @param {Uint8Array} water 1 = water tile (never routed through)
 * @param {{passes?:number,W?:number,H?:number}} [opts]
 * @returns {{before:number, after:number, fixed:number}}
 */
export function dejog(bits, cls, water, opts = {}) {
  const W = opts.W || WIDTH, H = opts.H || HEIGHT;
  const ctx = { bits, cls, water, W, H };
  const before = countJogs(bits, W, H);
  let fixed = 0;
  for (let pass = 0; pass < (opts.passes || 4); pass++) {
    let changed = false;
    for (let t = 0; t < bits.length; t++) {
      if (!bits[t]) continue;
      for (const [a] of DIRS) {
        const J = jogAt(bits, t, a, W, H);
        if (!J) continue;
        const la = runFrom(bits, J.A, J.p, W, H).tiles.length;
        const lb = runFrom(bits, J.B, J.q, W, H).tiles.length;
        const order = la <= lb ? [0, 1] : [1, 0];
        if (order.some((w) => tryFix(ctx, J, w) && ++fixed)) { changed = true; }
      }
    }
    if (!changed) break;
  }
  return { before, after: countJogs(bits, W, H), fixed };
}
