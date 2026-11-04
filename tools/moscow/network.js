/**
 * Road and rail network rasterisation plus road simplification.
 * Road bits: N1 E2 S4 W8 per tile. Class: 'm' motorway, 't' trunk, 'p' primary, 's' secondary.
 */
import { WIDTH, HEIGHT, projectF } from './proj.js';
import { N, E, S, W } from './raster.js';
import { chainTiles, markChain, opposite, dirBit } from './raster.js';
import { tag, waysOf } from './io.js';

/** Highway class letters (highest rank wins on a tile). */
const CLASS_RANK = { '.': 0, s: 1, p: 2, t: 3, m: 4 };
const HW_CLASS = { motorway: 'm', trunk: 't', primary: 'p', secondary: 's' };

/**
 * Class letter for a highway tag (strips _link suffix).
 * @param {string} hw
 * @returns {string|null}
 */
export function highwayClass(hw) {
  return HW_CLASS[hw.replace(/_link$/, '')] || null;
}

/**
 * Keep the higher-ranked of two class letters.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function higherClass(a, b) {
  return CLASS_RANK[b] > CLASS_RANK[a] ? b : a;
}

/**
 * Rasterise road ways into bits and class arrays.
 * @param {Array<object>|null} els roads layer elements
 * @returns {{bits:Uint8Array, cls:string[], ways:number, mkad:number[]}}
 */
export function buildRoads(els) {
  const n = WIDTH * HEIGHT;
  const bits = new Uint8Array(n);
  const cls = new Array(n).fill('.');
  const mkad = [];
  let ways = 0;
  for (const w of waysOf(els)) {
    const c = highwayClass(tag(w, 'highway'));
    if (!c) continue;
    ways++;
    const chain = chainTiles(w.geometry);
    markChain(bits, chain);
    for (const t of chain) cls[t] = higherClass(cls[t], c);
    if (/МКАД|MKAD/i.test(tag(w, 'name') + ' ' + tag(w, 'ref'))) mkad.push(...chain);
  }
  return { bits, cls, ways, mkad };
}

/**
 * Rasterise railway=rail ways into bits (subway and service-excluded ways skipped).
 * @param {Array<object>|null} els rail layer elements
 * @returns {{bits:Uint8Array, ways:number}}
 */
export function buildRail(els) {
  const bits = new Uint8Array(WIDTH * HEIGHT);
  let ways = 0;
  for (const w of waysOf(els)) {
    if (tag(w, 'railway') !== 'rail') continue;
    ways++;
    markChain(bits, chainTiles(w.geometry));
  }
  return { bits, ways };
}

/**
 * Count 4-connected components of tiles with bits>0 and label them.
 * @param {Uint8Array} bits
 * @returns {{count:number, label:Int32Array, sizes:number[]}}
 */
export function components(bits) {
  const label = new Int32Array(bits.length).fill(-1);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < bits.length; s++) {
    if (!bits[s] || label[s] >= 0) continue;
    const id = sizes.length;
    sizes.push(0);
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const t = stack.pop();
      sizes[id]++;
      const x = t % WIDTH, y = (t - x) / WIDTH;
      const nb = [];
      if (y > 0) nb.push(t - WIDTH);
      if (y < HEIGHT - 1) nb.push(t + WIDTH);
      if (x > 0) nb.push(t - 1);
      if (x < WIDTH - 1) nb.push(t + 1);
      for (const u of nb) if (bits[u] && label[u] < 0) { label[u] = id; stack.push(u); }
    }
  }
  return { count: sizes.length, label, sizes };
}

/**
 * Remove tile t: clear its bits and the bits of neighbours pointing at it.
 * Returns an undo list of [index, oldBits] pairs.
 * @param {Uint8Array} bits
 * @param {number} t
 * @returns {Array<[number,number]>}
 */
