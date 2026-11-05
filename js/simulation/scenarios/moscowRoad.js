/**
 * Road cleanup for the Moscow scenario (R8a). Mirrors moscowRail.js: a Kruskal forest over the
 * road graph drops small cycles (figure-8 holes, 2x2 blocks, doubled parallel streets), spurs of
 * <= 2 tiles that serve nothing are pruned, and a doubled major avenue that collapses to one line is
 * flagged as a 4-lane highway (tile.highway) so it renders as one wide road.
 * Model: mutual 4-bit links (A has bit toward B and B the opposite bit). Edges touching building
 * tiles (houses, stations, depots, landmarks, industries) are never removed. Pure, deterministic.
 */
import { tl, TS } from './moscowScale.js';
import { DIRS, OPPOSITE } from '../constants.js';
const DIRS_BY_BIT = { 1: DIRS[0], 2: DIRS[1], 4: DIRS[2], 8: DIRS[3] };

const BITS = [1, 2, 4, 8];
/** Max path length (edges) between the ends of a road edge that closes a cycle we drop. */
export const ROAD_SMALL_CYCLE = tl(8);
/** Max dead-end spur length (tiles) pruned. */
export const ROAD_SPUR_MAX = tl(2);
const ALWAYS_KEEP = 1e6;
/** R10a: longest dead-end spur (tiles) pruned, iterated. */
const ROAD_SPUR_MAX_R10 = tl(5);
/** R10a: shortest parallel duplicate run (tiles) removed. */
const PAR_RUN_MIN = tl(4);

const hasBuilding = (t) => !!t.building;

/** Index of the mutual road neighbour of tile i across bit, or -1. */
function mutual(map, i, bit) {
  const { width: W, height: H, tiles } = map;
  if (!(tiles[i].road & bit)) return -1;
  const d = DIRS.find((q) => q.bit === bit);
  const x = (i % W) + d.dx, y = Math.floor(i / W) + d.dy;
  if (x < 0 || y < 0 || x >= W || y >= H) return -1;
  const j = y * W + x;
  return tiles[j].road & OPPOSITE[bit] ? j : -1;
}

/** Mutual road links of tile i: [{j,bit}]. */
function links(map, i) {
  const out = [];
  for (const bit of BITS) { const j = mutual(map, i, bit); if (j >= 0) out.push({ j, bit }); }
  return out;
}

/** Bounded BFS from a to b over adjacency lists; true when distance <= limit. */
function withinDistance(adj, a, b, limit) {
  let frontier = [a];
  const seen = new Set([a]);
  for (let d = 0; d < limit && frontier.length; d++) {
    const next = [];
    for (const u of frontier) {
      for (const v of adj.get(u) || []) {
        if (v === b) return true;
        if (seen.has(v)) continue;
        seen.add(v); next.push(v);
      }
    }
    frontier = next;
  }
  return false;
}

/** Undirected road edges [{a,b,bit,w}] in deterministic order; straight edges and avenues weigh more. */
function collectEdges(map) {
  const edges = [];
  map.tiles.forEach((t, a) => {
    if (!t.road) return;
    for (const bit of [2, 4]) {
      const b = mutual(map, a, bit);
      if (b < 0) continue;
      const keep = hasBuilding(t) || hasBuilding(map.tiles[b]);
      const major = (t.avenue || 0) + (map.tiles[b].avenue || 0);
      edges.push({ a, b, bit, w: keep ? ALWAYS_KEEP : 1 + major });
    }
  });
  edges.sort((p, q) => (q.w - p.w) || (p.a - q.a) || (p.b - q.b));
  return edges;
}

/** Union-find (path halving). */
function makeDsu(n) {
  const p = new Int32Array(n);
  for (let i = 0; i < n; i++) p[i] = i;
  return {
    find(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; },
    union(a, b) { p[this.find(a)] = this.find(b); },
  };
}

