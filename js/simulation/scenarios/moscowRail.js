/**
 * Surface rail cleanup for the Moscow scenario. Removes "ladders" (parallel lines joined by
 * short rungs) and small loops, prunes short surface spurs, and clears dangling bits, while
 * preserving connectivity between every pair of station/depot tiles.
 *
 * Model: the rail graph uses mutual 4-bit connections (A has the bit toward B and B the
 * opposite bit). Edges touching tunnel/station/depot tiles are always kept. Surface edges are
 * weighted by straightness support and processed in a Kruskal maximum spanning forest. An edge
 * that closes a cycle whose remaining path is <= SMALL_CYCLE tiles is dropped; longer loops
 * (e.g. the ring railway) are kept. Pure and deterministic: no randomness, no clock.
 */
import { tl, TS } from './moscowScale.js';
import { DIR_BY_BIT } from '../constants.js';

/** Rail bits: N=1, E=2, S=4, W=8. */
const OPP = { 1: 4, 2: 8, 4: 1, 8: 2 };
const BITS = [1, 2, 4, 8];
/** Max path length (edges) kept between two tiles that closes a cycle we drop. */
export const SMALL_CYCLE = tl(24);
/** Max spur length (tiles) removed as a dead end. */
export const SPUR_MAX = tl(3);
const STRAIGHT_CAP = tl(8);
const ALWAYS_KEEP = 1e6;

const isStationOrDepot = (t) => !!t.building && (t.building.type === 'station' || t.building.type === 'depot');
const isSurface = (t) => !t.tunnel && !isStationOrDepot(t);

/** Index of the mutual neighbour across `bit` from tile i, or -1. */
function mutual(map, i, bit) {
  const { width: W, height: H, tiles } = map;
  if (!(tiles[i].rail & bit)) return -1;
  const d = DIR_BY_BIT[bit];
  const x = i % W + d.dx, y = Math.floor(i / W) + d.dy;
  if (x < 0 || y < 0 || x >= W || y >= H) return -1;
  const j = y * W + x;
  return tiles[j].rail & OPP[bit] ? j : -1;
}

/** Mutual neighbour indices of tile i (each as {j,bit}). */
function links(map, i) {
  const out = [];
  for (const bit of BITS) { const j = mutual(map, i, bit); if (j >= 0) out.push({ j, bit }); }
  return out;
}

/** Number of mutual connections of tile i. */
const degree = (map, i) => links(map, i).length;

/** Clear the rail bits joining tile i with all its mutual neighbours (both sides). */
function disconnect(map, i) {
  for (const { j, bit } of links(map, i)) map.tiles[j].rail &= ~OPP[bit];
  map.tiles[i].rail = 0;
}

/** Consecutive mutual straight links from tile i in direction bit, capped. */
function straightRun(map, i, bit) {
  let k = 0, cur = i;
  while (k < STRAIGHT_CAP) { const j = mutual(map, cur, bit); if (j < 0) break; k++; cur = j; }
  return k;
}

/** A tile with exactly two connections that are perpendicular (a corner of a staircase). */
function isCorner(map, i) {
  const ls = links(map, i);
  return ls.length === 2 && ls[0].bit % 2 !== ls[1].bit % 2;
}

/** Straightness weight of the surface edge a--bit-->b (see module doc). */
function edgeWeight(map, a, b, bit) {
  const w = 1 + straightRun(map, b, bit) + straightRun(map, a, OPP[bit]);
  const stair = isCorner(map, a) && isCorner(map, b) ? 2 : 0;
  return w + stair;
}