export function removeTile(bits, t) {
  const undo = [[t, bits[t]]];
  const x = t % WIDTH, y = (t - x) / WIDTH;
  const nbs = [[N, y > 0 ? t - WIDTH : -1], [S, y < HEIGHT - 1 ? t + WIDTH : -1], [W, x > 0 ? t - 1 : -1], [E, x < WIDTH - 1 ? t + 1 : -1]];
  for (const [bit, u] of nbs) {
    if (u < 0) continue;
    if (bits[u] & opposite(bit)) { undo.push([u, bits[u]]); bits[u] &= ~opposite(bit); }
  }
  bits[t] = 0;
  return undo;
}

/**
 * Remove 2x2 road blocks where possible: drops a corner tile when the number of
 * road components does not increase. Keeps bits symmetric.
 * @param {Uint8Array} bits road bits (modified)
 * @param {string[]} cls class letters (modified: cleared on removed tiles)
 * @returns {{removed:number, blocks:number}}
 */
export function dropLadders(bits, cls) {
  let removed = 0, blocks = 0;
  let base = components(bits).count;
  for (let y = 0; y < HEIGHT - 1; y++) {
    for (let x = 0; x < WIDTH - 1; x++) {
      const a = y * WIDTH + x;
      const quad = [a, a + 1, a + WIDTH, a + WIDTH + 1];
      if (!quad.every((t) => bits[t])) continue;
      blocks++;
      for (const t of quad) {
        if (!bits[t]) continue;
        const undo = removeTile(bits, t);
        const c = components(bits).count;
        if (c <= base) {
          base = c;
          cls[t] = '.';
          removed++;
          break;
        }
        for (let i = undo.length - 1; i >= 0; i--) bits[undo[i][0]] = undo[i][1];
      }
    }
  }
  return { removed, blocks };
}

/**
 * Remove road components smaller than minSize tiles.
 * @param {Uint8Array} bits
 * @param {string[]} cls
 * @param {number} minSize
 * @returns {{dropped:number, components:number}}
 */
export function dropSmall(bits, cls, minSize) {
  const comp = components(bits);
  let dropped = 0;
  for (let t = 0; t < bits.length; t++) {
    if (!bits[t]) continue;
    if (comp.sizes[comp.label[t]] < minSize) {
      removeTile(bits, t);
      cls[t] = '.';
      dropped++;
    }
  }
  return { dropped, components: comp.count };
}

/**
 * Consistency check for bit symmetry on a bit array.
 * @param {Uint8Array} bits
 * @returns {number} number of asymmetric links
 */
export function asymmetry(bits) {
  let bad = 0;
  for (let t = 0; t < bits.length; t++) {
    const x = t % WIDTH, y = (t - x) / WIDTH;
    if (bits[t] & E) { if (x + 1 >= WIDTH || !(bits[t + 1] & W)) bad++; }
    if (bits[t] & S) { if (y + 1 >= HEIGHT || !(bits[t + WIDTH] & N)) bad++; }
    if (bits[t] & W) { if (x === 0 || !(bits[t - 1] & E)) bad++; }
    if (bits[t] & N) { if (y === 0 || !(bits[t - WIDTH] & S)) bad++; }
  }
  return bad;
}

/**
 * Remove stray bits so that bit links are mutual (drop one-sided bits).
 * @param {Uint8Array} bits
 * @returns {number} links fixed
 */
export function symmetrise(bits) {
  let fixed = 0;
  for (let t = 0; t < bits.length; t++) {
    const x = t % WIDTH, y = (t - x) / WIDTH;
    const pairs = [[E, x + 1 < WIDTH ? t + 1 : -1], [S, y + 1 < HEIGHT ? t + WIDTH : -1], [W, x > 0 ? t - 1 : -1], [N, y > 0 ? t - WIDTH : -1]];
    for (const [bit, u] of pairs) {
      if (u < 0) continue;
      const need = bits[t] & bit;
      const has = bits[u] & opposite(bit);
      if (need && !has) { bits[t] &= ~bit; fixed++; }
      if (has && !need) { bits[u] &= ~opposite(bit); fixed++; }
    }
  }
  return fixed;
}


