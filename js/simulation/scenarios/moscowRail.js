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
import { DIR_BY_BIT } from '../constants.js';

/** Rail bits: N=1, E=2, S=4, W=8. */
const OPP = { 1: 4, 2: 8, 4: 1, 8: 2 };
const BITS = [1, 2, 4, 8];
/** Max path length (edges) kept between two tiles that closes a cycle we drop. */
export const SMALL_CYCLE = 24;
/** Max spur length (tiles) removed as a dead end. */
export const SPUR_MAX = 3;
const STRAIGHT_CAP = 8;
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

/**
 * Clean surface rail in place: drop small-cycle rungs (Kruskal forest), prune short spurs,
 * clear dangling bits. Station, depot and tunnel tiles are never changed except their
 * mutual links to surface tiles, and connectivity between them is preserved.
 * @param {{map:object}} state game state holding state.map
 * @returns {{removedEdges:number,prunedTiles:number,smallCyclesBefore:number,smallCyclesAfter:number}}
 */
export function cleanRail(state) {
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
  const prunedTiles = pruneSpurs(map);
  clearDangling(map);
  return { removedEdges, prunedTiles, smallCyclesBefore, smallCyclesAfter: countSmallCycles(map), danglingCleared: dangling };
}