/** Undirected edges of the rail graph: [{a,b,bit,w,surf}], deterministic order. */
function collectEdges(map) {
  const edges = [];
  map.tiles.forEach((t, a) => {
    if (!t.rail) return;
    for (const bit of [2, 4]) {
      const b = mutual(map, a, bit);
      if (b < 0) continue;
      const surf = isSurface(t) && isSurface(map.tiles[b]);
      const w = surf ? edgeWeight(map, a, b, bit) : ALWAYS_KEEP;
      edges.push({ a, b, bit, w, surf });
    }
  });
  edges.sort((p, q) => (q.w - p.w) || (p.a - q.a) || (p.b - q.b));
  return edges;
}

/** Bounded BFS from a to b over adjacency lists; true when distance <= limit. */
function withinDistance(adj, a, b, limit) {
  if (a === b) return true;
  let frontier = [a];
  const seen = new Map([[a, 0]]);
  for (let d = 0; d < limit && frontier.length; d++) {
    const next = [];
    for (const u of frontier) {
      for (const v of adj.get(u) || []) {
        if (seen.has(v)) continue;
        if (v === b) return true;
        seen.set(v, d + 1);
        next.push(v);
      }
    }
    frontier = next;
  }
  return false;
}

/** Union-find with path halving; deterministic. */
function makeDsu(n) {
  const p = new Int32Array(n);
  for (let i = 0; i < n; i++) p[i] = i;
  const find = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
  return { find, union: (x, y) => { p[find(x)] = find(y); } };
}

/** Clear surface bits that have no mutual neighbour. @returns {number} bits cleared */
function clearDangling(map) {
  let n = 0;
  map.tiles.forEach((t, i) => {
    if (!t.rail || !isSurface(t)) return;
    for (const bit of BITS) {
      if (t.rail & bit && mutual(map, i, bit) < 0) { t.rail &= ~bit; n++; }
    }
  });
  return n;
}

/** Walk from a surface leaf along a chain; returns {chain, junction} or null. */
function chainFromLeaf(map, leaf) {
  const chain = [];
  let prev = -1, cur = leaf;
  for (;;) {
    if (cur !== leaf && degree(map, cur) >= 3) return { chain, junction: cur };
    chain.push(cur);
    if (chain.length > SPUR_MAX + 1) return null;
    const next = links(map, cur).map((l) => l.j).filter((j) => j !== prev);
    if (next.length !== 1) return null;
    prev = cur; cur = next[0];
  }
}

/** True when tile i may be removed as spur material. */
function spurTileOk(map, i) {
  const t = map.tiles[i];
  const x = i % map.width, y = Math.floor(i / map.width);
  if (x === 0 || y === 0 || x === map.width - 1 || y === map.height - 1) return false;
  return isSurface(t);
}

/** Remove surface dead-end spurs of length <= SPUR_MAX. @returns {number} tiles pruned */
function pruneSpurs(map) {
  let pruned = 0;
  for (let round = 0; round < 20; round++) {
    let changed = 0;
    map.tiles.forEach((t, i) => {
      if (!t.rail || !spurTileOk(map, i)) return;
      const d = degree(map, i);
      if (d === 0) { t.rail = 0; changed++; return; }
      if (d !== 1) return;
      const r = chainFromLeaf(map, i);
      if (!r || r.chain.length > SPUR_MAX) return;
      if (!r.chain.every((c) => spurTileOk(map, c))) return;
      if (isStationOrDepot(map.tiles[r.junction]) || map.tiles[r.junction].tunnel) return;
      for (const c of r.chain) disconnect(map, c);
      changed += r.chain.length;
    });
    pruned += changed;
    if (!changed) break;
  }
  return pruned;
}

/**
 * Count surface edges that close a cycle of at most SMALL_CYCLE tiles (the edge's endpoints
 * are joined by a surface path of length <= SMALL_CYCLE avoiding that edge).
 * @param {object} map tile map
 * @returns {number}
 */
