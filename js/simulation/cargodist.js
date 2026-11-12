/**
 * Cargo distribution (OpenTTD linkgraph / cargodist, simplified) for passengers and mail.
 *
 * Setting `cargodist`: 'off' (default, nothing here runs and no state is created) | 'asymmetric' | 'symmetric'.
 *
 * - Link graph per cargo (state.cargoDist[cargo]): nodes are stations, directed edges are consecutive order
 *   pairs of vehicles carrying the cargo. Edge capacity = seats offered per month (refreshed monthly);
 *   an edge expires when no vehicle has used it for EDGE_EXPIRE_MONTHS months.
 * - Demand (OpenTTD demands.cpp, simplified): supply of a source is spread over the nodes reachable from it,
 *   proportional to each destination's supply. Symmetric: each pair uses the mean of both directions.
 * - Routing (OpenTTD MCF first pass, simplified): one Dijkstra per source over edge distance; the result is a
 *   next hop table (nh[station][dest]) and the demand shares (dem[station] = [dest, share]).
 * - Packets: a station generating passengers/mail splits them over destinations by demand (parcel.dest).
 *   Vehicles only load parcels whose next hop is their next stop; unloading delivers at the destination
 *   and transfers parcels whose route leaves the vehicle here (orders.js).
 *
 * Simplifications vs OpenTTD: no capacity-constrained MCF (demand is not throttled by edge capacity), a single
 * path per (source, destination) instead of a multi-path split, the monthly rebuild instead of the
 * incremental job scheduler (OpenTTD default cadence is every 4 days with 16-day recalc_time; TT is monthly, known gap, see GAPS.md). The link graph is drawn by the link overlay (renderer/layers/linkOverlay.js, hotkey ,).
 */
import { getSetting } from './settings.js';
import { manhattan } from './state.js';
import { dayNumber } from './date.js';
import { CARGOS } from '../config/cargos.js';
import { catchmentTiles, tileAcceptance } from './stations.js';
import { ACCEPT_THRESHOLD } from './constants.js';

/**
 * OpenTTD DistanceMaxPlusManhattan + 1 between two station positions (dx + dy + max(dx, dy) + 1), the edge
 * metric of OpenTTD's MCF solver. Used only by the opt-in capacity routing paths (settings cargodistMcf /
 * cargodistCapacityRouting); with both off the routing tree keeps plain manhattan, so default behaviour is unchanged.
 * @param {[number,number]} a @param {[number,number]} b
 */
export function ottdDistance(a, b) {
  const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
  return dx + dy + Math.max(dx, dy) + 1;
}

/** Passenger / mail cargos (cargodist setting, OpenTTD symmetric/asymmetric demand). */
export const CD_CARGOS = ['PASS', 'MAIL'];
/** Freight cargos (setting freightDistribution = asymmetric): OpenTTD asymmetric demand. */
export const FREIGHT_CARGOS = CARGOS.map((c) => c.id).filter((id) => !CD_CARGOS.includes(id));
/** Months without any vehicle using an edge before it is removed. */
export const EDGE_EXPIRE_MONTHS = 3;

/** @returns {'off'|'asymmetric'|'symmetric'} */
export function cargodistMode(state) {
  const m = getSetting(state, 'cargodist');
  return m === 'asymmetric' || m === 'symmetric' ? m : 'off';
}

export function cargodistOn(state) {
  return cargodistMode(state) !== 'off';
}

/** @returns {'manual'|'asymmetric'} freight distribution mode (setting freightDistribution). */
export function freightMode(state) {
  return getSetting(state, 'freightDistribution') === 'asymmetric' ? 'asymmetric' : 'manual';
}

/** Capacity-constrained routing (OpenTTD MCF passes) on (setting cargodistMcf). */
export function cdMcfOn(state) {
  return getSetting(state, 'cargodistMcf') === true;
}

/** OpenTTD-style batched capacity routing on (setting cargodistCapacityRouting, off by default). */
export function cdCapacityRoutingOn(state) {
  return getSetting(state, 'cargodistCapacityRouting') === true;
}

/** Days between link graph job starts (setting linkgraphIntervalDays; 0 = month schedule, the default). */
export function linkgraphIntervalDays(state) {
  return Math.max(0, Math.round(getSetting(state, 'linkgraphIntervalDays') || 0));
}

/** Minimum days a job runs before it is applied (setting linkgraphTimeDays; 0 = apply at once). */
export function linkgraphTimeDays(state) {
  return Math.max(0, Math.round(getSetting(state, 'linkgraphTimeDays') || 0));
}

