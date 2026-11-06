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
 * incremental job scheduler, and no link graph overlay on the map yet.
 */
import { getSetting } from './settings.js';
import { manhattan } from './state.js';

/** Cargos the distribution applies to (other cargo keeps the classic model). */
export const CD_CARGOS = ['PASS', 'MAIL'];
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

/** Whether the distribution applies to this cargo (setting on and a supported cargo). */
export function cdApplies(state, cargoId) {
  return CD_CARGOS.includes(cargoId) && cargodistOn(state);
}

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
  if (!cargodistOn(state) || nextId == null || nextId === st.id) return;
  for (const s of slices) {
    if (!CD_CARGOS.includes(s.cargoId) || !(s.capacity > 0)) continue;
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
 * its next hop from here is `nextId`, or no route is known (never strand cargo).
 */
export function loadFilter(state, st, cargoId, nextId) {
  if (nextId == null || nextId === st.id) return undefined;
  return (p) => p.dest == null || (() => {
    const h = nextHop(state, cargoId, st.id, p.dest);
    return h === undefined || h === nextId;
  })();
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
 * Distances are manhattan distances between station positions (1 when a position is unknown).
 * @returns {{dist:Map<number,number>, first:Map<number,number>, prev:Map<number,number>}}
 */
function shortest(src, adj, pos) {
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
      const d = best + (pu && pv ? manhattan(pu[0], pu[1], pv[0], pv[1]) : 1);
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
 * Monthly rebuild of one cargo's link graph: expire edges, demand, routing, flows, next hops.
 * @returns {number} number of graph nodes
 */
export function rebuildGraph(state, cargoId, mode) {
  const g = ensureGraph(state, cargoId);
  g.month++;
  for (const k of Object.keys(g.edges)) {
    const e = g.edges[k];
    if (e.used > 0) e.cap = e.used;
    e.used = 0;
    if (g.month - e.last > EDGE_EXPIRE_MONTHS) delete g.edges[k];
  }
  const adj = new Map(), pos = new Map(), nodeSet = new Set();
  for (const e of Object.values(g.edges)) {
    if (!(e.cap > 0)) continue;
    nodeSet.add(e.a); nodeSet.add(e.b);
    if (!adj.has(e.a)) adj.set(e.a, []);
    adj.get(e.a).push(e.b);
  }
  const nodes = [...nodeSet].sort((a, b) => a - b);
  // one pass over the stations (findStation is a linear scan)
  for (const st of state.stations) if (nodeSet.has(st.id)) pos.set(st.id, [st.x, st.y]);
  // supply generated since the last rebuild (every station resets its counter, graph member or not)
  const supply = new Map();
  for (const st of state.stations) {
    if (!st.cdSupply) continue;
    if (nodeSet.has(st.id)) supply.set(st.id, st.cdSupply[cargoId] || 0);
    st.cdSupply[cargoId] = 0;
  }
  for (const n of nodes) if (!supply.has(n)) supply.set(n, 0);
  g.nodes = nodes;
  g.dem = {}; g.nh = {};
  if (nodes.length < 2) { clearStranded(state, cargoId, g); return nodes.length; }

  // routing: one shortest-path tree per source
  const trees = new Map();
  for (const s of nodes) trees.set(s, shortest(s, adj, pos));
  // demand: supply of the source spread over reachable destinations, weighted by their supply
  const dem = new Map();
  for (const s of nodes) {
    const reach = [...trees.get(s).dist.keys()].filter((d) => d !== s);
    const W = reach.reduce((n, d) => n + Math.max(1, supply.get(d)), 0);
    for (const d of reach) {
      // shares only matter (rows are normalised below), so a source with no recent supply still gets routes
      const v = Math.max(1, supply.get(s)) * Math.max(1, supply.get(d)) / W;
      dem.set(s + '>' + d, v);
    }
  }
  for (const s of nodes) {
    for (const d of trees.get(s).dist.keys()) {
      if (d === s) continue;
      const fwd = dem.get(s + '>' + d) || 0;
      const back = mode === 'symmetric' ? (dem.get(d + '>' + s) || 0) : fwd;
      const amount = mode === 'symmetric' ? (fwd + back) / 2 : fwd;
      if (!(amount > 0)) continue;
      // demand rows: pax generated at s go to d with this share
      (g.dem[s] = g.dem[s] || []).push([d, amount]);
    }
    // next hop table: first hop from s to every reachable node
    const nhRow = (g.nh[s] = g.nh[s] || {});
    for (const [d, h] of trees.get(s).first) if (d !== s) nhRow[d] = h;
  }
  clearStranded(state, cargoId, g);
  for (const s of Object.keys(g.dem)) {
    const row = g.dem[s];
    const tot = row.reduce((n, [, a]) => n + a, 0);
    g.dem[s] = row.map(([d, a]) => [d, a / tot]).sort((a, b) => a[0] - b[0]);
  }
  return nodes.length;
}

/** Monthly update of every distributed cargo's link graph (only when the setting is on). */
export function updateMonthly(state) {
  const mode = cargodistMode(state);
  if (mode === 'off') return;
  for (const c of CD_CARGOS) rebuildGraph(state, c, mode);
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
    const via = p.dest == null ? null : (nextHop(state, cargoId, st.id, p.dest) ?? null);
    acc.set(via, (acc.get(via) || 0) + p.amount);
  }
  return [...acc.entries()].map(([via, amount]) => ({ via, amount })).sort((a, b) => b.amount - a.amount || (a.via ?? -1) - (b.via ?? -1));
}
