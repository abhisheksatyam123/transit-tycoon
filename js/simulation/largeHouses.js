/**
 * Multi-tile houses (OpenTTD town_cmd.cpp CheckTownBuild2House / CheckTownBuild2x2House, GetHouseNorthPart), opt-in via
 * the `largeHouses` setting (default off: no call places anything, so default games and hashes are unchanged).
 *
 * A group is a 1x2 or 2x2 temperate house (OpenTTD spec ids 7, 20, 32, from the OpenTTD _original_house_specs table). Each covered tile carries a house building {type:'house', townId, level, variant,
 * size, part, ax, ay, lgId: groupId}: part is the index in the group, (ax, ay) the anchor (the tile holding the
 * first part, which is the only town.houses entry, so population counts the house once at its anchor level).
 * Demolition and removal clear every part through clearHouseAt.
 */
import { getSetting } from './settings.js';
import { isArctic, isToyland, isTropic, snowDensity, snowLineOf } from './climate.js';

/**
 * Multi-tile groups (OpenTTD _original_house_specs; ids and climates come from the OpenTTD spec, not from
 * renderer/pack/large_house_table.js, which only holds per-part sprite data): first part id, size, offsets (dx, dy) of each part, earliest year, and the
 * climates it may be built in ('temperate', 'arctic-below' / 'arctic-above' = sub-arctic below / above the snow line,
 * 'tropic' = sub-tropic). OpenTTD places part p at TileDiffXY(0,1)/(1,0)/(1,1) in ITS axes; our x axis is OpenTTD's y
 * (screen sx = (x - y) * W/2), so dx/dy are swapped.
 */
export const LARGE_GROUPS = [
  { id: 7, size: '1x2', w: 2, h: 1, minYear: 1959, climates: ['temperate'], parts: [[0, 0], [1, 0]] },
  { id: 20, size: '2x2', w: 2, h: 2, minYear: 0, climates: ['temperate'], parts: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { id: 32, size: '2x2', w: 2, h: 2, minYear: 1958, climates: ['temperate', 'arctic-below', 'tropic'], parts: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { id: 40, size: '2x2', w: 2, h: 2, minYear: 1983, climates: ['temperate'], parts: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { id: 66, size: '1x2', w: 2, h: 1, minYear: 1972, climates: ['arctic-below'], parts: [[0, 0], [1, 0]] },
  { id: 68, size: '1x2', w: 2, h: 1, minYear: 1972, climates: ['arctic-above'], parts: [[0, 0], [1, 0]] },
];

/** Chance that a successful 1x1 house attempt tries a multi-tile house instead. */
const LARGE_HOUSE_CHANCE = 0.2;

/** True when the largeHouses setting is on (every climate; each group names the climates it may be built in). */
export function largeHousesEnabled(state) {
  return !!getSetting(state, 'largeHouses');
}

/**
 * Climate tag of a footprint at height z (see LARGE_GROUPS.climates): sub-tropic games are 'tropic', sub-arctic games
 * are 'arctic-above' at or above the snow line (snow density >= 0, as drawOgfxBuilding) and 'arctic-below' otherwise.
 */
function largeClimateTag(state, z) {
  if (isToyland(state)) return 'toyland'; // no toyland large-house groups yet: 1x1 houses only
  if (isTropic(state)) return 'tropic';
  if (isArctic(state)) return snowDensity(z, snowLineOf(state)) >= 0 ? 'arctic-above' : 'arctic-below';
  return 'temperate';
}

/**
 * Remove the house on tile (x, y) and every other part of its multi-tile house: clears the building and owner of each
 * part, and drops the anchor from its town's house list. Safe on 1x1 houses (clears the one tile).
 * @returns {number} count of tiles cleared
 */
export function clearHouseAt(state, x, y) {
  const { map } = state;
  const t = map.tiles[y * map.width + x];
  if (!t || !t.building || t.building.type !== 'house') return 0;
  const b = t.building;
  const town = state.towns.find((o) => o.id === b.townId);
  if (!b.size) {
    if (town) town.houses = town.houses.filter((h) => h.x !== x || h.y !== y);
    t.building = null; t.owner = null;
    return 1;
  }
  const g = LARGE_GROUPS.find((q) => q.id === b.lgId);
  const ax = b.ax, ay = b.ay;
  if (town) town.houses = town.houses.filter((h) => h.x !== ax || h.y !== ay);
  let n = 0;
  const offs = g ? g.parts : [[0, 0]];
  for (const [dx, dy] of offs) {
    const px = ax + dx, py = ay + dy;
    const q = map.tiles[py * map.width + px];
    if (q && q.building && q.building.type === 'house' && q.building.ax === ax && q.building.ay === ay) {
      q.building = null; q.owner = null; n++;
    }
  }
  return n;
}

/**
 * Try to place a multi-tile house whose footprint covers the free tile (x, y) (chosen from the 1x1 growth site).
 * Every footprint tile must be free land at the same height, inside the same town (closest town), with no road/rail/
 * object/water, and not already built. Uses only the rng passed in, so it is deterministic.
 * @returns {boolean} true if a multi-tile house was placed
 */
export function placeLargeHouse(state, rng, town, x, y, level, year) {
  if (!largeHousesEnabled(state) || state.scenario === 'moscow') return false;
  if (!rng.chance(LARGE_HOUSE_CHANCE)) return false;
  const { map } = state;
  // the climate of the site decides which groups may cover it: the tile under (x, y) (footprint is flat, see below)
  const site = map.tiles[y * map.width + x];
  if (!site) return false;
  const tag = largeClimateTag(state, site.height);
  const options = LARGE_GROUPS.filter((g) => g.minYear <= year && g.climates.includes(tag));
  if (!options.length) return false;
  const g = options[rng.int(0, options.length - 1)];
  // anchor choices: the footprint must cover (x, y)
  const anchors = [];
  for (const [dx, dy] of g.parts) anchors.push([x - dx, y - dy]);
  const [ax, ay] = anchors[rng.int(0, anchors.length - 1)];
  const at = map.tiles[ay * map.width + ax];
  if (!at) return false;
  const tiles = [];
  for (const [dx, dy] of g.parts) {
    const px = ax + dx, py = ay + dy;
    if (px < 0 || py < 0 || px >= map.width || py >= map.height) return false;
    const t = map.tiles[py * map.width + px];
    if (!t || t.terrain === 'water' || t.building || t.rail || t.road || t.object) return false;
    if (t.height !== at.height) return false;
    if (t.owner && t.owner !== 'town') return false;
    tiles.push({ t, px, py });
  }
  for (const { px, py } of tiles) {
    // inside the town: the nearest town centre of each covered tile must be this town
    let nearest = null, bd = Infinity;
    for (const o of state.towns) {
      const d = Math.abs(o.x - px) + Math.abs(o.y - py);
      if (d < bd) { bd = d; nearest = o; }
    }
    if (nearest !== town) return false;
  }
  const variant = rng.int(0, 15);
  tiles.forEach(({ t }, i) => {
    t.terrain = 'grass';
    t.building = { type: 'house', townId: town.id, level, variant, size: g.size, part: i, ax, ay, lgId: g.id };
    t.owner = 'town';
  });
  town.houses.push({ x: ax, y: ay });
  return true;
}