/**
 * Distribution of one cargo (OpenTTD linkgraph distribution_pax / distribution_mail / distribution_default).
 * pax and mail: setting linkgraphDistributionPax/Mail ('follow' = the cargodist setting); other freight:
 * freightDistribution. @returns {'manual'|'asymmetric'|'symmetric'}
 */
export function cdMode(state, cargoId) {
  if (CD_CARGOS.includes(cargoId)) {
    // the cargodist setting is the master switch for pax/mail; the per-class setting overrides its mode
    if (!cargodistOn(state)) return 'manual';
    const o = getSetting(state, cargoId === 'PASS' ? 'linkgraphDistributionPax' : 'linkgraphDistributionMail');
    if (o === 'manual' || o === 'asymmetric' || o === 'symmetric') return o;
    return cargodistMode(state);
  }
  return freightMode(state);
}

/** Cargos that currently have a link graph: every cargo whose distribution is not manual. */
export function cdCargoList(state) {
  return [...CD_CARGOS, ...FREIGHT_CARGOS].filter((c) => cdApplies(state, c));
}

/** Whether the distribution applies to this cargo (its distribution is not manual). */
export function cdApplies(state, cargoId) {
  if (!CD_CARGOS.includes(cargoId) && !FREIGHT_CARGOS.includes(cargoId)) return false;
  return cdMode(state, cargoId) !== 'manual';
}

/** Link graph settings (OpenTTD LinkGraphSettings, mapped to our model; see settings.js). */
export function demandSizeExponent(state) { return getSetting(state, 'linkgraphDemandSize') / 100; }
export function demandDistanceK(state) { return getSetting(state, 'linkgraphDemandDistance') / 100; }
/** Augmenting paths per demand pair (OpenTTD accuracy: flow per push = demand / accuracy, so paths = accuracy / 2). */
export function mcfAugment(state) { return Math.max(1, Math.round(getSetting(state, 'linkgraphAccuracy') / 2)); }
/** Percent of each edge's capacity the first MCF pass may use (OpenTTD short_path_saturation). */
export function mcfSaturation(state) { return Math.min(100, Math.max(1, getSetting(state, 'linkgraphShortPathSaturation'))); }

/** Lazily created link graph of a cargo. */
export function ensureGraph(state, cargoId) {
  if (!state.cargoDist) state.cargoDist = {};
  let g = state.cargoDist[cargoId];
  if (!g) {
    g = { month: 0, edges: {}, dem: {}, nh: {}, nodes: [] };
    state.cargoDist[cargoId] = g;
  }
  return g;
}

/** Edge key for a directed station pair. */
export function edgeKey(a, b) { return a + '>' + b; }

/**
 * A vehicle leaves station `st` for station `nextId` carrying `slices` ([{cargoId, capacity}]).
 * Adds the seats to the link-graph edge of each distributed cargo.
 */
export function noteLeg(state, st, nextId, slices) {
  if (nextId == null || nextId === st.id) return;
  for (const s of slices) {
    if (!cdApplies(state, s.cargoId) || !(s.capacity > 0)) continue;
    const g = ensureGraph(state, s.cargoId);
    const k = edgeKey(st.id, nextId);
    let e = g.edges[k];
    if (!e) e = g.edges[k] = { a: st.id, b: nextId, cap: 0, used: 0, last: g.month };
    e.used += s.capacity;
    e.last = g.month;
  }
}

/** Station ids a parcel with `dest` can be routed to from `fromId` (next hop), or undefined if unknown. */
export function nextHop(state, cargoId, fromId, dest) {
  const g = state.cargoDist && state.cargoDist[cargoId];
  if (!g || dest == null) return undefined;
  const row = g.nh[fromId];
  return row ? row[dest] : undefined;
}

/**
 * All first hops a parcel may take from `fromId` to `dest` (MCF: every hop carrying flow; otherwise the single
 * shortest-path hop). undefined when no route is known.
 * @returns {number[]|undefined}
 */
export function nextHops(state, cargoId, fromId, dest) {
  const g = state.cargoDist && state.cargoDist[cargoId];
  if (!g || dest == null) return undefined;
  const flows = g.nhs && g.nhs[fromId] && g.nhs[fromId][dest];
  if (flows && flows.length) return flows.map((f) => f[0]);
  const h = nextHop(state, cargoId, fromId, dest);
  return h === undefined ? undefined : [h];
}

/**
 * Split an amount generated at a station over the destinations of its demand (largest remainder).
 * @returns {{dest:number|undefined, amount:number}[]} one entry per destination (dest undefined = no route known)
 */