export function countSmallCycles(map) {
  const adj = new Map();
  const add = (u, v) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push(v); };
  const surf = [];
  map.tiles.forEach((t, a) => {
    if (!t.rail || !isSurface(t)) return;
    for (const { j, bit } of links(map, a)) {
      if (!isSurface(map.tiles[j])) continue;
      add(a, j); add(j, a);
      if (bit === 2 || bit === 4) surf.push([a, j]);
    }
  });
  let n = 0;
  for (const [a, b] of surf) {
    // Temporarily hide edge a-b, test reachability, restore.
    const ra = adj.get(a), rb = adj.get(b);
    adj.set(a, ra.filter((v) => v !== b)); adj.set(b, rb.filter((v) => v !== a));
    if (withinDistance(adj, a, b, SMALL_CYCLE)) n++;
    adj.set(a, ra); adj.set(b, rb);
  }
  return n;
}

/** Bounded BFS path test with edge a-b hidden; true when a and b stay connected within limit. */
function reconnects(map, a, b, bit, limit) {
  const seen = new Set([a]);
  let frontier = [a];
  for (let d = 0; d < limit && frontier.length; d++) {
    const next = [];
    for (const u of frontier) {
      for (const { j, bit: nb } of links(map, u)) {
        if (u === a && nb === bit) continue;
        if (u === b && nb === OPP[bit]) continue;
        if (j === b) return true;
        if (seen.has(j)) continue;
        seen.add(j); next.push(j);
      }
    }
    frontier = next;
  }
  return false;
}

/**
 * Drop surface edges between junction tiles (degree >= 3) when their endpoints stay connected
 * through the rest of the network. This removes 4-way X crossings and parallel rungs without
 * changing reachability. Deterministic (fixed tile order, bounded search).
 * @returns {number} edges removed
 */
export function removeRedundantJunctionEdges(map, limit = tl(60)) {
  let removed = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (!t.rail || !isSurface(t) || degree(map, i) < 3) continue;
    for (const bit of BITS) {
      if (!(t.rail & bit) || degree(map, i) < 3) continue;
      const j = mutual(map, i, bit);
      if (j < 0 || !isSurface(map.tiles[j]) || degree(map, j) < 3) continue;
      if (reconnects(map, i, j, bit, limit)) {
        map.tiles[i].rail &= ~bit;
        map.tiles[j].rail &= ~OPP[bit];
        removed++;
      }
    }
  }
  return removed;
}

/** True when a station/depot tile with rail lies within r tiles of i. */
function nearStationRail(map, i, r) {
  const W = map.width, H = map.height, x = i % W, y = Math.floor(i / W);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const t = map.tiles[ny * W + nx];
    if (t.rail && isStationOrDepot(t)) return true;
  }
  return false;
}

/**
 * Partition of terminal tiles (station/depot/tunnel rail) by connectivity over all rail links.
 * Returns a string signature; equal signatures before and after mean connectivity is preserved.
 */
function terminalSignature(map) {
  const { width: W, height: H, tiles: T } = map;
  const n = T.length, comp = new Int32Array(n).fill(-1);
  let c = 0;
  const term = [];
  for (let i = 0; i < n; i++) {
    if (!T[i].rail || comp[i] >= 0) continue;
    const stack = [i]; comp[i] = c;
    while (stack.length) {
      const u = stack.pop();
      for (const b of BITS) {
        if (!(T[u].rail & b)) continue;
        const d = DIR_BY_BIT[b], x = u % W + d.dx, y = Math.floor(u / W) + d.dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const v = y * W + x;
        if (comp[v] >= 0 || !(T[v].rail & OPP[b])) continue;
        comp[v] = c; stack.push(v);
      }
    }
    c++;
  }
  for (let i = 0; i < n; i++) if (T[i].rail && (T[i].tunnel || isStationOrDepot(T[i]))) term.push(`${i}:${comp[i]}`);
  // partition signature: relabel components by first terminal appearance
  const relabel = new Map(); const out = [];
  for (const t of term) { const k = +t.split(':')[1]; if (!relabel.has(k)) relabel.set(k, relabel.size); out.push(`${t.split(':')[0]}=${relabel.get(k)}`); }
  return out.join(',');
}

