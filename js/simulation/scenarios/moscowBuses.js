/**
 * Moscow scenario, buses: bus lines between district centres on major roads. Stops sit on straight
 * major-road tiles; a road depot hangs off a road spur; city omnibuses are bought via commands.
 */
import { tl, TS } from './moscowScale.js';
import { inBounds } from '../map.js';
import { spurDepot } from './moscowLand.js';

/** Bus lines to create. */
export const BUS_LINES = 12;
/** Buses per line. */
export const BUSES_PER_LINE = 2;

/** Straight road tile inside a box around (cx,cy), nearest first, or null; major=null accepts any road. */
function straightStop(state, major, cx, cy, r) {
  const { map } = state;
  let best = null, bd = Infinity;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (!inBounds(map, x, y)) continue;
    const i = y * map.width + x;
    const t = map.tiles[i];
    if ((major && !major[i]) || t.building || t.rail || t.terrain === 'water' || !(t.road === 5 || t.road === 10)) continue;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bd) { bd = d; best = { x, y, i }; }
  }
  return best;
}

/** Stop site for a town: straight major road within 6, else within 10, else any straight road within 6. */
function stopNear(state, major, town) {
  return straightStop(state, major, town.x, town.y, tl(6))
    || straightStop(state, major, town.x, town.y, tl(10))
    || straightStop(state, null, town.x, town.y, tl(6));
}

/** Road tiles near a stop (nearest first, stop excluded) to hang a depot spur from. */
function roadAnchors(state, stop) {
  const { map } = state;
  const out = [];
  for (let y = stop.y - tl(4); y <= stop.y + tl(4); y++) for (let x = stop.x - tl(4); x <= stop.x + tl(4); x++) {
    if (!inBounds(map, x, y) || (x === stop.x && y === stop.y)) continue;
    const i = y * map.width + x;
    const t = map.tiles[i];
    if (t.road && !t.building && !t.rail && t.terrain !== 'water') out.push({ i, d: Math.abs(x - stop.x) + Math.abs(y - stop.y) });
  }
  return out.sort((a, b) => a.d - b.d).map((o) => o.i);
}

/**
 * Build bus lines between towns: each town is paired with its nearest unused town at least 12
 * tiles away, largest towns first.
 * @param {object} game Game instance
 * @param {Uint8Array} major 1 where a major road is laid
 * @param {string[]} log warnings
 * @returns {{lines:number,buses:number,failed:number}}
 */
export function buildBusLines(game, major, log) {
  const { state } = game;
  const towns = [...state.towns].filter((t) => t.population > 0).sort((a, b) => b.population - a.population);
  const pairs = [];
  const used = new Set();
  for (const a of towns) {
    if (pairs.length >= BUS_LINES) break;
    if (used.has(a.id)) continue;
    let best = null, bd = Infinity;
    for (const b of towns) {
      if (b === a || used.has(b.id)) continue;
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (d >= tl(12) && d < bd) { bd = d; best = b; }
    }
    if (!best) continue;
    used.add(a.id); used.add(best.id);
    pairs.push([a, best]);
  }
  let lines = 0, buses = 0, failed = 0;
  for (const [a, b] of pairs) {
    const label = `${a.name}-${b.name}`;
    const sa = stopNear(state, major, a), sb = stopNear(state, major, b);
    if (!sa || !sb) { failed++; log.push(`bus ${label}: no straight road near centre`); continue; }
    const ra = game.buildRoadStop(sa.x, sa.y, 'bus');
    const rb = game.buildRoadStop(sb.x, sb.y, 'bus');
    if (!ra.ok || !rb.ok) { failed++; log.push(`bus ${label}: stop failed: ${ra.error || rb.error}`); continue; }
    const depotId = spurDepot(game, 'road', roadAnchors(state, sa));
    if (depotId == null) { failed++; log.push(`bus ${label}: no road depot site`); continue; }
    const orders = [{ stationId: ra.stationId, full: false }, { stationId: rb.stationId, full: false }];
    for (let k = 0; k < BUSES_PER_LINE; k++) {
      const r = game.buyVehicle(depotId, { modelId: 'bus_city' });
      if (!r.ok) { log.push(`bus ${label}: bus not bought: ${r.error}`); break; }
      game.setOrders(r.vehicle.id, k % 2 ? orders.slice().reverse() : orders);
      game.startVehicle(r.vehicle.id);
      buses++;
    }
    lines++;
  }
  return { lines, buses, failed };
}