export function splitByDest(state, st, cargoId, amount) {
  const g = state.cargoDist && state.cargoDist[cargoId];
  const row = g && g.dem[st.id];
  if (!row || !row.length || amount <= 0) return [{ dest: undefined, amount }];
  const raw = row.map(([d, share]) => ({ dest: d, exact: amount * share, amount: Math.floor(amount * share) }));
  let left = amount - raw.reduce((n, r) => n + r.amount, 0);
  const order = raw.map((r, i) => i).sort((i, j) => (raw[j].exact - raw[j].amount) - (raw[i].exact - raw[i].amount) || i - j);
  for (let k = 0; left > 0 && k < order.length; k++, left--) raw[order[k]].amount++;
  return raw.filter((r) => r.amount > 0).map((r) => ({ dest: r.dest, amount: r.amount }));
}

/** Count supply generated at a station (drives next month's demand). Lazy field st.cdSupply. */
export function noteSupply(st, cargoId, amount) {
  if (amount <= 0) return;
  if (!st.cdSupply) st.cdSupply = {};
  st.cdSupply[cargoId] = (st.cdSupply[cargoId] || 0) + amount;
}

/**
 * Load filter for a vehicle leaving toward `nextId`: a parcel is loaded when it has no destination yet,
 * its next hop from here is `nextId`, or no route is known (never strand cargo). A parcel with a flow via
 * (p.via, assigned when generated by splitVia) is loaded only by the vehicle going to that via.
 */
export function loadFilter(state, st, cargoId, nextId) {
  if (nextId == null || nextId === st.id) return undefined;
  return (p) => p.dest == null || (() => {
    const flows = flowsOf(state, cargoId, st.id, p.dest);
    if (flows && flows.length > 1) {
      if (p.via === undefined || !flows.some((f) => f[0] === p.via)) p.via = assignVia(state, cargoId, st, flows, p.amount, p.dest);
      return p.via === nextId;
    }
    const hs = nextHops(state, cargoId, st.id, p.dest);
    return hs === undefined || hs.includes(nextId);
  })();
}

/** Flow table of (from, dest): [[hop, share], ...] sorted by hop id, or undefined (single/no route). */
function flowsOf(state, cargoId, fromId, dest) {
  const g = state.cargoDist && state.cargoDist[cargoId];
  return g && g.nhs && g.nhs[fromId] && g.nhs[fromId][dest];
}

/**
 * Split `amount` units generated at `st` for `dest` over the flow vias of (st, dest) (OpenTTD FlowStat::GetVia):
 * each unit goes to the via with the largest share deficit (share * (sent + 1) - sent, ties: lowest hop id), so
 * the long-run ratio follows the shares exactly. Counters live in graph.sent (lazy). Deterministic, no randomness.
 * @returns {{via:number|undefined, amount:number}[]} [{via: undefined, amount}] when the destination has one route
 */
export function splitVia(state, st, cargoId, dest, amount) {
  const flows = flowsOf(state, cargoId, st.id, dest);
  if (!flows || flows.length < 2 || !(amount > 0)) return [{ via: undefined, amount }];
  const got = new Map();
  for (let u = 0; u < amount; u++) {
    const h = assignVia(state, cargoId, st, flows, 1, dest);
    got.set(h, (got.get(h) || 0) + 1);
  }
  return [...got.entries()].map(([via, n]) => ({ via, amount: n })).sort((a, b) => a.via - b.via);
}

/** Pick the via for `amount` units and record them in the sent counters of (st, dest). */
function assignVia(state, cargoId, st, flows, amount, dest) {
  const g = ensureGraph(state, cargoId);
  if (!g.sent) g.sent = {};
  const key = edgeKey(st.id, dest ?? null);
  const row = g.sent[key] || (g.sent[key] = {});
  let total = 0;
  for (const h of Object.keys(row)) total += row[h];
  let best = null, bestDef = -Infinity;
  for (const [h, share] of flows) {
    const def = share * (total + amount) - (row[h] || 0);
    if (def > bestDef + 1e-12) { best = h; bestDef = def; }
  }
  row[best] = (row[best] || 0) + amount;
  return best;
}

/** Binary min-heap of [key, node] pairs (Dijkstra frontier). */
function heapPush(h, item) {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p][0] <= h[i][0]) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}
function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
  return top;
}

/**
 * Dijkstra from one source over the directed edges (heap frontier, O(E log V)).
 * Distances are manhattan distances between station positions by default (1 when a position is unknown);
 * `metric` overrides the edge length (opt-in capacity routing passes ottdDistance).
 * @returns {{dist:Map<number,number>, first:Map<number,number>, prev:Map<number,number>}}
 */
