/**
 * Town placement, road grid and houses (generation). Growth lives in townGrowth.js.
 */
import { manhattan, allocId } from './state.js';
import { townName } from './naming.js';
import { linkTiles } from './network.js';
import { neighbours } from './map.js';
import { LAYOUTS } from './townLayout.js';
import { erasEnabled, pickEraHouse } from './buildingEras.js';

/** Deterministic layout from the site (no RNG draw): 1 in 8 towns get a fixed grid. */
function townLayoutFor(x, y) {
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const k = (h % 8);
  if (k === 0) return LAYOUTS[2];
  if (k === 1) return LAYOUTS[3];
  return LAYOUTS[1];
}

/** Population contributed by a house of each level (index = level). */
export const HOUSE_POP = [0, 18, 40, 75, 130];

/**
 * Recompute a town's population from its houses.
 */
export function recomputePopulation(state, town) {
  const { map } = state;
  let pop = 0;
  for (const h of town.houses) {
    const t = map.tiles[h.y * map.width + h.x];
    if (t.building && t.building.type === 'house') pop += HOUSE_POP[t.building.level] + (t.building.variant % 5);
  }
  town.population = pop;
  return pop;
}

/** True if a road may be laid by a town on this tile (free land or existing road). */
function roadable(tile) {
  return tile && tile.terrain !== 'water' && !tile.building && !tile.rail;
}

/**
 * Lay a straight town street through `points`, linking consecutive tiles.
 * Stops at the first unbuildable tile.
 * @returns {number} tiles laid
 */
export function layStreet(state, points) {
  const { map } = state;
  let prev = null, count = 0;
  for (const p of points) {
    if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) break;
    const t = map.tiles[p.y * map.width + p.x];
    if (!roadable(t)) break;
    if (t.terrain === 'forest' || t.terrain === 'rock') t.terrain = 'grass';
    if (!t.owner) t.owner = 'town';
    if (prev) linkTiles(map, 'road', prev.x, prev.y, p.x, p.y);
    prev = p;
    count++;
  }
  // a lone tile without links is not a street
  if (count === 1 && prev) {
    const t = map.tiles[prev.y * map.width + prev.x];
    if (!t.road && t.owner === 'town') t.owner = null;
  }
  return count;
}

/** Points from (cx,cy) along (dx,dy) for n steps, origin included. */
function ray(cx, cy, dx, dy, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push({ x: cx + dx * i, y: cy + dy * i });
  return pts;
}

/**
 * Place a house for a town on a free tile.
 * @returns {boolean}
 */
export function placeHouse(state, rng, town, x, y, level) {
  const { map } = state;
  const t = map.tiles[y * map.width + x];
  if (!t || t.terrain === 'water' || t.building || t.rail || t.road) return false;
  t.terrain = 'grass';
  t.building = { type: 'house', townId: town.id, level, variant: rng.int(0, 15) };
  // buildingEras (opt-in): period-appropriate type for the current year; off = no houseId, unchanged
  if (erasEnabled(state)) {
    const hid = pickEraHouse(rng, level, state.date.year);
    if (hid !== null) t.building.houseId = hid;
  }
  t.owner = 'town';
  town.houses.push({ x, y });
  return true;
}

/** True if any 4-neighbour of (x,y) has road. */
export function nextToRoad(map, x, y) {
  return neighbours(map, x, y).some((n) => n.tile.road);
}

/**
 * Build the initial road grid and houses around a town centre.
 */
function buildTownLayout(state, rng, town, size) {
  const { map } = state;
  const L = 3 + size * 2;
  const { x: cx, y: cy } = town;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) layStreet(state, ray(cx, cy, dx, dy, L));
  for (const off of [-3, 3]) {
    if (size < 2) break;
    const len = L - 2;
    // side streets parallel to the main axes, starting on the main street
    for (const [dx, dy] of [[1, 0], [-1, 0]]) layStreet(state, ray(cx, cy + off, dx, dy, len));
    for (const [dx, dy] of [[0, 1], [0, -1]]) layStreet(state, ray(cx + off, cy, dx, dy, len));
  }
  for (let y = cy - L; y <= cy + L; y++) {
    for (let x = cx - L; x <= cx + L; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      if (!nextToRoad(map, x, y)) continue;
      const d = manhattan(x, y, cx, cy);
      if (!rng.chance(0.9 - d / (L * 2))) continue;
      const centrality = Math.max(0, 1 - d / L);
      const level = Math.max(1, Math.min(4, 1 + Math.floor(centrality * 3 * rng.range(0.6, 1.3))));
      placeHouse(state, rng, town, x, y, level);
    }
  }
}

/**
 * Pick town sites and generate all towns.
 * @param {object} state
 * @param {object} rng
 * @param {number} count desired number of towns
 */
export function generateTowns(state, rng, count) {
  const { map } = state;
  const used = new Set();
  const margin = 6;
  let minDist = Math.max(12, Math.floor(Math.min(map.width, map.height) / 4));
  for (let n = 0; n < count; n++) {
    let site = null;
    for (let attempt = 0; attempt < 600 && !site; attempt++) {
      if (attempt > 0 && attempt % 150 === 0) minDist = Math.max(6, minDist - 3);
      const x = rng.int(margin, map.width - 1 - margin), y = rng.int(margin, map.height - 1 - margin);
      const t = map.tiles[y * map.width + x];
      if (t.terrain === 'water' || t.height > 5 || t.building || t.road) continue;
      if (state.towns.some((o) => manhattan(o.x, o.y, x, y) < minDist)) continue;
      let land = 0;
      for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) {
        if (map.tiles[yy * map.width + xx].terrain !== 'water') land++;
      }
      if (land < 40) continue;
      site = { x, y };
    }
    if (!site) break;
    createTown(state, rng, site.x, site.y, used);
  }
}

/**
 * Create one town at (x,y): name, record, road grid and houses. Shared by the map generator and the
 * player's Found town command (cmdFound.js). Caller validates the site.
 * @param {object} state
 * @param {object} rng seeded RNG (game.rng or a generation rng)
 * @param {number} x
 * @param {number} y
 * @param {Set<string>} [used] town names already taken
 * @returns {object} town record
 */
export function createTown(state, rng, x, y, used = new Set(state.towns.map((t) => t.name))) {
  const town = {
    id: allocId(state), name: townName(rng, used), x, y, population: 0, houses: [],
    layout: townLayoutFor(x, y),
    passengersLastMonth: 0, passengersTransported: 0, goodsDelivered: 0, growthCounter: 0,
    mailLastMonth: 0, passengersThisMonth: 0, transportedThisMonth: 0, mailThisMonth: 0,
    goodsThisMonth: 0, deliveredPassThisMonth: 0,
  };
  state.towns.push(town);
  buildTownLayout(state, rng, town, rng.int(1, 3));
  recomputePopulation(state, town);
  return town;
}