/** Tile usable for new surface rail: no rail, no building, not water, not on the map border. */
function freeForRail(map, i) {
  const t = map.tiles[i];
  if (t.rail || t.building || t.tunnel || t.terrain === 'water') return false;
  const x = i % map.width, y = Math.floor(i / map.width);
  return x > 0 && y > 0 && x < map.width - 1 && y < map.height - 1;
}

/**
 * Reconnect surface dead ends: from a dead end, BFS up to maxLen tiles over free tiles (road crossings
 * allowed), starting in the direction the line was already heading, to the nearest other surface rail
 * tile. On success the path is laid as rail. Deterministic.
 * @returns {number} tiles added
 */
export function reconnectDeadEnds(map, maxLen = tl(15)) {
  const W = map.width, T = map.tiles, DXY = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };
  let added = 0;
  // component labels (surface graph); only join dead ends of different components => no new loops
  const dsu = makeDsu(T.length);
  for (let i = 0; i < T.length; i++) if (T[i].rail && isSurface(T[i])) for (const { j } of links(map, i)) dsu.union(i, j);
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (!t.rail || !isSurface(t) || degree(map, i) !== 1 || nearStationRail(map, i, tl(2))) continue;
    const L = links(map, i)[0].bit;
    const first = OPP[L];
    const [fx, fy] = DXY[first];
    const x0 = i % W, y0 = Math.floor(i / W);
    const s0 = (y0 + fy) * W + (x0 + fx);
    if (!(x0 + fx >= 0 && y0 + fy >= 0 && x0 + fx < W && y0 + fy < map.height)) continue;
    if (!freeForRail(map, s0) && !(T[s0].rail && isSurface(T[s0]))) continue;
    if (T[s0].rail && isSurface(T[s0]) && degree(map, s0) !== 1) continue;
    // BFS from i (first step fixed to 'first'); target = surface rail tile not equal to i
    const par = new Map([[i, -1]]);
    let frontier = [s0];
    par.set(s0, i);
    let hit = -1, depth = 1;
    while (frontier.length && depth <= maxLen && hit < 0) {
      const next = [];
      for (const u of frontier) {
        if (T[u].rail && isSurface(T[u]) && u !== i && degree(map, u) === 1 && dsu.find(u) !== dsu.find(i)) { hit = u; break; }
        for (const b of [1, 2, 4, 8]) {
          const ux = u % W, uy = Math.floor(u / W), [dx, dy] = DXY[b];
          const nx = ux + dx, ny = uy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
          const v = ny * W + nx;
          if (par.has(v)) continue;
          if (!(freeForRail(map, v) || (T[v].rail && isSurface(T[v])))) continue;
          par.set(v, u); next.push(v);
        }
      }
      if (hit >= 0) break;
      frontier = next; depth++;
    }
    if (hit < 0) continue;
    // walk back from hit to i, laying bits (skip laying onto existing rail target beyond its bit)
    const path = [];
    for (let c = hit; c !== i; c = par.get(c)) path.push(c);
    path.push(i);
    path.reverse();
    if (path.length - 2 > maxLen) continue;
    for (let k = 0; k + 1 < path.length; k++) {
      const a = path[k], bb = path[k + 1];
      const d = (bb - a === -W) ? 1 : (bb - a === 1) ? 2 : (bb - a === W) ? 4 : 8;
      T[a].rail |= d; T[bb].rail |= OPP[d];
      if (k + 1 < path.length - 1) added++;
    }
    dsu.union(i, hit);
    for (const c of path) for (const { j } of links(map, c)) dsu.union(c, j);
  }
  return added;
}

/**
 * Remove dead-end chains from the surface network: walk from a surface leaf to the first junction and
 * clear the chain, unless the leaf sits near a station/depot (kept) or the chain would reach a station,
 * depot or tunnel. Any length. @returns {number} tiles removed
 */