/** Number of surface road edges that close a cycle of length <= ROAD_SMALL_CYCLE (diagnostic). */
export function countSmallRoadCycles(map) {
  const adj = new Map();
  const add = (u, v) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push(v); };
  const edges = [];
  map.tiles.forEach((t, a) => {
    if (!t.road) return;
    for (const { j, bit } of links(map, a)) {
      add(a, j); add(j, a);
      if (bit === 2 || bit === 4) edges.push([a, j]);
    }
  });
  let n = 0;
  for (const [a, b] of edges) {
    const ra = adj.get(a), rb = adj.get(b);
    adj.set(a, ra.filter((v) => v !== b)); adj.set(b, rb.filter((v) => v !== a));
    if (withinDistance(adj, a, b, ROAD_SMALL_CYCLE)) n++;
    adj.set(a, ra); adj.set(b, rb);
  }
  return n;
}


/** Dir bit -> [dx,dy] step. */
const STEP = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };
const OPPB = { 1: 4, 2: 8, 4: 1, 8: 2 };
const idxOf = (map, x, y) => (x < 0 || y < 0 || x >= map.width || y >= map.height) ? -1 : y * map.width + x;
/** Tile step from i along bit, or -1 outside. */
const step = (map, i, bit) => idxOf(map, i % map.width + STEP[bit][0], Math.floor(i / map.width) + STEP[bit][1]);
/** Free for a new road corner: no road, building, water, rail, tunnel. */
const freeTile = (t) => !t.road && !t.building && !t.rail && !t.tunnel && t.terrain !== 'water';

const JOG_RUN_MAX = tl(4);
const isStraightArm = (t, d) => t.road === (d | OPPB[d]) && !t.building && !t.rail && !t.tunnel;

/**
 * Walk from a along da while tiles are straight (only the da/opposite arms, no building). Returns the
 * removable run tiles [a, ...straight] and the first non-straight tile e, or null.
 */
function runFrom(map, a, da) {
  const tiles = [a];
  let cur = a;
  for (;;) {
    const nxt = step(map, cur, da);
    if (nxt < 0 || !(map.tiles[cur].road & da) || !(map.tiles[nxt].road & OPPB[da])) return null;
    if (tiles.length < JOG_RUN_MAX && isStraightArm(map.tiles[nxt], da)) { tiles.push(nxt); cur = nxt; continue; }
    return { e: nxt, tiles };
  }
}

/**
 * Try to remove the S-bend between a and b (a--b along ab). a has arms {ab, da}; b has arms {OPP(ab), OPP(da)}.
 * The run from a along da (length u) is moved one tile sideways onto b's column, so the path becomes
 * e -> C0 -> ... -> C(u-1) -> b, a straight line. Endpoints e and b stay, so connectivity is kept.
 * Applied only when the global jog count decreases; otherwise reverted.
 * @returns {boolean} applied
 */
function tryShift(map, a, ab, da, before) {
  const b = step(map, a, ab);
  if (b < 0) return false;
  const ta = map.tiles[a], tb = map.tiles[b];
  if (ta.building || tb.building || tb.rail || tb.tunnel) return false;
  if (links(map, a).length !== 2 || links(map, b).length !== 2) return false;
  const db = OPPB[da];
  if (!(tb.road & db) || !(tb.road & OPPB[ab]) || !(ta.road & ab) || !(ta.road & da)) return false;
  const run = runFrom(map, a, da);
  if (!run) return false;
  const u = run.tiles.length;
  const e = map.tiles[run.e];
  if (e.building || e.rail || e.tunnel) return false;
  // new column tiles C_k = a + ab + (u-k)*da, k=0..u-1, must be free
  const cols = [];
  const ax = a % map.width, ay = Math.floor(a / map.width);
  const dA = DIRS_BY_BIT[da], dB = DIRS_BY_BIT[ab];
  for (let k = 0; k < u; k++) {
    const x = ax + dB.dx + (u - k) * dA.dx, y = ay + dB.dy + (u - k) * dA.dy;
    const j = idxOf(map, x, y);
    if (j < 0 || !freeTile(map.tiles[j])) return false;
    cols.push(j);
  }
  // snapshot for revert
  const touched = [...run.tiles, run.e, b, ...cols];
  const snap = touched.map((i) => ({ i, t: { ...map.tiles[i] } }));
  // apply
  for (const i of run.tiles) { delete map.tiles[i].avenue; const av = map.tiles[i].avenue; map.tiles[i].road = 0; void av; }
  const avenue = ta.avenue || 0, hwy = ta.highway;
  e.road = (e.road & ~OPPB[da]) | ab;
  cols.forEach((j, k) => {
    const t = map.tiles[j];
    t.road = (k === 0 ? OPPB[ab] : da) | db;
    if (avenue) t.avenue = avenue;
    if (hwy) t.highway = 1;
  });
  tb.road = (tb.road & ~OPPB[ab]) | da;
  const restore = () => { for (const { i, t } of snap) map.tiles[i] = t; };
  void before; void restore;
  return true;
}

