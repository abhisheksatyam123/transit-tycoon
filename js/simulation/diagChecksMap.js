/**
 * Map-level diagnostics: bit invariants, half-linked and steep track, town road connectivity, dead ends.
 */
import { DIRS, OPPOSITE } from './constants.js';
import { inBounds } from './map.js';
import { mkIssue, emitItems, labelComponents } from './diagIssue.js';

/** Radius (tiles) of the town core whose road network must be a single piece. */
export const TOWN_CORE_RADIUS = 12;

/**
 * Invariant and link checks on tile road/rail bits and heights.
 * @param {object} state
 * @returns {object[]} Issues
 */
export function checkTrackBits(state) {
  const { map } = state;
  const out = [];
  const oob = [], halfRoad = [], halfRail = [], steep = [];
  const { width: W, height: H, tiles } = map;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[y * W + x];
      for (const layer of ['road', 'rail']) {
        const bits = t[layer] | 0;
        if (!bits) continue;
        for (const d of DIRS) {
          if (!(bits & d.bit)) continue;
          const nx = x + d.dx, ny = y + d.dy;
          if (!inBounds(map, nx, ny)) { oob.push({ x, y, layer, dir: d.name }); continue; }
          const nt = tiles[ny * W + nx];
          if (!(nt[layer] & OPPOSITE[d.bit])) {
            (layer === 'road' ? halfRoad : halfRail).push({ x, y, dir: d.name, nx, ny });
          } else if ((d.bit === 2 || d.bit === 4) && Math.abs(t.height - nt.height) > 1) {
            steep.push({ x, y, dir: d.name, layer, h1: t.height, h2: nt.height });
          }
        }
      }
    }
  }
  out.push(...emitItems(oob, 'track-bit-out-of-map', 'error', 'invariant',
    (it) => `${it.layer} bit ${it.dir} at ${it.x},${it.y} points outside the map`));
  out.push(...emitItems(halfRoad, 'road-half-link', 'warn', 'network',
    (it) => `road at ${it.x},${it.y} links ${it.dir} to ${it.nx},${it.ny} which has no matching bit`));
  out.push(...emitItems(halfRail, 'rail-half-link', 'warn', 'network',
    (it) => `rail at ${it.x},${it.y} links ${it.dir} to ${it.nx},${it.ny} which has no matching bit`));
  out.push(...emitItems(steep, 'track-steep', 'warn', 'network',
    (it) => `${it.layer} joins heights ${it.h1} and ${it.h2} at ${it.x},${it.y} (${it.dir})`));
  return out;
}

/**
 * Per-town road checks: core split into several pieces, and unconnected neighbouring towns.
 * @param {object} state
 * @returns {object[]} Issues
 */
export function checkTownRoads(state) {
  const { map, towns } = state;
  const out = [];
  const R2 = TOWN_CORE_RADIUS * TOWN_CORE_RADIUS;
  for (const town of towns) {
    // global labels: core pieces joined through roads outside the radius are still connected
    const inCore = (x, y) => (x - town.x) ** 2 + (y - town.y) ** 2 <= R2;
    const labels = labelComponents(map, 'road', () => true);
    const seen = new Set();
    for (let y = town.y - TOWN_CORE_RADIUS; y <= town.y + TOWN_CORE_RADIUS; y++) {
      for (let x = town.x - TOWN_CORE_RADIUS; x <= town.x + TOWN_CORE_RADIUS; x++) {
        if (x < 0 || y < 0 || x >= map.width || y >= map.height || !inCore(x, y)) continue;
        const l = labels[y * map.width + x];
        if (l >= 0) seen.add(l);
      }
    }
    if (seen.size > 1) {
      out.push(mkIssue(`town-roads-split:${town.id}`, 'warn', 'network',
        `${town.name} town roads split into ${seen.size} parts within ${TOWN_CORE_RADIUS} tiles of centre`,
        { x: town.x, y: town.y, townId: town.id }));
    }
  }
  if (towns.length < 2) return out;
  const all = labelComponents(map, 'road', () => true);
  const labelNear = (town, r) => {
    const set = new Set();
    for (let y = town.y - r; y <= town.y + r; y++) for (let x = town.x - r; x <= town.x + r; x++) {
      if (!inBounds(map, x, y)) continue;
      const l = all[y * map.width + x];
      if (l >= 0) set.add(l);
    }
    return set;
  };
  for (const town of towns) {
    let nearest = null, bd = Infinity;
    for (const o of towns) {
      if (o === town) continue;
      const d = (o.x - town.x) ** 2 + (o.y - town.y) ** 2;
      if (d < bd) { bd = d; nearest = o; }
    }
    const mine = labelNear(town, 3);
    const theirs = labelNear(nearest, 3);
    let linked = false;
    for (const l of mine) if (theirs.has(l)) { linked = true; break; }
    if (!linked) {
      out.push(mkIssue(`town-unlinked:${town.id}`, 'info', 'town',
        `${town.name} has no road connection to nearest town ${nearest.name}`,
        { x: town.x, y: town.y, townId: town.id }));
    }
  }
  return out;
}

/**
 * Road tiles with exactly one road bit that are not stations or depots.
 * @param {object} state
 * @returns {object[]} Issues (aggregated info)
 */
export function checkDeadEnds(state) {
  const { map } = state;
  const ends = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const t = map.tiles[y * map.width + x];
    const b = t.road | 0;
    if (!b || (b & (b - 1)) !== 0) continue;
    if (t.building && (t.building.type === 'station' || t.building.type === 'depot')) continue;
    ends.push({ x, y });
  }
  if (ends.length === 0) return [];
  return [mkIssue('road-dead-ends:*', 'info', 'network',
    `${ends.length} road dead-end tiles (first at ${ends[0].x},${ends[0].y})`, { x: ends[0].x, y: ends[0].y })];
}