export function pruneStubs(map, maxLen = tl(12)) {
  let pruned = 0;
  const sig0 = terminalSignature(map);
  map.tiles.forEach((t, i) => {
    if (!t.rail || !isSurface(t) || degree(map, i) !== 1) return;
    if (nearStationRail(map, i, tl(2))) return;
    const chain = [];
    let prev = -1, cur = i, junction = -1;
    for (;;) {
      if (cur !== i && degree(map, cur) >= 3) { junction = cur; break; }
      if (chain.length > maxLen || !isSurface(map.tiles[cur])) break;
      chain.push(cur);
      const next = links(map, cur).map((l) => l.j).filter((j) => j !== prev);
      if (next.length !== 1) break;
      prev = cur; cur = next[0];
    }
    if (junction < 0 || chain.length > maxLen) return;
    const saved = chain.map((c) => [c, map.tiles[c].rail]);
    const nbr = chain.flatMap((c) => links(map, c).map((l) => [l.j, map.tiles[l.j].rail]));
    for (const c of chain) disconnect(map, c);
    if (terminalSignature(map) !== sig0) {
      // rollback: this stub carries a terminal link
      for (const [c, r] of saved) map.tiles[c].rail = r;
      for (const [j, r] of nbr) map.tiles[j].rail = r;
      return;
    }
    pruned += chain.length;
  });
  return pruned;
}

/** Bit for a unit step (dx,dy). */
const stepBit = (dx, dy) => (dy === -1 ? 1 : dx === 1 ? 2 : dy === 1 ? 4 : 8);

/**
 * Gap bridging (narrow rule). For each surface dead end A (not near a station/depot), look ahead in its
 * open direction up to 4 tiles for a dead end B whose open side faces A (B's single link points back at
 * the gap). Optionally one lateral jog (1 tile) before B. Gap tiles must be free or a perpendicular road
 * crossing (then gradeSep). A and B must be in different surface components, so no cycle is closed.
 * @returns {number} gaps bridged
 */
export function bridgeGaps(map, maxGap = tl(4)) {
  const { width: W, height: H, tiles: T } = map;
  const dsu = makeDsu(T.length);
  for (let i = 0; i < T.length; i++) if (T[i].rail && isSurface(T[i])) for (const { j } of links(map, i)) dsu.union(i, j);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x);
  const gapOk = (i, axis) => {
    const t = T[i];
    if (t.rail || t.tunnel || t.building || t.terrain === 'water') return false;
    return !(t.road & axis);
  };
  let bridged = 0;
  for (let a = 0; a < T.length; a++) {
    const t = T[a];
    if (!t.rail || !isSurface(t) || degree(map, a) !== 1 || nearStationRail(map, a, tl(2))) continue;
    const L = links(map, a)[0].bit;
    const d = OPP[L];
    const D = DIR_BY_BIT[d];
    const axis = d === 2 || d === 8 ? 2 | 8 : 1 | 4;
    const perp = d === 2 || d === 8 ? [1, 4] : [2, 8];
    const ax = a % W, ay = Math.floor(a / W);
    let done = false;
    for (let m = 1; m <= maxGap && !done; m++) {
      for (const p of [0, ...perp]) {
        // path: straight gap tiles A+1d..A+md, then (if p) lateral tile A+md+p, then B
        const seq = [];
        let ok = true;
        for (let k = 1; k <= m; k++) seq.push([ax + D.dx * k, ay + D.dy * k]);
        if (p) { const P = DIR_BY_BIT[p]; seq.push([ax + D.dx * m + P.dx, ay + D.dy * m + P.dy]); }
        const last = seq[seq.length - 1];
        const bx = last[0] + (p ? D.dx : D.dx), by = last[1] + (p ? D.dy : D.dy);
        seq.push([bx, by]);
        const idx = seq.map(([x, y]) => at(x, y));
        const B = idx[idx.length - 1];
        if (idx.some((v) => v < 0) || B < 0) continue;
        const tb = T[B];
        if (!tb.rail || !isSurface(tb) || degree(map, B) > 2) continue;
        if (degree(map, B) === 1 && links(map, B)[0].bit !== OPP[d]) continue;
        if (dsu.find(a) === dsu.find(B)) continue;
        // gap tiles (all but B) must be free or a perpendicular crossing
        const gaps = idx.slice(0, -1);
        if (!gaps.every((g, k) => gapOk(g, k < m ? axis : (1 | 2 | 4 | 8)))) continue;
        if (!gaps.every((g) => !isStationOrDepot(T[g]))) continue;
        // lay: chain A, gaps..., B
        const chain = [a, ...gaps, B];
        for (let k = 0; k + 1 < chain.length; k++) {
          const u = chain[k], v = chain[k + 1];
          const dx = (v % W) - (u % W), dy = Math.floor(v / W) - Math.floor(u / W);
          const b = stepBit(dx, dy);
          T[u].rail |= b; T[v].rail |= OPP[b];
        }
        for (const g of gaps) if (T[g].road) T[g].gradeSep = 1;
        dsu.union(a, B);
        bridged++;
        done = true;
        break;
      }
    }
  }
  return bridged;
}

