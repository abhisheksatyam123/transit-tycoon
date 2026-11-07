/**
 * OpenGFX house drawing (OpenTTD temperate town houses). Ported from OpenTTD src/town_cmd.cpp
 * DrawTile_Town and src/town_land.h (_town_draw_tile_data, _original_house_specs), GPL-2.0.
 * Only fully built (stage 3) 1x1 temperate houses are used.
 */
import { blitPack, DEFAULT_CC } from './draw.js';
import { packState } from './state.js';
import { HOUSE_TABLE } from './ottd_tables.js';
import { tileHash } from '../sprites/canvas.js';
import { subtileOffset } from './subtile.js';
import { arcticState, snowSpriteId } from './arctic.js';
import { ARCTIC_HOUSES } from './arctic_house_table.js';
import { tropicState } from './tropic.js';
import { TROPIC_HOUSES } from './tropic_house_table.js';
import { blitPackFrom } from './draw.js';
import { LARGE_HOUSES } from './large_house_table.js';
import { toylandState, drawToylandHouse } from './toyland.js';

/** Concrete ground used when a house has no ground sprite. */
const SPR_CONCRETE = 1420;

/** Current game year used for min-year filtering (set from the renderer each frame). */
let gameYear = 2000;

/** @param {number} y */
export function setOgfxYear(y) { gameYear = y | 0; }

/**
 * Candidate OpenTTD house ids per our house class (level 1..4 or Moscow style).
 * Chosen from _original_house_specs by population and era; deterministic per tile hash.
 */
export const HOUSE_POOLS = {
  // level fallback: 1 small cottages, 2 low blocks, 3 mid flats, 4 tall offices
  L1: [3, 6, 25, 31],
  L2: [26, 27, 28, 29, 30],
  L3: [13, 14, 15, 16, 18],
  L4: [0, 1, 4],
  // Moscow styles -> plausible temperate houses (only ids with stage-3 building sprites)
  cottage: [3, 6, 25, 31],
  historic: [26, 27, 14, 15],
  khrushchyovka: [2, 13, 19],
  panel: [2, 13, 19],
  stalinka: [14, 15, 16, 1],
  modern: [0, 4],
  glass: [0, 4, 30],
  mall: [18, 31, 25],
  industrial: [29, 13],
  warehouse: [29, 13],
};

/** Usable (has a stage-3 building sprite) house ids for a pool, filtered by min year. */
function candidates(pool, year) {
  const all = pool.filter((id) => HOUSE_TABLE[id] && HOUSE_TABLE[id].pairs.some((p) => p[1] !== 0));
  const ok = all.filter((id) => HOUSE_TABLE[id].minYear <= year);
  return ok.length ? ok : all;
}

/**
 * Pick the OpenTTD house id and stage-3 [ground, building] pair for a tile.
 * @param {{level?:number, style?:string, variant?:number}} b tile.building
 * @param {number} x
 * @param {number} y
 * @param {number} year
 * @returns {number[]|null} [ground, building] sprite ids
 */
export function houseSprites(b, x, y, year = gameYear) {
  // building eras (buildingEras setting): the type was chosen at placement; style (Moscow) wins
  if (b.houseId && !b.style && HOUSE_TABLE[b.houseId]) {
    const hp = tileHash(x, y);
    const own = HOUSE_TABLE[b.houseId].pairs[hp & 3];
    if (own && own[1]) return own;
  }
  const key = b.style && HOUSE_POOLS[b.style] ? b.style : 'L' + Math.max(1, Math.min(4, b.level | 0 || 1));
  const pool = candidates(HOUSE_POOLS[key], year);
  if (!pool.length) return null;
  const h = tileHash(x, y);
  const id = pool[(h >>> 4) % pool.length];
  const pair = HOUSE_TABLE[id].pairs[h & 3];
  return pair[1] ? pair : null;  // [ground, building, dx, dy]
}

/**
 * Draw an OpenTTD-style house on tile (x, y). (sx, sy) is the tile centre in screen space.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} b tile.building (type 'house')
 * @param {number} x
 * @param {number} y
 * @param {number} topX tile top corner x
 * @param {number} topY tile top corner y
 * @returns {boolean} drawn
 */
export function drawOgfxHouse(ctx, b, x, y, topX, topY, snow = -1) {
  // multi-tile house part (largeHouses setting): draw this part's sprites, its footprint offset from the anchor tile
  if (b.size && b.lgId !== undefined && !toylandState.on) return drawLargeHousePart(ctx, b, x, y, topX, topY, snow);
  // sub-arctic games (arctic pack loaded): OpenTTD's sub-arctic houses, below or above the snow line (pack/arctic_house_table.js)
  if (toylandState.on && toylandState.pack && drawToylandHouse(ctx, b, x, y, topX, topY, gameYear, DEFAULT_CC)) return true;
  if (tropicState.on && tropicState.pack && drawTropicHouse(ctx, b, x, y, topX, topY)) return true;
  if (arcticState.on && arcticState.pack && drawArcticHouse(ctx, b, x, y, topX, topY, snow)) return true;
  const s = houseSprites(b, x, y);
  if (!s) return false;
  const [ox, oy] = subtileOffset(s[2], s[3]);
  // snowy garden ground above the snow line (OpenTTD DrawClearLandTile snow density); the building sprite is unchanged
  const ground = snow >= 0 && arcticState.pack && arcticState.pack.sprites[String(snowSpriteId(snow, [0, 0, 0, 0]))]
    ? snowSpriteId(snow, [0, 0, 0, 0]) : s[0];
  blitPack(ctx, ground, topX, topY);
  blitPack(ctx, s[1], topX + ox, topY + oy, b.colour || DEFAULT_CC);
  return true;
}

