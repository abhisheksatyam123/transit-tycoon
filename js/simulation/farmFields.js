/**
 * T29 farm fields (OpenLoco Industry::expandGrounds / isFarmTileProducing / calculateFarmProduction, OpenTTD
 * PlantFarmField). Opt-in: only when the farmFields setting is on; default games never call into this file.
 *
 * A farm plants field tiles on free grass in a ring around its footprint. A field is a plain tile property
 * (tile.field = industryId, no building), so save/load round-trips it with the map. The farm's production rate
 * (ind.productionRate, 0..255) is the field count against FARM_NUM_FIELDS, as OpenLoco's
 * productionRate = relativeFarmSize * 256 / farmNumFields (fields stand in for OpenLoco's 25-tile units).
 * Clearing: building over a field costs COSTS.clearField and removes it (trackRules clearingCost / clearTerrain).
 */
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { COSTS } from '../config/costs.js';
import { getSetting } from './settings.js';
import { isArctic, snowLineOf } from './climate.js';

/** Fields a farm aims for (OpenLoco farmNumFields); production is 255 at this count. */
export const FARM_NUM_FIELDS = 8;
/** Fields planted when a farm is built. */
const FARM_START_FIELDS = 4;
/** Ring width (tiles) around the footprint where fields may be planted. */
const RING = 3;

/** True for an industry type that grows fields (any producer of grain). */
function isFarmType(type) {
  return !!type && (type.produces || []).includes('GRAI');
}

/** True when the 8 neighbours share height h (corner heights blend neighbours, so the tile is drawn flat). */
function flatAround(map, x, y, h) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    if (map.tiles[ny * map.width + nx].height !== h) return false;
  }
  return true;
}

/**
 * OpenTTD PlantFarmField (src/industry_cmd.cpp:1052-1056): on an arctic map "if (GetTileZ(tile) + 2 >= GetSnowLine())
 * return;" - no field this high. Only with climateGrowthOttd (opt-in); default games keep every flat free tile.
 */
function snowBlocksField(state, height) {
  return getSetting(state, 'climateGrowthOttd') === true && isArctic(state) && height + 2 >= snowLineOf(state);
}

/** Ring tiles (outside the footprint) where a field of `ind` may go, in deterministic scan order. */
function ringSites(state, ind) {
  const { map } = state;
  const out = [];
  for (let y = ind.y - RING; y < ind.y + ind.h + RING; y++) {
    for (let x = ind.x - RING; x < ind.x + ind.w + RING; x++) {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      if (x >= ind.x && y >= ind.y && x < ind.x + ind.w && y < ind.y + ind.h) continue;
      const t = map.tiles[y * map.width + x];
      if (t.terrain === 'water' || t.building || t.rail || t.road || t.field !== undefined) continue;
      if (snowBlocksField(state, t.height)) continue; // arctic + climateGrowthOttd: no fields at/above the snow line
      if (!flatAround(map, x, y, t.height)) continue; // the field sprite is flat: only tiles with flat corners
      out.push({ x, y });
    }
  }
  return out;
}

/** Field tiles that still belong to `ind` (building over one clears it, so the list is pruned here). */
export function farmFieldTiles(state, ind) {
  const { map } = state;
  const list = (ind.fields || []).filter(([x, y]) => map.tiles[y * map.width + x].field === ind.id);
  ind.fields = list;
  return list;
}

/** productionRate from the field count (OpenLoco calculateFarmProduction, fields for 25-tile units). */
export function farmProductionRate(fieldCount) {
  return Math.min(255, Math.floor((fieldCount * 256) / FARM_NUM_FIELDS));
}

function plantAt(state, ind, x, y) {
  const t = state.map.tiles[y * state.map.width + x];
  t.field = ind.id;
  (ind.fields || (ind.fields = [])).push([x, y]);
}

/** At construction: plant the first FARM_START_FIELDS free ring tiles (deterministic, no RNG draws). */
export function plantInitialFields(state, ind) {
  if (!getSetting(state, 'farmFields') || !isFarmType(INDUSTRY_BY_ID[ind.typeId])) return;
  ind.fields = [];
  for (const s of ringSites(state, ind).slice(0, FARM_START_FIELDS)) plantAt(state, ind, s.x, s.y);
  ind.productionRate = farmProductionRate(farmFieldTiles(state, ind).length);
}

/**
 * Monthly: a farm below its target plants one more field on a random ring tile (game.rng, one draw each month
 * while below target; no draws when the setting is off), then the production rate follows the field count.
 * Called from loco/industry.js updateMonthly.
 */
export function updateFarmMonthly(game, ind) {
  const state = game.state;
  if (!getSetting(state, 'farmFields') || !isFarmType(INDUSTRY_BY_ID[ind.typeId])) return;
  const have = farmFieldTiles(state, ind).length;
  if (!ind.closingDown && have < FARM_NUM_FIELDS && game.rng.int(0, 1) === 0) {
    const sites = ringSites(state, ind);
    if (sites.length) {
      const s = sites[game.rng.int(0, sites.length - 1)];
      plantAt(state, ind, s.x, s.y);
    }
  }
  ind.productionRate = farmProductionRate(farmFieldTiles(state, ind).length);
}

/** Remove the fields of an industry that is being removed (RemoveIndustry). */
export function clearFarmFields(state, ind) {
  const { map } = state;
  for (const [x, y] of ind.fields || []) {
    const t = map.tiles[y * map.width + x];
    if (t.field === ind.id) delete t.field;
  }
  ind.fields = [];
}

/** Price to clear a field before building on it (OpenTTD: clearing a farm field, small). */