/**
 * Restore baked rail lost to cleanup: for each surface dead end (not near a station/depot), BFS
 * (4-neighbour, max RESTORE_MAX steps) through tiles that are baked-rail in `bakedRail` and currently
 * free (no building, not water/tunnel) or road, to reach a surface rail tile of a DIFFERENT component.
 * Lay the path as rail (road tiles get plain rail bits; markGradeSeparation runs later). Components are
 * merged, so a restore never closes a cycle.
 * @param {object} map tile map
 * @param {string|null} bakedRail per-tile raster chars ('0' = none); null/short => no-op
 * @returns {number} dead ends restored
 */
export const RESTORE_MAX = tl(30);
export function restoreFromBake(map, bakedRail) {
  if (!bakedRail || bakedRail.length < map.tiles.length) return 0;
  const { width: W, height: H, tiles: T } = map;
  const dsu = makeDsu(T.length);
  for (let i = 0; i < T.length; i++) if (T[i].rail && isSurface(T[i])) for (const { j } of links(map, i)) dsu.union(i, j);
  const baked = (i) => bakedRail[i] !== '0' && bakedRail[i] !== undefined;
  const freeTile = (i) => !T[i].rail && !T[i].building && !T[i].tunnel && T[i].terrain !== 'water';
  const roadOnly = (i) => !T[i].rail && !T[i].building && !T[i].tunnel && T[i].terrain !== 'water' && !!T[i].road;
  let restored = 0;
  for (let a = 0; a < T.length; a++) {
    if (!T[a].rail || !isSurface(T[a]) || degree(map, a) !== 1 || nearStationRail(map, a, tl(2))) continue;
    const ca = dsu.find(a);
    const par = new Map([[a, -1]]);
    let frontier = [a], hit = -1;
    for (let step = 0; step < RESTORE_MAX && frontier.length && hit < 0; step++) {
      const next = [];
      for (const u of frontier) {
        const ux = u % W, uy = Math.floor(u / W);
        for (const b of BITS) {
          const d = DIR_BY_BIT[b], x = ux + d.dx, y = uy + d.dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const v = y * W + x;
          if (par.has(v)) continue;
          if (T[v].rail && isSurface(T[v]) && v !== a && dsu.find(v) !== ca && degree(map, v) <= 2) { par.set(v, u); hit = v; break; }
          if (!baked(v) || !(freeTile(v) || roadOnly(v))) continue;
          par.set(v, u); next.push(v);
        }
        if (hit >= 0) break;
      }
      frontier = next;
    }
    if (hit < 0) continue;
    const path = [];
    for (let c = hit; c !== -1; c = par.get(c)) path.push(c);
    path.reverse();
    for (let k = 0; k + 1 < path.length; k++) {
      const u = path[k], v = path[k + 1];
      const dx = (v % W) - (u % W), dy = Math.floor(v / W) - Math.floor(u / W);
      const b = dy === -1 ? 1 : dx === 1 ? 2 : dy === 1 ? 4 : 8;
      T[u].rail |= b; T[v].rail |= OPP[b];
    }
    for (const c of path) for (const { j } of links(map, c)) dsu.union(c, j);
    restored++;
  }
  return restored;
}