/**
 * Sub-tropical house for a tile (OpenTTD _original_house_specs, HouseZone::ClimateSubtropic; desert and rainforest share
 * the zone). Ids come from the TROPIC pack (pack/tropic_house_table.js); the pick is deterministic per tile hash and
 * limited to houses built by the current year (min year) and the level's population bucket.
 * @returns {boolean} drawn (false = no tropic sprite, the caller falls back to the temperate set)
 */
function drawTropicHouse(ctx, b, x, y, topX, topY) {
  const pack = tropicState.pack;
  const level = Math.max(1, Math.min(4, b.level | 0 || 1));
  const maxPop = ARCTIC_POP_MAX[level - 1];
  const minPop = level === 1 ? -1 : ARCTIC_POP_MAX[level - 2];
  let pool = TROPIC_HOUSES.filter((h) => h.minYear <= gameYear && h.pop > minPop && h.pop <= maxPop);
  if (!pool.length) pool = TROPIC_HOUSES.filter((h) => h.minYear <= gameYear);
  if (!pool.length) return false;
  const hash = tileHash(x, y);
  const h = pool[(hash >>> 4) % pool.length];
  const [ground, building, dx, dy] = h.pairs[hash & 3];
  if (!pack.sprites[String(building)] || !pack.sprites[String(ground)]) return false;
  const [ox, oy] = subtileOffset(dx, dy);
  blitPackFrom(pack, ctx, String(ground), topX, topY);
  blitPackFrom(pack, ctx, String(building), topX + ox, topY + oy, b.colour || DEFAULT_CC);
  return true;
}

/**
 * One part of a multi-tile temperate house (OpenTTD DrawTile_Town per part). The part's stage-3 ground and building
 * come from the house's own TileHash2Bit pairs (so the tile's ground matches the neighbours), drawn at the part's
 * subtile offset. b.part indexes the group; the table entry gives the sprite pair for this tile's hash.
 */
function drawLargeHousePart(ctx, b, x, y, topX, topY, snow = -1) {
  const entry = LARGE_HOUSES[b.lgId + (b.part | 0)];
  if (!entry) return false;
  const hash = tileHash(x, y);
  let [ground, building, dx, dy] = entry.pairs[hash & 3];
  // sub-arctic / sub-tropic: the bare-land ground of a part is replaced by the garden ground the 1x1 houses use
  // (concrete below the snow line, snow above it, OpenTTD DrawClearLandTile), so the parts sit on the same ground
  if (ground === 3924 && (tropicState.on || arcticState.on)) {
    ground = arcticState.on && snow >= 0 ? snowSpriteId(snow, [0, 0, 0, 0]) : 1420;
  }
  if (!HOUSE_TABLE_OK(ground)) return false;
  const [ox, oy] = subtileOffset(dx, dy);
  blitPack(ctx, ground, topX, topY);
  if (building && HOUSE_TABLE_OK(building)) blitPack(ctx, building, topX + ox, topY + oy, b.colour || DEFAULT_CC);
  return true;
}

/** True if a base-pack sprite id exists (large house parts fall back to the 1x1 look when the pack lacks them). */
function HOUSE_TABLE_OK(id) {
  return !!packState.pack?.sprites?.[String(id)];
}

/** Population buckets per level (1..4) for the sub-arctic house pools (OpenTTD population, see arctic_house_table.js). */
const ARCTIC_POP_MAX = [25, 90, 150, Infinity];

/**
 * Sub-arctic house for a tile (OpenTTD _original_house_specs ClimateSubarcticBelowSnow / AboveSnow). The house class follows
 * the snow line (snow >= 0 = above the line). Ids come from the ARCTIC pack; the pick is deterministic per tile hash.
 * @returns {boolean} drawn (false = no arctic sprite, the caller falls back to the temperate set)
 */
function drawArcticHouse(ctx, b, x, y, topX, topY, snow) {
  const pack = arcticState.pack;
  const cls = snow >= 0 ? 'above' : 'below';
  const level = Math.max(1, Math.min(4, b.level | 0 || 1));
  const maxPop = ARCTIC_POP_MAX[level - 1];
  const minPop = level === 1 ? -1 : ARCTIC_POP_MAX[level - 2];
  let pool = ARCTIC_HOUSES.filter((h) => h.snow === cls && h.pop > minPop && h.pop <= maxPop);
  if (!pool.length) pool = ARCTIC_HOUSES.filter((h) => h.snow === cls);
  if (!pool.length) return false;
  const hash = tileHash(x, y);
  const h = pool[(hash >>> 4) % pool.length];
  const [, building, dx, dy] = h.pairs[hash & 3];
  if (!pack.sprites[String(building)]) return false;
  // garden ground: concrete below the line; the flat snow sprite above it (OpenTTD DrawClearLandTile density)
  const groundId = cls === 'above' ? snowSpriteId(snow, [0, 0, 0, 0]) : 1420;
  if (!pack.sprites[String(groundId)]) return false;
  const [ox, oy] = subtileOffset(dx, dy);
  blitPackFrom(pack, ctx, String(groundId), topX, topY);
  blitPackFrom(pack, ctx, String(building), topX + ox, topY + oy, b.colour || DEFAULT_CC);
  return true;
}