/**
 * Straighten 1-tile S-bends (run, offset step, run) by shifting the shorter run sideways.
 * Deterministic scan; repeats while progress is made (bounded passes).
 * @returns {number} jogs removed
 */
export function straightenJogs(map) {
  let done = 0;
  for (let pass = 0; pass < 3; pass++) {
    let changed = 0;
    for (let a = 0; a < map.tiles.length; a++) {
      if (!map.tiles[a].road) continue;
      for (const ab of [2, 4]) {
        const b = step(map, a, ab);
        if (b < 0 || !(map.tiles[a].road & ab) || !(map.tiles[b].road & OPPB[ab])) continue;
        const ta = map.tiles[a];
        const da = [1, 2, 4, 8].find((d) => d !== ab && (ta.road & d));
        if (!da || (ab % 2) === (da % 2)) continue;
        if (tryShift(map, a, ab, da, 0) || tryShift(map, b, OPPB[ab], OPPB[da], 0)) { changed++; done++; }
      }
    }
    if (!changed) break;
  }
  return done;
}

/** Count S-bend jog patterns (diagnostic, same test as straightenJogs without the free-corner check). */
export function countJogs(map) {
  let n = 0;
  for (let a = 0; a < map.tiles.length; a++) {
    if (!map.tiles[a].road) continue;
    for (const ab of [2, 4]) {
      const b = step(map, a, ab);
      if (b < 0 || !(map.tiles[a].road & ab) || !(map.tiles[b].road & OPPB[ab])) continue;
      const ta = map.tiles[a], tb = map.tiles[b];
      if (links(map, a).length !== 2 || links(map, b).length !== 2) continue;
      const da = [1, 2, 4, 8].find((d) => d !== ab && (ta.road & d));
      if (!da || (ab % 2) === (da % 2)) continue;
      const db = OPPB[da];
      if (tb.road & db) n++;
    }
  }
  return n;
}

/** Remove a road edge (both sides). */
function cut(map, a, b, bit) {
  map.tiles[a].road &= ~bit;
  map.tiles[b].road &= ~OPPOSITE[bit];
}


/**
 * R10a: prune dead-end road spurs (<= ROAD_SPUR_MAX_R10 tiles) that serve nothing, iterated to a fixpoint.
 * A spur is a chain of building-free tiles from a leaf ending at a junction; a chain whose end touches a
 * building (house, station, landmark) is kept because it serves that building.
 * @returns {number} tiles removed
 */
function pruneDeadSpurs(map) {
  let removed = 0;
  for (let round = 0; round < 20; round++) {
    let changed = 0;
    for (let i = 0; i < map.tiles.length; i++) {
      const t = map.tiles[i];
      if (!t.road || hasBuilding(t) || links(map, i).length !== 1) continue;
      const chain = [i];
      let prev = -1, cur = i, attach = -1;
      for (;;) {
        const next = links(map, cur).filter((l) => l.j !== prev);
        if (next.length !== 1) break;
        const j = next[0].j;
        if (hasBuilding(map.tiles[j])) break;
        if (links(map, j).length >= 3) { attach = j; break; }
        if (chain.length >= ROAD_SPUR_MAX_R10) break;
        chain.push(j); prev = cur; cur = j;
      }
      if (attach < 0) continue;
      // a spur whose leaf touches a building still serves that building
      if ([1, 2, 4, 8].some((b) => { const k = step(map, i, b); return k >= 0 && hasBuilding(map.tiles[k]); })) continue;
      for (const c of chain) {
        for (const { j, bit } of links(map, c)) cut(map, c, j, bit);
        map.tiles[c].road = 0;
        removed++; changed++;
      }
    }
    if (!changed) break;
  }
  return removed;
}

