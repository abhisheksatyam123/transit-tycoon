/**
 * Moscow scenario, metro: lays one rail line per baked metro line (A* between consecutive
 * stations), turns stops into rail stations, adds a depot on a spur and passenger trains.
 */
import { routeRail, layRailPath, nearestStraight, placeStationTile, stationAxis } from './moscowRoute.js';
import { spurDepot } from './moscowLand.js';

/** Metro lines built at most (ring lines first, then longest): all baked lines. */
export const MAX_METRO_LINES = 17;
/** Line-index alphabet of the baked metroLine layer (must match tools/moscow/layers.js IDX). */
const LINE_IDX = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Baked metro geometry for one line: the track bits and the line's own index char, so routing
 * can follow the real tunnels. Null when the bake has no metro layers.
 * @param {object} L decoded layers (decodeLayers)
 * @param {object[]} bakedLines map.metroLines
 * @param {object} line one of bakedLines
 */
export function metroGeometry(L, bakedLines, line) {
  const li = bakedLines.indexOf(line);
  if (!L || !L.metro || li < 0 || li >= LINE_IDX.length) return null;
  if (L.metro.replace(/0/g, '') === '') return null;
  return { metro: L.metro, metroLine: L.metroLine, ch: LINE_IDX[li] };
}
/** Passenger trains per service (a service is a stop window served back and forth). */
export const TRAINS_PER_SERVICE = 2;
/** Stops per service window (orders stay under the MAX_ORDERS cap). */
export const WINDOW = 8;
/** Passenger catchment radius (tiles) of metro stations: deep-metro stations draw from far away. */
export const METRO_CATCHMENT = 6;

/**
 * Split a line's stops into services: overlapping windows of WINDOW stops. Ring lines use the
 * closed cycle; open lines are served back and forth inside each window.
 * @returns {object[][]} order lists
 */
export function serviceSequences(orders, ring) {
  const n = orders.length;
  if (n <= WINDOW) return [ring ? orders : orders.concat(orders.slice(1, -1).reverse())];
  const out = [];
  const step = WINDOW - 1;
  for (let start = 0; start < n - 1; start += step) {
    const win = ring ? Array.from({ length: WINDOW }, (_, k) => orders[(start + k) % n]) : orders.slice(start, start + WINDOW);
    if (win.length < 2) break;
    out.push(ring ? win : win.concat(win.slice(1, -1).reverse()));
    if (!ring && start + WINDOW >= n) break;
  }
  return out;
}

/** Tile index of a baked (x,y), clamped to the map; null when not finite. */
function tileOf(map, p) {
  const x = Math.round(p.x), y = Math.round(p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.min(map.height - 1, Math.max(0, y)) * map.width + Math.min(map.width - 1, Math.max(0, x));
}

/**
 * Choose which metro lines to build: ring lines first, then longest.
 * @returns {object[]} lines
 */
export function pickMetroLines(lines) {
  return [...lines]
    .filter((l) => l.stations && l.stations.length >= 2)
    .sort((a, b) => (b.ring ? 1 : 0) - (a.ring ? 1 : 0) || b.stations.length - a.stations.length)
    .slice(0, MAX_METRO_LINES);
}

/** Route every consecutive pair (ring closes last->first). @returns {{path:number[],failed:number}} */
function routeLine(state, stops, ring, log, label, geo) {
  const segs = [];
  let failed = 0;
  const pairs = [];
  for (let k = 0; k + 1 < stops.length; k++) pairs.push([stops[k], stops[k + 1]]);
  if (ring && stops.length > 2) pairs.push([stops[stops.length - 1], stops[0]]);
  for (const [a, b] of pairs) {
    if (a === b) continue;
    const p = routeRail(state.map, a, b, 200000, geo);
    if (!p) { failed++; log.push(`metro ${label}: no rail route between stops (tile ${a} -> ${b})`); continue; }
    layRailPath(state.map, p, state.towns);
    segs.push(p);
  }
  return { path: segs.flat(), failed };
}

/** Station on the nearest straight track tile to each stop. @returns {{station:object}[]} in line order */
function placeStops(state, stops, names, path, log, label, color) {
  const { map } = state;
  const out = [];
  stops.forEach((tileIdx, k) => {
    const pk = nearestStraight(map, path, tileIdx, 8);
    if (pk < 0) { log.push(`metro ${label}: no straight track near stop "${names[k]}"`); return; }
    const t = path[pk];
    const st = placeStationTile(state, t, names[k], stationAxis(map, t));
    if (!st) { log.push(`metro ${label}: stop "${names[k]}" tile occupied`); return; }
    markMetroStop(state, t, st, color);
    out.push({ station: st });
  });
  return out;
}

/** Metro flags on a stop tile: entrance pavilion, line colour, wider catchment (first line wins). */
function markMetroStop(state, t, st, color) {
  const { map } = state;
  const b = map.tiles[t].building;
  if (b && !b.metro) { b.metro = true; b.color = color; }
  const x = t % map.width, y = Math.floor(t / map.width);
  const se = st.tiles.find((p) => p.x === x && p.y === y);
  if (se) se.radius = Math.max(se.radius || 0, METRO_CATCHMENT);
}

/** Tag rail tiles laid by this line (not rail already there before the metro) as tunnel. */
function tagTunnels(map, path, before, lineIndex) {
  for (const i of path) {
    const t = map.tiles[i];
    if (!t.rail || (before[i] && !t.tunnel)) continue;
    t.tunnel = 1;
    if (t.metroColor === undefined) t.metroColor = lineIndex;
  }
}

/** Rail-connected tiles from tile `start` (mutual edge bits). @returns {Uint8Array} */
function railReach(map, start) {
  const W = map.width, H = map.height, seen = new Uint8Array(W * H);
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], B = [1, 2, 4, 8], O = [4, 8, 1, 2];
  const st = [start]; seen[start] = 1;
  while (st.length) {
    const i = st.pop(), x = i % W, y = (i / W) | 0, r = map.tiles[i].rail | 0;
    for (let d = 0; d < 4; d++) {
      if (!(r & B[d])) continue;
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (seen[j] || !((map.tiles[j].rail | 0) & O[d])) continue;
      seen[j] = 1; st.push(j);
    }
  }
  return seen;
}