function shortest(src, adj, pos, metric = null) {
  const dist = new Map([[src, 0]]), first = new Map(), prev = new Map();
  const done = new Set();
  const heap = [[0, src]];
  while (heap.length) {
    const [best, u] = heapPop(heap);
    if (done.has(u)) continue;
    done.add(u);
    const pu = pos.get(u);
    for (const v of adj.get(u) || []) {
      const pv = pos.get(v);
      const d = best + (pu && pv ? (metric ? metric(pu, pv) : manhattan(pu[0], pu[1], pv[0], pv[1])) : 1);
      if (!dist.has(v) || d < dist.get(v)) {
        dist.set(v, d);
        prev.set(v, u);
        first.set(v, u === src ? v : first.get(u));
        heapPush(heap, [d, v]);
      }
    }
  }
  return { dist, first, prev };
}

/** Augmenting paths per demand pair in the capacity-constrained first pass (simplification: OTTD runs to saturation). */
const MCF_AUGMENT = 8;

/**
 * OpenTTD MCF (simplified). First pass: demand pairs in order of their unconstrained distance (ties by ids); each
 * pair sends flow along the shortest path over edges with residual capacity, up to MCF_AUGMENT paths or until the
 * bottleneck saturates. Second pass: the remaining demand takes the unconstrained shortest path (ignores capacity).
 * @param {{s:number,d:number,amt:number,dist:number}[]} pairs
 * @param {Map<number,number[]>} adj
 * @param {Map<string,number>} capMap edge key -> capacity per month
 * @param {Map<number,object>} trees shortest-path trees (second pass)
 * @returns {Map<string, Map<number,number>>} 's>d' -> (first hop -> units)
 */
function mcfFlows(pairs, adj, capMap, pos, trees, augment = MCF_AUGMENT, saturation = 100, metric = null) {
  const res = new Map();
  for (const [k, v] of capMap) res.set(k, saturation >= 100 ? v : Math.floor(v * saturation / 100));
  const flows = new Map();
  const add = (k, hop, amt) => {
    let m = flows.get(k);
    if (!m) flows.set(k, m = new Map());
    m.set(hop, (m.get(hop) || 0) + amt);
  };
  const sorted = pairs.slice().sort((a, b) => a.dist - b.dist || a.s - b.s || a.d - b.d);
  for (const p of sorted) {
    let left = p.amt;
    for (let i = 0; i < augment && left > 0; i++) {
      const adjR = new Map();
      for (const [u, vs] of adj) {
        const ok = vs.filter((v) => (res.get(edgeKey(u, v)) || 0) > 0);
        if (ok.length) adjR.set(u, ok);
      }
      const t = shortest(p.s, adjR, pos, metric);
      if (!t.dist.has(p.d)) break;
      const path = [];
      for (let v = p.d; v !== p.s; v = t.prev.get(v)) path.push(edgeKey(t.prev.get(v), v));
      let f = left;
      for (const k of path) f = Math.min(f, res.get(k));
      if (!(f > 0)) break;
      for (const k of path) res.set(k, res.get(k) - f);
      add(p.s + '>' + p.d, t.first.get(p.d), f);
      left -= f;
    }
    p.left = left;
  }
  for (const p of sorted) {
    if (!(p.left > 0)) continue;
    const hop = trees.get(p.s).first.get(p.d);
    if (hop !== undefined) add(p.s + '>' + p.d, hop, p.left);
  }
  return flows;
}

/** Relaxation budget of the batched capacity solver; when exhausted the job is marked approximate (bounded tick). */
const CAP_ROUTING_BUDGET = 60000;
const CAP_ROUTING_ROUNDS = 8;

/**
 * Batched, deterministic approximation of OpenTTD's first MCF pass (setting cargodistCapacityRouting).
 * Demand is unchanged (demand parity is a separate decision). Per round, sources are walked in id order and one
 * residual Dijkstra per source builds a path tree over edges with free capacity; each unsatisfied destination is
 * pushed `demand/accuracy` (at least 1) along it, capped by the free capacity of every leg (cap*saturation/100,
 * applied at push time). Rounds stop at no progress. Leftover demand takes the unconstrained shortest path
 * (the cheap second-pass fallback; it may overfill an edge). No cycle elimination, so it is closer to OpenTTD,
 * not identical.
 * @returns {{flows:Map<string, Map<number,number>>, approx:boolean}} 's>d' -> (first hop -> units)
 */