const isStationLike = (t) => !!t.building && (t.building.type === 'station' || t.building.type === 'depot');

/**
 * R10a: true when road tile i has a surface rail or an unlinked road in its 8-neighbourhood, i.e. it
 * runs beside another line (a doubled corridor) rather than being the only street here.
 */
function shadowedTile(map, i) {
  const W = map.width, H = map.height, x = i % W, y = Math.floor(i / W);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const tj = map.tiles[ny * W + nx];
    if (tj.rail && !tj.tunnel && !isStationLike(tj)) return true;
    if (tj.road && !(dx === 0 || dy === 0)) return true; // diagonal road: a doubled street
  }
  return false;
}

/** Bounded check: every tile in ends[] is reachable from ends[0] without passing through comp. */
function staysConnected(map, comp, ends) {
  const inComp = new Set(comp);
  const seen = new Set([ends[0]]);
  const q = [ends[0]];
  const want = new Set(ends.slice(1));
  while (q.length && want.size) {
    const u = q.pop();
    want.delete(u);
    for (const { j } of links(map, u)) {
      if (inComp.has(j) || seen.has(j)) continue;
      seen.add(j); q.push(j);
    }
  }
  return want.size === 0;
}

/**
 * R10a: remove long parallel duplicate runs. A run is a connected set of surface road tiles (no
 * building, no tunnel, not an avenue/highway) with each tile shadowed by a neighbouring rail or road,
 * at least PAR_RUN_MIN tiles long, with exactly two outside ends. Removed only when the two ends stay
 * connected through the rest of the road graph.
 * @returns {{runs:number,tiles:number}}
 */
function removeParallelRuns(map) {
  const cand = new Uint8Array(map.tiles.length);
  map.tiles.forEach((t, i) => {
    if (!t.road || t.tunnel || hasBuilding(t) || t.highway || (t.avenue || 0) >= 1) return;
    if (links(map, i).length > 2) return;
    if (!shadowedTile(map, i)) return;
    for (const bit of BITS) { const j = step(map, i, bit); if (j >= 0 && hasBuilding(map.tiles[j])) return; }
    cand[i] = 1;
  });
  const seen = new Uint8Array(map.tiles.length);
  let runs = 0, tiles = 0;
  for (let s = 0; s < map.tiles.length; s++) {
    if (!cand[s] || seen[s]) continue;
    const comp = [s]; seen[s] = 1;
    for (let k = 0; k < comp.length; k++) {
      for (const { j } of links(map, comp[k])) if (cand[j] && !seen[j]) { seen[j] = 1; comp.push(j); }
    }
    if (comp.length < PAR_RUN_MIN) continue;
    const inComp = new Set(comp);
    const ends = [...new Set(comp.flatMap((c) => links(map, c).map((l) => l.j)).filter((j) => !inComp.has(j)))];
    if (ends.length !== 2) continue;
    if (!staysConnected(map, comp, ends)) continue;
    for (const c of comp) {
      for (const { j, bit } of links(map, c)) cut(map, c, j, bit);
      map.tiles[c].road = 0;
    }
    runs++; tiles += comp.length;
  }
  return { runs, tiles };
}

/**
 * Clean surface roads in place: break small cycles (Kruskal forest over edges; buildings' edges are
 * always kept), prune dead-end spurs, and flag collapsed doubled major avenues as 4-lane highways.
 * @param {{map:object}} state
 * @returns {{removedEdges:number,prunedTiles:number,collapsed:number,flaggedHighway:number,smallCyclesBefore:number,smallCyclesAfter:number}}
 */
