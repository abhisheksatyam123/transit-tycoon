/**
 * Intercity road network at generation and town road repair.
 * Routes are found by deterministic A* over terrain (no RNG use).
 */
import { linkTiles } from './network.js';
import { labelComponents, labelComponentsAll } from './diagIssue.js';
import { TOWN_CORE_RADIUS } from './diagChecksMap.js';

const ROAD_COST = 0.4;

/** Min-heap of [priority, index] pairs stored in parallel arrays. */
class Heap {
  constructor() { this.p = []; this.v = []; }
  get size() { return this.p.length; }
  push(prio, val) {
    let i = this.p.push(prio) - 1; this.v.push(val);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.p[par] <= this.p[i]) break;
      [this.p[par], this.p[i]] = [this.p[i], this.p[par]];
      [this.v[par], this.v[i]] = [this.v[i], this.v[par]];
      i = par;
    }
  }
  pop() {
    const top = this.v[0];
    const lp = this.p.pop(), lv = this.v.pop();
    if (this.p.length) {
      this.p[0] = lp; this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.p.length && this.p[l] < this.p[m]) m = l;
        if (r < this.p.length && this.p[r] < this.p[m]) m = r;
        if (m === i) break;
        [this.p[m], this.p[i]] = [this.p[i], this.p[m]];
        [this.v[m], this.v[i]] = [this.v[i], this.v[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Step cost of entering a tile (roads are cheap, forest/rock and slopes dear). */
function stepCost(t, prev) {
  let c = t.road ? ROAD_COST : 1;
  if (t.terrain === 'forest') c += 1;
  else if (t.terrain === 'rock') c += 2;
  c += Math.abs(t.height - prev.height) * 0.5;
  return c;
}

/** True if a road may pass through this tile. */
function passable(t) {
  // player tunnel runs and bridge decks are not open ground: towns never pave through them
  return t.terrain !== 'water' && !t.building && !t.rail && !t.playerTunnel && !t.playerBridge && t.bridgeDeck === undefined;
}

/** Extra cost of a 90 degree turn: long straight legs are preferred. */
const TURN_COST = 2;
const DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * A* over (tile, heading, run) states. A turn is only allowed after at least
 * minRun straight steps, so a path with minRun 2 has no 1-tile staircases.
 * Reversing is never allowed. Existing roads are cheap to reuse.
 *
 * Known limitation (decision D22): the run bit never becomes 1 on a straight step (`run === 1 ? 1 : 0`
 * at the nrun computation), so a turn is never legal and the search only returns straight lines.
 * `loco/townGrow` compensates with `bfsRoadPath` when this returns null. Fixing the bookkeeping changes
 * town growth and therefore the world hash, so it is a user decision (opt-in toggle or a re-pinned
 * hash), not a silent change; rival freight uses its own BFS planner for the same reason.
 * @param {object} map
 * @param {{x:number,y:number}[]} sources
 * @param {Set<number>} goals tile indices
 * @param {{x:number,y:number}} target point used for the heuristic
 * @param {(x:number,y:number)=>boolean} allowed extra spatial restriction
 * @param {number} minRun straight steps needed before a turn
 * @returns {{x:number,y:number}[]|null} path from a source to a goal (inclusive)
 */
export function findRoadPath(map, sources, goals, target, allowed = () => true, minRun = 2) {
  const { width: W, height: H, tiles } = map;
  const N = W * H;
  // state = tile*10 + heading*2 + run; heading 4 = no heading yet (a source); run 1 = enough straight steps
  const SN = N * 10;
  const g = new Float64Array(SN).fill(Infinity);
  const parent = new Int32Array(SN).fill(-1);
  const closed = new Uint8Array(SN);
  const heap = new Heap();
  const h = (i) => 0.4 * (Math.abs((i % W) - target.x) + Math.abs(Math.floor(i / W) - target.y));
  for (const s of sources) {
    const i = s.y * W + s.x;
    const st = i * 10 + 8;
    g[st] = 0;
    heap.push(h(i), st);
  }
  while (heap.size) {
    const st = heap.pop();
    if (closed[st]) continue;
    closed[st] = 1;
    const i = Math.floor(st / 10), code = st - i * 10;
    const hd = code >> 1, run = code & 1;
    if (goals.has(i)) {
      const out = [];
      for (let c = st; c !== -1; c = parent[c]) {
        const ti = Math.floor(c / 10);
        out.push({ x: ti % W, y: Math.floor(ti / W) });
      }
      return out.reverse();
    }
    const x = i % W, y = Math.floor(i / W);
    const cur = tiles[i];
    for (let nd = 0; nd < 4; nd++) {
      if (hd < 4 && nd === (hd + 2) % 4) continue;
      const turn = hd < 4 && nd !== hd;
      if (turn && run === 0) continue;
      const nx = x + DIRS4[nd][0], ny = y + DIRS4[nd][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !allowed(nx, ny)) continue;
      const j = ny * W + nx;
      const t = tiles[j];
      if (!passable(t) || Math.abs(t.height - cur.height) > 1) continue;
      const nrun = (turn || hd === 4) ? 0 : (run === 1 ? 1 : 0);
      const ns = j * 10 + nd * 2 + nrun;
      if (closed[ns]) continue;
      const ng = g[st] + stepCost(t, cur) + (turn ? TURN_COST : 0);
      if (ng < g[ns]) {
        g[ns] = ng;
        parent[ns] = st;
        heap.push(ng + h(j), ns);
      }
    }
  }
  return null;
}

/**
 * Lay a road along a path: link consecutive tiles, claim them for the town
 * and flatten forest/rock to grass.
 * @param {object} state
 * @param {{x:number,y:number}[]} path
 */
export function layRoadPath(state, path) {
  const { map } = state;
  for (let k = 0; k < path.length; k++) {
    const p = path[k];
    const t = map.tiles[p.y * map.width + p.x];
    if (t.terrain === 'forest' || t.terrain === 'rock') t.terrain = 'grass';
    if (!t.road && !t.owner) t.owner = 'town';
    if (k > 0) linkTiles(map, 'road', path[k - 1].x, path[k - 1].y, p.x, p.y);
  }
}

/** Road tile indices of a town's core. */
function coreRoadTiles(map, town) {
  const R2 = TOWN_CORE_RADIUS * TOWN_CORE_RADIUS;
  const out = [];
  for (let y = town.y - TOWN_CORE_RADIUS; y <= town.y + TOWN_CORE_RADIUS; y++) {
    for (let x = town.x - TOWN_CORE_RADIUS; x <= town.x + TOWN_CORE_RADIUS; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      if ((x - town.x) ** 2 + (y - town.y) ** 2 > R2) continue;
      if (map.tiles[y * map.width + x].road) out.push({ x, y });
    }
  }
  return out;
}

/** Connect two towns by road if they are not already on one network. */
function linkPair(state, a, b) {
  const { map } = state;
  const labels = labelComponentsAll(map, 'road');
  const la = labels[a.y * map.width + a.x], lb = labels[b.y * map.width + b.x];
  if (la >= 0 && la === lb) return true;
  const sources = coreRoadTiles(map, a);
  const goals = new Set(coreRoadTiles(map, b).map((p) => p.y * map.width + p.x));
  if (!sources.length || !goals.size) return false;
  const path = findRoadPath(map, sources, goals, b);
  if (!path) return false;
  layRoadPath(state, path);
  return true;
}

/**
 * Road every town to its nearest town, then join the remaining towns by a
 * minimum spanning tree (Kruskal over Manhattan distance).
 * @returns {number} number of links built
 */
export function connectTowns(state) {
  const towns = state.towns;
  let built = 0;
  for (const a of towns) {
    let near = null, bd = Infinity;
    for (const o of towns) {
      if (o === a) continue;
      const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2;
      if (d < bd) { bd = d; near = o; }
    }
    if (near && linkPair(state, a, near)) built++;
  }
  const edges = [];
  for (let i = 0; i < towns.length; i++) for (let j = i + 1; j < towns.length; j++) {
    edges.push({ a: towns[i], b: towns[j], d: Math.abs(towns[i].x - towns[j].x) + Math.abs(towns[i].y - towns[j].y) });
  }
  edges.sort((p, q) => p.d - q.d || p.a.id - q.a.id || p.b.id - q.b.id);
  for (const e of edges) if (linkPair(state, e.a, e.b)) built++;
  return built;
}

/**
 * Join every road piece of a town core to the piece holding the centre, using
 * short A* roads inside the core. Labels use the same core-restricted graph as
 * the town-roads-split diagnostic, so a piece is only "split" if it is.
 * @returns {number} links laid
 */
export function repairTownRoads(state) {
  const { map } = state;
  let laid = 0;
  const R2 = TOWN_CORE_RADIUS * TOWN_CORE_RADIUS;
  for (const town of state.towns) {
    const inCore = (x, y) => (x - town.x) ** 2 + (y - town.y) ** 2 <= R2;
    const labels = labelComponents(map, 'road', inCore);
    const core = coreRoadTiles(map, town);
    if (!core.length) continue;
    const centre = labels[town.y * map.width + town.x];
    if (centre < 0) continue;
    const pieces = new Map();
    for (const p of core) {
      const l = labels[p.y * map.width + p.x];
      if (l < 0 || l === centre) continue;
      if (!pieces.has(l)) pieces.set(l, []);
      pieces.get(l).push(p);
    }
    for (const tiles of pieces.values()) {
      const goals = new Set();
      for (const p of core) if (labels[p.y * map.width + p.x] === centre) goals.add(p.y * map.width + p.x);
      const path = findRoadPath(map, tiles, goals, town, inCore);
      if (path) { layRoadPath(state, path); laid++; }
    }
  }
  return laid;
}