function capacityFlows(pairs, capMap, pos, trees, accuracy, saturation, metric = null) {
  // adjacency built and sorted here, so the result does not depend on edge insertion order
  const succ = new Map();
  for (const k of [...capMap.keys()].sort()) {
    const [a, b] = k.split('>').map(Number);
    if (!succ.has(a)) succ.set(a, []);
    succ.get(a).push(b);
  }
  for (const list of succ.values()) list.sort((x, y) => x - y);
  const limit = new Map();
  for (const [k, v] of capMap) limit.set(k, Math.max(1, Math.floor(v * saturation / 100)));
  const load = new Map();
  const flows = new Map();
  const add = (k, hop, amt) => {
    let m = flows.get(k);
    if (!m) flows.set(k, m = new Map());
    m.set(hop, (m.get(hop) || 0) + amt);
  };
  const bySource = new Map();
  for (const p of pairs) {
    let list = bySource.get(p.s);
    if (!list) bySource.set(p.s, list = []);
    list.push({ d: p.d, amt: p.amt, left: p.amt });
  }
  for (const list of bySource.values()) list.sort((a, b) => a.d - b.d);
  const sources = [...bySource.keys()].sort((a, b) => a - b);
  const lastTrees = new Map(); // last residual tree per source: the fallback prefers it (stays within capacity)
  const acc = Math.max(1, Math.round(accuracy));
  const nodeCount = new Set([...limit.keys()].flatMap((k) => k.split('>').map(Number))).size;
  let rounds = nodeCount > 128 ? 1 : CAP_ROUTING_ROUNDS;
  let approx = nodeCount > 128; // large graph: one tree per source, keep the tick bounded
  let budget = CAP_ROUTING_BUDGET;
  for (let r = 0; r < rounds; r++) {
    let progressed = false;
    for (const s of sources) {
      const list = bySource.get(s);
      if (!list.some((p) => p.left > 0)) continue;
      const dist = new Map([[s, 0]]), prev = new Map(), first = new Map();
      const done = new Set(), heap = [[0, s]];
      while (heap.length) {
        if (budget <= 0) { approx = true; break; }
        const [best, u] = heapPop(heap);
        budget--;
        if (done.has(u)) continue;
        done.add(u);
        for (const v of succ.get(u) || []) {
          const k = edgeKey(u, v);
          if (!((limit.get(k) || 0) - (load.get(k) || 0) > 0)) continue;
          const pu = pos.get(u), pv = pos.get(v);
          const d = best + (pu && pv ? (metric ? metric(pu, pv) : manhattan(pu[0], pu[1], pv[0], pv[1])) : 1);
          if (!dist.has(v) || d < dist.get(v)) {
            dist.set(v, d);
            prev.set(v, u);
            first.set(v, u === s ? v : first.get(u));
            heapPush(heap, [d, v]);
          }
        }
      }
      if (budget <= 0) break;
      lastTrees.set(s, { dist, first });
      for (const p of list) {
        if (!(p.left > 0) || !dist.has(p.d)) continue;
        const path = [];
        let ok = true;
        for (let v = p.d; v !== s; v = prev.get(v)) {
          if (v === undefined) { ok = false; break; }
          path.push(edgeKey(prev.get(v), v));
        }
        if (!ok) continue;
        let free = Infinity;
        for (const k of path) free = Math.min(free, (limit.get(k) || 0) - (load.get(k) || 0));
        if (!(free > 0)) continue;
        const step = Math.min(free, Math.max(1, Math.round(p.amt / acc)), p.left);
        if (!(step > 0)) continue;
        for (const k of path) load.set(k, (load.get(k) || 0) + step);
        add(s + '>' + p.d, first.get(p.d), step);
        p.left -= step;
        progressed = true;
      }
    }
    if (!progressed || budget <= 0) break;
  }
  // leftover demand: plain shortest path (markets over capacity as a last resort, like OpenTTD's second pass)
  for (const s of sources) {
    for (const p of bySource.get(s)) {
      if (!(p.left > 0)) continue;
      const lt = lastTrees.get(s);
      const tree = trees.get(s);
      const hop = (lt && lt.dist.has(p.d) ? lt.first.get(p.d) : undefined) ?? (tree && tree.first.get(p.d));
      if (hop !== undefined) add(s + '>' + p.d, hop, p.left);
    }
  }
  return { flows, approx };
}

/** Turn a flow map ('s>d' -> first hop -> units) into the job's nhs shares and single nh next hop. */
function applyFlows(res, flows) {
  for (const [k, m] of flows) {
    const [s, d] = k.split('>').map(Number);
    const tot = [...m.values()].reduce((n, x) => n + x, 0);
    if (!(tot > 0)) continue;
    const list = [...m.entries()].map(([h, x]) => [h, x / tot]).sort((a, b) => a[0] - b[0]);
    (res.nhs[s] = res.nhs[s] || {})[d] = list;
    // the single next hop used for unloading decisions: the largest share (lowest id on ties)
    let best = list[0];
    for (const x of list) if (x[1] > best[1]) best = x;
    res.nh[s][d] = best[0];
  }
}