/**
 * R10a: remove surface rail components (no tunnel tile) that hold fewer than 2 stations/depots. Such a
 * piece cannot carry a service; it is a fragment or a line that ends in a field.
 * @returns {number} tiles cleared
 */
export function pruneIsolatedRail(map) {
  const seen = new Uint8Array(map.tiles.length);
  let cleared = 0;
  for (let s = 0; s < map.tiles.length; s++) {
    if (seen[s] || !map.tiles[s].rail) continue;
    const comp = [s]; seen[s] = 1;
    let stations = 0, tunnel = false, deadEnd = false;
    for (let k = 0; k < comp.length; k++) {
      const u = comp[k], tu = map.tiles[u];
      if (tu.tunnel) tunnel = true;
      if (isStationOrDepot(tu)) stations++;
      if (degree(map, u) === 1) deadEnd = true;
      for (const { j } of links(map, u)) if (!seen[j]) { seen[j] = 1; comp.push(j); }
    }
    // closed loops (no dead end) are kept: they are not fragments or branches ending in fields
    if (tunnel || stations >= 2 || !deadEnd) continue;
    for (const u of comp) map.tiles[u].rail = 0;
    cleared += comp.length;
  }
  return cleared;
}

/**
 * Clean surface rail in place: drop small-cycle rungs (Kruskal forest), prune short spurs,
 * clear dangling bits. Station, depot and tunnel tiles are never changed except their
 * mutual links to surface tiles, and connectivity between them is preserved.
 * @param {{map:object}} state game state holding state.map
 * @returns {{removedEdges:number,prunedTiles:number,smallCyclesBefore:number,smallCyclesAfter:number}}
 */
export function cleanRail(state, bakedRail = null) {
  const map = state.map;
  const smallCyclesBefore = countSmallCycles(map);
  const dangling = clearDangling(map);
  const edges = collectEdges(map);
  const dsu = makeDsu(map.tiles.length);
  const adj = new Map();
  const addAdj = (u, v) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push(v); };
  let removedEdges = 0;
  for (const e of edges) {
    if (dsu.find(e.a) !== dsu.find(e.b)) {
      dsu.union(e.a, e.b); addAdj(e.a, e.b); addAdj(e.b, e.a);
      continue;
    }
    const closesSmall = withinDistance(adj, e.a, e.b, SMALL_CYCLE);
    if (e.surf && closesSmall) {
      map.tiles[e.a].rail &= ~e.bit;
      map.tiles[e.b].rail &= ~OPP[e.bit];
      removedEdges++;
    } else {
      addAdj(e.a, e.b); addAdj(e.b, e.a);
    }
  }
  removedEdges += removeRedundantJunctionEdges(map);
  const bridged = bridgeGaps(map);
  const reconnected = globalThis.process?.env?.R8_RECON ? reconnectDeadEnds(map) : 0;
  const prunedTiles = pruneSpurs(map) + pruneStubs(map, tl(25));
  const isolated = pruneIsolatedRail(map);
  const restored = restoreFromBake(map, bakedRail);
  clearDangling(map);
  return { isolated, restored, bridged, reconnected, removedEdges, prunedTiles, smallCyclesBefore, smallCyclesAfter: countSmallCycles(map), danglingCleared: dangling };
}