/**
 * Build one metro line end to end.
 * @param {object} game Game instance (commands)
 * @param {object} line baked metro line
 * @param {{x:number,y:number}[]} stops tile positions in line order
 * @param {string[]} log warnings
 * @param {number} lineIndex index of this line in state.metro.lines (tile.metroColor)
 * @param {object|null} geo baked metro geometry (metroGeometry) to follow the real tunnels
 * @returns {object|null} summary {ref,name,color,ring,stationIds,vehicleIds,trains,requested,failed,stops}
 */
export function buildMetroLine(game, line, stops, log, lineIndex = 0, geo = null) {
  const { state } = game;
  const label = line.ref;
  const map = state.map;
  const idxs = stops.map((p) => tileOf(map, p)).filter((i) => i !== null);
  if (idxs.length < 2) { log.push(`metro ${label}: fewer than 2 stops`); return null; }
  const ring = !!line.ring;
  const before = Uint8Array.from(map.tiles, (t) => (t.rail ? 1 : 0));
  const { path, failed } = routeLine(state, idxs, ring, log, label, geo);
  if (!path.length) return null;
  const names = line.stations.map((s) => s.nameEn || s.name);
  const placed = placeStops(state, idxs, names, path, log, label, line.color);
  const depotId = spurDepot(game, 'rail', path);
  if (depotId == null) { log.push(`metro ${label}: no depot site beside the line`); return null; }
  tagTunnels(map, path, before, lineIndex);
  // keep only stops rail-connected to the depot (a failed segment would leave trains lost)
  const depot = state.depots.find((d) => d.id === depotId);
  const reach = depot ? railReach(map, depot.y * map.width + depot.x) : null;
  const served = reach ? placed.filter((p) => p.station.tiles.some((q) => reach[q.y * map.width + q.x])) : placed;
  if (served.length < placed.length) log.push(`metro ${label}: ${placed.length - served.length} stop(s) not connected to the depot, skipped`);
  if (served.length < 2) { log.push(`metro ${label}: fewer than 2 connected stops`); return null; }
  const stationIds = [...new Set(served.map((p) => p.station.id))];
  const orderIds = served.filter((p, k) => k === 0 || p.station.id !== served[k - 1].station.id)
    .map((p) => ({ stationId: p.station.id, full: false }));
  const services = serviceSequences(orderIds, ring);
  let trains = 0;
  const vehicleIds = [];
  for (const seq of services) {
    for (let t = 0; t < TRAINS_PER_SERVICE; t++) {
      const r = game.buyVehicle(depotId, { modelId: 'eng_comet', wagonModelId: 'wag_coach', wagons: 3, cargoId: 'PASS' });
      if (!r.ok) { log.push(`metro ${label}: train not bought: ${r.error}`); break; }
      r.vehicle.metroLine = label;
      r.vehicle.livery = line.color;
      vehicleIds.push(r.vehicle.id);
      const shift = Math.floor((seq.length * t) / TRAINS_PER_SERVICE);
      const o = game.setOrders(r.vehicle.id, seq.slice(shift).concat(seq.slice(0, shift)));
      if (!o.ok) { log.push(`metro ${label}: orders rejected: ${o.error}`); break; }
      game.startVehicle(r.vehicle.id);
      trains++;
    }
  }
  return { ref: label, name: line.name, nameEn: line.nameEn, color: line.color, ring, stationIds, vehicleIds, depotId, trains, requested: services.length * TRAINS_PER_SERVICE, services: services.length, failed, stops: placed.length };
}