/** Parcels whose destination is no longer reachable become unrouted again (any vehicle may take them). */
function clearStranded(state, cargoId, g) {
  for (const st of state.stations) {
    const list = st.cargo && st.cargo[cargoId];
    if (!list) continue;
    for (const p of list) {
      if (p.dest == null) continue;
      const row = g.nh[st.id];
      if (!row || row[p.dest] === undefined) delete p.dest;
    }
  }
}

/**
 * One link-graph job (OpenTTD LinkGraphJob, simplified): expire edges, demand, routing, flows, next hops.
 * Starts the job: edge clock, supply counters and the routing result are computed here and returned; the caller
 * applies them (now, or after the recalc time: applyJob). @returns {{nodes:number[], dem:object, nh:object, nhs:object}}
 */
function computeJob(state, cargoId, mode, opts = {}) {
  const g = ensureGraph(state, cargoId);
  const day = opts.day; // days-based schedule (setting linkgraphIntervalDays > 0); undefined = month schedule
  g.month++;
  // day mode: edge expiry counts days since last use (OpenTTD 32 + manhattan/8 days); month mode is unchanged
  const stPos = day === undefined ? null : new Map(state.stations.map((st) => [st.id, [st.x, st.y]]));
  for (const k of Object.keys(g.edges)) {
    const e = g.edges[k];
    if (e.used > 0) {
      e.cap = e.used;
      if (day !== undefined) e.lastDay = day;
    }
    e.used = 0;
    if (day !== undefined) {
      if (e.lastDay === undefined) e.lastDay = day;
      const pa = stPos.get(e.a), pb = stPos.get(e.b);
      const expire = 32 + (pa && pb ? Math.floor(manhattan(pa[0], pa[1], pb[0], pb[1]) / 8) : 0);
      if (day - e.lastDay > expire) delete g.edges[k];
    } else if (g.month - e.last > EDGE_EXPIRE_MONTHS) delete g.edges[k];
  }
  const adj = new Map(), pos = new Map(), nodeSet = new Set(), capMap = new Map();
  for (const e of Object.values(g.edges)) {
    if (!(e.cap > 0)) continue;
    nodeSet.add(e.a); nodeSet.add(e.b);
    if (!adj.has(e.a)) adj.set(e.a, []);
    adj.get(e.a).push(e.b);
    capMap.set(edgeKey(e.a, e.b), e.cap);
  }
  const nodes = [...nodeSet].sort((a, b) => a - b);
  // one pass over the stations (findStation is a linear scan)
  for (const st of state.stations) if (nodeSet.has(st.id)) pos.set(st.id, [st.x, st.y]);
  // supply generated since the last job start (every station resets its counter, graph member or not)
  const supply = new Map();
  for (const st of state.stations) {
    if (!st.cdSupply) continue;
    if (nodeSet.has(st.id)) supply.set(st.id, st.cdSupply[cargoId] || 0);
    st.cdSupply[cargoId] = 0;
  }
  for (const n of nodes) if (!supply.has(n)) supply.set(n, 0);
  const res = { nodes, dem: {}, nh: {}, nhs: {} };
  if (nodes.length < 2) return res;

  // routing: one shortest-path tree per source. The opt-in capacity solvers use OpenTTD's
  // DistanceMaxPlusManhattan + 1 edge metric; every default path keeps plain manhattan.
  const capRouting = cdCapacityRoutingOn(state);
  const mcfRouting = cdMcfOn(state);
  const metric = capRouting || mcfRouting ? ottdDistance : null;
  const trees = new Map();
  for (const s of nodes) trees.set(s, shortest(s, adj, pos, metric));
  // freight (OpenTTD asymmetric demand): only stations accepting the cargo are destinations, weighted by their
  // acceptance in the catchment; pax/mail: weighted by the destination's supply (setting cdDemandSize: exponent)
  const freight = FREIGHT_CARGOS.includes(cargoId);
  const acc = freight ? acceptanceOf(state, cargoId, nodeSet) : null;
  const sizeExp = demandSizeExponent(state);
  const wOf = (d) => (freight ? acc.get(d) || 0 : (sizeExp === 1 ? Math.max(1, supply.get(d)) : Math.pow(Math.max(1, supply.get(d)), sizeExp)));
  // setting cdDemandDistance (0 = off): each destination's weight is divided by 1 + k * dist / meanDist
  const distK = demandDistanceK(state);
  // demand: supply of the source spread over reachable destinations, weighted by their weight
  const dem = new Map();
  for (const s of nodes) {
    const reach = [...trees.get(s).dist.keys()].filter((d) => d !== s && (!freight || wOf(d) > 0));
    let meanD = 0;
    if (distK > 0 && reach.length) meanD = reach.reduce((n, d) => n + trees.get(s).dist.get(d), 0) / reach.length;
    const wd = (d) => (distK > 0 && meanD > 0 ? wOf(d) / (1 + distK * trees.get(s).dist.get(d) / meanD) : wOf(d));
    const W = reach.reduce((n, d) => n + wd(d), 0);
    if (!(W > 0)) continue;
    for (const d of reach) {
      // shares only matter (rows are normalised below), so a source with no recent supply still gets routes
      const v = (sizeExp === 0 ? 1 : Math.max(1, supply.get(s))) * wd(d) / W; // demand_size 0: no supply effect at all
      dem.set(s + '>' + d, v);
    }
  }
  const pairs = [];
  for (const s of nodes) {
    for (const d of trees.get(s).dist.keys()) {
      if (d === s) continue;
      const fwd = dem.get(s + '>' + d) || 0;
      const back = mode === 'symmetric' ? (dem.get(d + '>' + s) || 0) : fwd;
      const amount = mode === 'symmetric' ? (fwd + back) / 2 : fwd;
      if (!(amount > 0)) continue;
      // demand rows: cargo generated at s goes to d with this share
      (res.dem[s] = res.dem[s] || []).push([d, amount]);
      pairs.push({ s, d, amt: amount, dist: trees.get(s).dist.get(d) });
    }
    // next hop table: first hop from s to every reachable node
    const nhRow = (res.nh[s] = res.nh[s] || {});
    for (const [d, h] of trees.get(s).first) if (d !== s) nhRow[d] = h;
  }
  // capacity-constrained routing (setting cargodistMcf): flows per (s,d) over several first hops
  if (capRouting) {
    // OpenTTD-style batched capacity routing (setting cargodistCapacityRouting): demand is unchanged
    const { flows, approx } = capacityFlows(pairs, capMap, pos, trees, getSetting(state, 'linkgraphAccuracy'), mcfSaturation(state), metric);
    if (approx) res.approx = true;
    applyFlows(res, flows);
  } else if (mcfRouting) {
    applyFlows(res, mcfFlows(pairs, adj, capMap, pos, trees, mcfAugment(state), mcfSaturation(state), metric));
  }
  for (const s of Object.keys(res.dem)) {
    const row = res.dem[s];
    const tot = row.reduce((n, [, a]) => n + a, 0);
    res.dem[s] = row.map(([d, a]) => [d, a / tot]).sort((a, b) => a[0] - b[0]);
  }
  return res;
}