/**
 * Douglas-Peucker simplification of float tile polylines.
 * @param {Array<{x:number,y:number}>} pts
 * @param {number} eps tolerance in tiles
 * @returns {Array<{x:number,y:number}>}
 */
export function simplifyDP(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const a = pts[s], b = pts[e];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    let best = -1, bi = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (bi >= 0 && best > eps) { keep[bi] = 1; stack.push([s, bi], [bi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Axis-aligned route from integer tile (cx,cy) toward (tx,ty): returns corner points.
 * Straight when aligned; when the minor offset is < 4 only the major axis moves (the
 * endpoint drifts by < 4 tiles); otherwise an L (legs >= 4) or, for long diagonals, a Z
 * with the middle leg at the midpoint (legs >= 4 on every straight run).
 * @returns {Array<[number,number]>}
 */
export function routeLegs(cx, cy, tx, ty) {
  const dx = tx - cx, dy = ty - cy, ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax === 0 || ay === 0) return [[tx, ty]];
  if (Math.min(ax, ay) < 4) return ax >= ay ? [[tx, cy]] : [[cx, ty]];
  if (ax >= 8 && ay >= 4 && ax >= ay) {
    const mx = cx + Math.round(dx / 2);
    return [[mx, cy], [mx, ty], [tx, ty]];
  }
  if (ay >= 8 && ax >= 4 && ay > ax) {
    const my = cy + Math.round(dy / 2);
    return [[cx, my], [tx, my], [tx, ty]];
  }
  return ax >= ay ? [[tx, cy], [tx, ty]] : [[cx, ty], [tx, ty]];
}

/**
 * Orthogonal 4-connected tile chain for a way. DP-simplify, cut long diagonals into pieces of
 * about 12 tiles, route each piece with routeLegs into corner points, merge collinear legs,
 * collapse short (<4) interior legs (Z-jogs) onto their midline, then rasterise straight runs.
 * @param {Array<{lat:number,lon:number}>} geom
 * @returns {number[]}
 */
export function orthoChainTiles(geom) {
  const pts = simplifyDP(geom.map((p) => projectF(p.lat, p.lon)), 1.5);
  if (!pts.length) return [];
  let cx = Math.round(pts[0].x), cy = Math.round(pts[0].y);
  const corners = [[cx, cy]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const pieces = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12));
    for (let k = 1; k <= pieces; k++) {
      const f = k / pieces;
      const tx = Math.round(a.x + (b.x - a.x) * f), ty = Math.round(a.y + (b.y - a.y) * f);
      for (const c of routeLegs(cx, cy, tx, ty)) corners.push(c);
      [cx, cy] = corners[corners.length - 1];
    }
  }
  // clamp, drop duplicates, merge collinear
  let cs = [];
  for (const [x, y] of corners) {
    const q = [Math.min(WIDTH - 1, Math.max(0, x)), Math.min(HEIGHT - 1, Math.max(0, y))];
    const p = cs[cs.length - 1];
    if (p && p[0] === q[0] && p[1] === q[1]) continue;
    cs.push(q);
  }
  const merge = (list) => {
    const out = [list[0]];
    for (let i = 1; i < list.length; i++) {
      const p = out[out.length - 1], c = list[i];
      const prev = out.length > 1 ? out[out.length - 2] : null;
      if (prev && ((prev[0] === p[0] && p[0] === c[0]) || (prev[1] === p[1] && p[1] === c[1]))) { out[out.length - 1] = c; continue; }
      out.push(c);
    }
    return out;
  };
  cs = merge(cs);
  // collapse short interior legs: legs alternate orientation, so the two neighbours are parallel
  for (let iter = 0; iter < 6; iter++) {
    let changed = false;
    for (let i = 0; i + 1 < cs.length; i++) {
      const a = cs[i], b = cs[i + 1];
      const len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
      if (len === 0 || len >= 4) continue;
      if (i === 0 || i + 1 === cs.length - 1) continue; // way endpoints stay on the junction node
      if (a[0] === b[0]) { const m = Math.round((a[1] + b[1]) / 2); cs[i][1] = m; cs[i + 1][1] = m; }
      else { const m = Math.round((a[0] + b[0]) / 2); cs[i][0] = m; cs[i + 1][0] = m; }
      changed = true;
    }
    cs = merge(cs);
    if (!changed) break;
  }
  const out = [];
  const push = (x, y) => {
    const idx = y * WIDTH + x;
    if (out.length === 0 || out[out.length - 1] !== idx) out.push(idx);
  };
  let [x, y] = cs[0];
  push(x, y);
  for (let i = 1; i < cs.length; i++) {
    const [tx, ty] = cs[i];
    while (x !== tx) { x += Math.sign(tx - x); push(x, y); }
    while (y !== ty) { y += Math.sign(ty - y); push(x, y); }
  }
  return out;
}

/**
 * Remove dead-end stubs shorter than minLen tiles (walk from each endpoint through
 * degree-2 tiles; if it reaches a junction (degree >= 3) within minLen-1 tiles, remove it).
 * @param {Uint8Array} bits
 * @param {string[]} cls
 * @param {number} minLen
 * @returns {{removed:number}}
 */
export function pruneStubs(bits, cls, minLen = 3) {
  const deg = (t) => ((bits[t] & 1) + ((bits[t] >> 1) & 1) + ((bits[t] >> 2) & 1) + ((bits[t] >> 3) & 1));
  const nbOf = (t, b) => {
    const x = t % WIDTH, y = (t - x) / WIDTH;
    if (b === N) return y > 0 ? t - WIDTH : -1;
    if (b === S) return y < HEIGHT - 1 ? t + WIDTH : -1;
    if (b === W) return x > 0 ? t - 1 : -1;
    return x < WIDTH - 1 ? t + 1 : -1;
  };
  let removed = 0;
  for (let t = 0; t < bits.length; t++) {
    if (!bits[t] || deg(t) !== 1) continue;
    const path = [t];
    let prev = t, cur = nbOf(t, bits[t]);
    let junction = false;
    while (cur >= 0 && path.length <= minLen) {
      const d = deg(cur);
      if (d >= 3) { junction = true; break; }
      if (d === 1) break;
      path.push(cur);
      const back = opposite(dirBit(cur, prev));
      const next = [N, E, S, W].find((b) => (bits[cur] & b) && b !== back);
      if (!next) break;
      prev = cur; cur = nbOf(cur, next);
    }
    if (junction && path.length < minLen) {
      for (const p of path) { removeTile(bits, p); cls[p] = '.'; removed++; }
    }
  }
  return { removed };
}

/**
 * Count staircase corners: a 2-bit corner tile whose edge neighbour across one of its arms
 * is the reflected corner (a 1-tile zig-zag). Metric used to verify the clean network.
 * @param {Uint8Array} bits
 * @returns {number}
 */
export function countStairs(bits) {
  let n = 0;
  const corner = (b) => b === (N | E) || b === (E | S) || b === (S | W) || b === (W | N);
  for (let t = 0; t < bits.length; t++) {
    const b = bits[t];
    if (!corner(b)) continue;
    const x = t % WIDTH, y = (t - x) / WIDTH;
    // east neighbour reflects this corner if it is the corner with S+W or N+W (ladder step)
    if (x + 1 < WIDTH && (b & E) && corner(bits[t + 1]) && (bits[t + 1] & W) && (bits[t + 1] & (N | S)) !== (b & (N | S))) n++;
    else if (y + 1 < HEIGHT && (b & S) && corner(bits[t + WIDTH]) && (bits[t + WIDTH] & N) && (bits[t + WIDTH] & (E | W)) !== (b & (E | W))) n++;
  }
  return n;
}