export function cleanRoad(state) {
  const map = state.map;
  const smallCyclesBefore = countSmallRoadCycles(map);
  // tiles of 2x2 road blocks (doubled parallel streets) before cleanup: candidates for highway flag
  const doubled = new Set();
  const W = map.width, H = map.height;
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const ids = [y * W + x, y * W + x + 1, (y + 1) * W + x, (y + 1) * W + x + 1];
    if (ids.every((k) => map.tiles[k].road)) ids.forEach((k) => doubled.add(k));
  }
  const edges = collectEdges(map);
  const dsu = makeDsu(map.tiles.length);
  const adj = new Map();
  const addAdj = (u, v) => { if (!adj.has(u)) adj.set(u, []); adj.get(u).push(v); };
  let removedEdges = 0, collapsed = 0;
  const touched = new Set();
  for (const e of edges) {
    if (dsu.find(e.a) !== dsu.find(e.b)) {
      dsu.union(e.a, e.b); addAdj(e.a, e.b); addAdj(e.b, e.a);
      continue;
    }
    if (e.w < ALWAYS_KEEP && withinDistance(adj, e.a, e.b, ROAD_SMALL_CYCLE)) {
      cut(map, e.a, e.b, e.bit);
      removedEdges++;
      if (doubled.has(e.a) && doubled.has(e.b)) { collapsed++; touched.add(e.a); touched.add(e.b); }
    } else {
      addAdj(e.a, e.b); addAdj(e.b, e.a);
    }
  }
  const par = removeParallelRuns(map);
  const prunedTiles = pruneDeadSpurs(map);
  const jogsStraightened = 0; // straightenJogs(map): disabled, net-increases jogs (see R8a report)
  // a collapsed doubled avenue becomes one wide road: flag its major surviving tiles as highway
  let flaggedHighway = 0;
  for (const i of touched) {
    const t = map.tiles[i];
    if (!t.road || t.highway === 1 || (t.avenue || 0) < 2) continue;
    t.highway = 1; flaggedHighway++;
  }
  // a tile that lost its road must not keep road-only flags (avenue class / highway)
  for (const t of map.tiles) if (!t.road) { delete t.avenue; delete t.highway; }
  return { removedEdges, parallelRuns: par.runs, parallelTiles: par.tiles, prunedTiles, collapsed, flaggedHighway, jogsStraightened, jogsAfter: countJogs(map), smallCyclesBefore, smallCyclesAfter: countSmallRoadCycles(map) };
}

/**
 * Road geometry metrics (same definitions as scratchpad/r8/probe.mjs).
 * @returns {{road:number,roadJ3:number,roadJ4:number,roadBlocks2x2:number,roadRingHoles1:number,components:number}}
 */
export function roadMetrics(map) {
  const W = map.width, H = map.height;
  const pc = (b) => { let c = 0; while (b) { c += b & 1; b >>= 1; } return c; };
  let road = 0, j3 = 0, j4 = 0;
  map.tiles.forEach((t) => { if (!t.road) return; road++; const k = pc(t.road); if (k === 3) j3++; if (k === 4) j4++; });
  let blocks = 0;
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = map.tiles[y * W + x], b = map.tiles[y * W + x + 1];
    const c = map.tiles[(y + 1) * W + x], d = map.tiles[(y + 1) * W + x + 1];
    if (a.road && b.road && c.road && d.road) blocks++;
  }
  let holes = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (map.tiles[y * W + x].road) continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && map.tiles[(y + dy) * W + x + dx].road) n++;
    if (n === 8) holes++;
  }
  // connected components of the road graph
  const seen = new Uint8Array(W * H);
  let components = 0;
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !map.tiles[s].road) continue;
    components++;
    const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      for (const { j } of links(map, i)) if (!seen[j]) { seen[j] = 1; stack.push(j); }
    }
  }
  return { road, roadJ3: j3, roadJ4: j4, roadBlocks2x2: blocks, roadRingHoles1: holes, roadJogs: countJogs(map), components };
}