/** Make a computed job the graph's routing (and strand-check the parcels against it). */
function applyJob(state, cargoId, res) {
  const g = ensureGraph(state, cargoId);
  g.nodes = res.nodes;
  g.dem = res.dem; g.nh = res.nh; g.nhs = res.nhs;
  clearStranded(state, cargoId, g);
}

/**
 * Immediate monthly rebuild of one cargo's link graph (start and apply at once; tests and the default schedule).
 * @returns {number} number of graph nodes
 */
export function rebuildGraph(state, cargoId, mode) {
  const res = computeJob(state, cargoId, mode);
  applyJob(state, cargoId, res);
  return res.nodes.length;
}

/** Acceptance weight of each graph node for a freight cargo: sum of its catchment's acceptance (0 = not accepting). */
function acceptanceOf(state, cargoId, nodeSet) {
  const out = new Map();
  for (const st of state.stations) {
    if (!nodeSet.has(st.id)) continue;
    let sum = 0;
    for (const p of catchmentTiles(state, st)) sum += tileAcceptance(state, p.x, p.y)[cargoId] || 0;
    out.set(st.id, sum >= ACCEPT_THRESHOLD ? sum : 0);
  }
  return out;
}

/**
 * Monthly link graph schedule. OpenTTD linkgraphschedule.cpp runs in days (recalc_interval default 4 days, recalc_time 16 days;
 * linkgraph_settings.ini:45,58; SECONDS_PER_DAY=2). This function counts months, so it is NOT the OpenTTD cadence (known gap,
 * see GAPS.md). A job starts every linkgraphRecalcInterval
 * months (only one job per cargo at a time); its result is applied linkgraphRecalcTime months later (0 = at once).
 * Defaults (1 and 0) rebuild every month, as before. The pending job is lazy (g.pending = { res, due }) and saved with the state (plain JSON; tests/cargodistJobSave.test.js).
 */
export function updateMonthly(state) {
  if (linkgraphIntervalDays(state) > 0) return; // days-based schedule (updateDaily) takes over
  const now = state.date.year * 12 + state.date.month;
  const interval = Math.max(1, Math.round(getSetting(state, 'linkgraphRecalcInterval')));
  const delay = Math.max(0, Math.round(getSetting(state, 'linkgraphRecalcTime')));
  for (const c of cdCargoList(state)) {
    const g = ensureGraph(state, c);
    if (g.pending && now >= g.pending.due) {
      applyJob(state, c, g.pending.res);
      delete g.pending;
    }
    if (!g.pending && now % interval === 0) {
      const res = computeJob(state, c, FREIGHT_CARGOS.includes(c) ? 'asymmetric' : cdMode(state, c));
      if (delay === 0) applyJob(state, c, res);
      else g.pending = { res, due: now + delay };
    }
  }
}

/**
 * Days-based link graph schedule (setting linkgraphIntervalDays > 0; 0 = off and nothing here runs). OpenTTD
 * linkgraphschedule.cpp: a job starts when day % interval == 0, and is joined (applied) on the mid-interval day
 * (day % interval == interval/2) once its minimum run time (linkgraphTimeDays) has elapsed. With the OpenTTD
 * defaults (4 and 16) a job spawned on day 0 is applied on day 18, not 16. One cargo graph starts per spawn,
 * round-robin over the active cargos (the graph that ran longest ago, ties in cdCargoList order), so a given
 * cargo is refreshed about every N*interval days. Month-schedule fields (g.month, pending.due) are not used here;
 * the days fields (g.day, pending.dueDay, edge.lastDay) are only created in this mode.
 */
export function updateDaily(state) {
  const intervalDays = linkgraphIntervalDays(state);
  if (!(intervalDays > 0)) return; // default: the month schedule in updateMonthly is authoritative
  const interval = Math.max(1, intervalDays);
  const delay = linkgraphTimeDays(state);
  const now = dayNumber(state.date);
  const cargos = cdCargoList(state);
  const graphs = cargos.map((c) => ensureGraph(state, c));
  // join elapsed jobs on the mid-interval day (OpenTTD linkgraphschedule.cpp SpawnNext/join)
  if (now % interval === Math.floor(interval / 2)) {
    for (let i = 0; i < cargos.length; i++) {
      const g = graphs[i];
      if (g.pending && g.pending.dueDay <= now) {
        applyJob(state, cargos[i], g.pending.res);
        delete g.pending;
      }
    }
  }
  if (now % interval !== 0) return;
  // one component per spawn: the eligible cargo whose graph last ran longest ago (round-robin, deterministic)
  let pick = -1, pickDay = Infinity;
  for (let i = 0; i < cargos.length; i++) {
    const g = graphs[i];
    if (g.pending) continue;
    const last = g.day === undefined ? -Infinity : g.day;
    if (last < pickDay) { pickDay = last; pick = i; }
  }
  if (pick < 0) return;
  const c = cargos[pick], g = graphs[pick];
  const res = computeJob(state, c, FREIGHT_CARGOS.includes(c) ? 'asymmetric' : cdMode(state, c), { day: now });
  g.day = now;
  if (delay === 0) applyJob(state, c, res);
  else g.pending = { res, dueDay: now + delay };
}

/**
 * Station window breakdown (OpenTTD station "planned/via" view, simplified): waiting passengers/mail grouped by the
 * next hop from this station. Parcels without a route show as 'any'.
 * @returns {{via:number|null, amount:number}[]} sorted by amount (via null = no route known)
 */
export function viaBreakdown(state, st, cargoId) {
  const list = (st.cargo && st.cargo[cargoId]) || [];
  const acc = new Map();
  for (const p of list) {
    const flows = p.dest == null ? undefined : flowsOf(state, cargoId, st.id, p.dest);
    if (flows && flows.length > 1) {
      // several vias: the parcel's assigned via, else its amount split by the flow shares (largest remainder)
      if (p.via !== undefined && flows.some((f) => f[0] === p.via)) {
        acc.set(p.via, (acc.get(p.via) || 0) + p.amount);
        continue;
      }
      const raw = flows.map(([h, sh]) => ({ h, exact: p.amount * sh, n: Math.floor(p.amount * sh) }));
      let left = p.amount - raw.reduce((n, r) => n + r.n, 0);
      const order = raw.map((_, i) => i).sort((i, j) => (raw[j].exact - raw[j].n) - (raw[i].exact - raw[i].n) || i - j);
      for (let k = 0; left > 0 && k < order.length; k++, left--) raw[order[k]].n++;
      for (const r of raw) if (r.n > 0) acc.set(r.h, (acc.get(r.h) || 0) + r.n);
      continue;
    }
    const via = p.dest == null ? null : (nextHop(state, cargoId, st.id, p.dest) ?? null);
    acc.set(via, (acc.get(via) || 0) + p.amount);
  }
  return [...acc.entries()].map(([via, amount]) => ({ via, amount })).sort((a, b) => b.amount - a.amount || (a.via ?? -1) - (b.via ?? -1));
}
