/**
 * Toyland climate (opt-in 'toyland', pack/toyland.js): OpenGFX toyland ground (bare, grass, rough, rocky) and toyland
 * town houses from the TOYLAND pack (assets/opengfx/toyland, tools/ogfx/extract_toyland.js). Ported from OpenTTD
 * clear_cmd.cpp (DrawClearLandTile: density-dependent ground group + SlopeToSpriteOffset), town_land.h (1x1 houses with
 * HouseZone::ClimateToyland, see toyland_table.js) and tree_land.h (TREE_TOYLAND rows, see toyland_table.js).
 * GPL-2.0 (OpenTTD).
 */
import { blitPackFrom } from './draw.js';
import { HALF_H, HEIGHT_STEP as S, TILE_W, TILE_H } from '../iso.js';
import { slopeBits } from './slope.js';
import { drawSloped } from '../slope.js';
import { makeSprite } from '../sprites/canvas.js';
import { subtileOffset } from './subtile.js';
import { tileHash } from '../sprites/canvas.js';
import { TOYLAND_HOUSES, TOYLAND_TREE_ROWS, TOYLAND_INDUSTRY_LAYOUTS, TOYLAND_INDUSTRY_GFX, TOYLAND_INDUSTRY_CHILDREN } from './toyland_table.js';
import { TOYLAND_OVERRIDE_BLOCKS } from './toyland_overrides.js';
import { TOYLAND_VEH_KEY, toylandVehicleSprites } from './toyland_vehicles.js';
import { packState } from './state.js';
import { clearTints } from './draw.js';
import { clearPackTops } from './ground.js';
import { clearDiagRoads } from './diagRoad.js';
import { clearShoreCache } from './water.js';

/** Ground group bases (19 sprites each: flat + 14 slopes + steep): OpenGFX toyland groundtile sets. */
export const TOYLAND_GROUND = {
  bare0: 0, // bare land, 0 % grassy
  bare1: 19, // bare land, 33 % grassy
  bare2: 38, // bare land, 66 % grassy
  grass: 57, // grass, 100 % grassy
  rough: 86, // rough terrain
  rocks: 109, // rocky terrain
};
/** OpenTTD _slope_to_sprite_offset (landscape.cpp), indexed by slope bits (W=1,S=2,E=4,N=8). */
const SLOPE_OFFSET = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0];
/** Population buckets of a house level (same as the sub-arctic and sub-tropical pools). */
const POP_MAX = [25, 90, 150, Infinity];

/** Toyland pack (set by pack/index.js) and the toyland flag of the attached game (set by the renderer). */
export const toylandState = { pack: null, base: null, on: false, top: [], map: null };

/** Attach the climate flag and the game map. Resets the cached flat tops. */
export function setToylandClimate(on, map = null) {
  toylandState.on = !!on;
  toylandState.map = map;
  toylandState.top = [];
  applyToylandView();
}

/** Base OpenGFX sprite id -> toyland pack sprite id, for every override block (TY4, toyland_overrides.js). */
export const TOYLAND_OVERRIDE_MAP = (() => {
  const m = new Map();
  for (const [a, b, base] of TOYLAND_OVERRIDE_BLOCKS) for (let t = a; t <= b; t++) m.set(base + t - a, t);
  return m;
})();

let viewCache = null; // { base, toy, pack } last composite view

/**
 * Composite view of the base pack for toyland games (TY4): a copy of the base sprite table in which every
 * override id points at the toyland sprite (atlases appended after the base atlases). The base pack is not mutated.
 * @returns {object} pack-shaped object (sprites, groups, atlases, masks, tint)
 */
export function buildToylandView(base, toy) {
  if (viewCache && viewCache.base === base && viewCache.toy === toy) return viewCache.pack;
  const sprites = { ...base.sprites };
  const off = base.atlases.length;
  for (const [id, t] of TOYLAND_OVERRIDE_MAP) {
    const s = toy.sprites[String(t)];
    if (!s) continue;
    const [ai, x, y, w, h, xo, yo, cc] = s;
    sprites[String(id)] = [ai + off, x, y, w, h, xo, yo, cc];
  }
  // TY5 toyland vehicle art (keys TOYLAND_VEH_KEY + toyland id, see pack/toyland_vehicles.js): new keys only
  for (const id of toylandVehicleSprites()) {
    const k = String(TOYLAND_VEH_KEY + id);
    const s = toy.sprites[k];
    if (s) sprites[k] = [s[0] + off, s[1], s[2], s[3], s[4], s[5], s[6], s[7]];
  }
  const pack = {
    sprites,
    groups: base.groups,
    atlases: [...base.atlases, ...toy.atlases],
    masks: [...base.masks, ...toy.masks],
    tint: new Map(),
  };
  viewCache = { base, toy, pack };
  return pack;
}

/**
 * Point the shared pack at the toyland view while a toyland game is on (and the toyland pack is loaded), back to the
 * base pack otherwise. Caches keyed by sprite id are dropped on every swap. No-op until the base pack is known.
 */
export function applyToylandView() {
  const base = toylandState.base;
  if (!base) return;
  const next = toylandState.on && toylandState.pack ? buildToylandView(base, toylandState.pack) : base;
  if (packState.pack === next) return;
  packState.pack = next;
  clearTints();
  clearPackTops();
  clearDiagRoads();
  clearShoreCache();
}

/** Active when the game is toyland, the toyland pack is loaded and the OpenGFX toggle is on. */
export function toylandActive(packEnabled) { return !!(toylandState.on && toylandState.pack && packEnabled); }

/**
 * Ground group base for a terrain kind and tile hash (OpenTTD clear_cmd.cpp density choice, simplified): grass and
 * forest floors are mostly full grass with some bare patches; rock is the rocky set; desert terrain has no toyland
 * form and is drawn as bare land.
 * @param {string} kind terrain kind ('grass', 'forest', 'rock', 'desert')
 * @param {number} hash tile hash
 * @returns {number} group base id, or -1 when the kind has no toyland ground
 */
export function toylandGroundBase(kind, hash) {
  if (kind === 'grass' || kind === 'forest') {
    const r = hash & 7;
    return r === 0 ? TOYLAND_GROUND.bare2 : r === 1 ? TOYLAND_GROUND.bare1 : TOYLAND_GROUND.grass;
  }
  if (kind === 'rock') return TOYLAND_GROUND.rocks;
  if (kind === 'desert') return TOYLAND_GROUND.bare0;
  return -1;
}

/**
 * Sprite id of the toyland ground of a tile with a slope of at most one level (OpenGFX slope sprite), or -1.
 * @param {string} kind
 * @param {number} hash
 * @param {number[]} c corner heights [hN,hE,hS,hW]
 */
export function toylandGroundId(kind, hash, c) {
  const base = toylandGroundBase(kind, hash);
  if (base < 0) return -1;
  return base + SLOPE_OFFSET[slopeBits(c)];
}

/**
 * Draw the toyland ground of a tile. Spread <= 1 uses the OpenGFX slope sprite; steeper tiles are drawn as planes with
 * the flat sprite (the same rule as the desert and snow ground).
 * @returns {boolean} false when the toyland pack lacks the sprite
 */
export function drawToylandGround(ctx, sx, sy, c, hash, kind) {
  const pack = toylandState.pack;
  if (!pack) return false;
  const base = toylandGroundBase(kind, hash);
  if (base < 0) return false;
  const min = Math.min(c[0], c[1], c[2], c[3]);
  const max = Math.max(c[0], c[1], c[2], c[3]);
  if (max - min > 1) {
    const top = flatTop(base);
    if (!top) return false;
    drawSloped(ctx, top, sx, sy, c);
    return true;
  }
  const id = String(base + SLOPE_OFFSET[slopeBits(c)]);
  if (!pack.sprites[id]) return false;
  return blitPackFrom(pack, ctx, id, sx, sy - HALF_H - S * min);
}

/** Flat sprite (anchored at the tile centre) of a ground group, cached per base. */
function flatTop(base) {
  if (toylandState.top[base] !== undefined) return toylandState.top[base];
  const pack = toylandState.pack;
  const s = pack && pack.sprites[String(base)];
  if (!s) return null;
  const [ai, x0, y0, w0, h0] = s;
  const t = makeSprite(TILE_W, TILE_H, TILE_W / 2, TILE_H / 2, (ctx) => {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pack.atlases[ai], x0, y0, w0, h0, -TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H);
  });
  toylandState.top[base] = t;
  return t;
}

/**
 * Toyland house for a level and tile hash (OpenTTD _original_house_specs, HouseZone::ClimateToyland, 1x1 only). The pool
 * is limited to houses built by the year (min year) and the level's population bucket; the pick is deterministic.
 * @param {number} year game year
 * @param {number} level house level 1..4
 * @param {number} hash tile hash
 * @returns {{ground:number, building:number, dx:number, dy:number}|null}
 */
export function pickToylandHouse(year, level, hash) {
  const lv = Math.max(1, Math.min(4, level | 0 || 1));
  const maxPop = POP_MAX[lv - 1];
  const minPop = lv === 1 ? -1 : POP_MAX[lv - 2];
  let pool = TOYLAND_HOUSES.filter((h) => h.minYear <= year && h.pop > minPop && h.pop <= maxPop);
  if (!pool.length) pool = TOYLAND_HOUSES.filter((h) => h.minYear <= year);
  if (!pool.length) return null;
  const h = pool[(hash >>> 4) % pool.length];
  const [ground, building, dx, dy] = h.pairs[hash & 3];
  return { ground, building, dx, dy };
}

/**
 * Draw a toyland house on its tile. Returns false when the pack lacks the sprites (the caller falls back).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{level?:number, colour?:number}} b tile.building
 * @param {number} x tile x
 * @param {number} y tile y
 * @param {number} topX
 * @param {number} topY
 * @param {number} year game year
 * @param {number} defaultCc default company colour
 */
export function drawToylandHouse(ctx, b, x, y, topX, topY, year, defaultCc) {
  const pack = toylandState.pack;
  if (!pack) return false;
  const p = pickToylandHouse(year, b.level, tileHash(x, y));
  if (!p || !pack.sprites[String(p.building)] || !pack.sprites[String(p.ground)]) return false;
  const [ox, oy] = subtileOffset(p.dx, p.dy);
  blitPackFrom(pack, ctx, String(p.ground), topX, topY);
  blitPackFrom(pack, ctx, String(p.building), topX + ox, topY + oy, b.colour || defaultCc);
  return true;
}

/**
 * Toyland tree layout row for a tree tile: the TREE_TOYLAND type from the hash (9 types), the layout index from the
 * count bits (the caller adds the grown stage).
 * @param {number} tmp CountBits of the tile hash
 * @param {number} h tile hash
 * @returns {number[]} four base-atlas sprite ids
 */
export function toylandTreeRow(tmp, h) {
  const types = TOYLAND_TREE_ROWS.length >> 2;
  return TOYLAND_TREE_ROWS[(tmp & 3) + ((h % types) << 2)];
}

/** Toyland industry tile memo: "typeId|w x h|id" -> Map "dx,dy" -> gfx (null = procedural). */
const indMemo = new Map();

/**
 * OpenTTD layout for a toyland industry footprint (TY3, build_industry.h _tile_table_*). Exact footprint only: the
 * variant's OpenTTD X extent must equal our h and its Y extent our w; the variant is picked by the industry id.
 * Footprint tiles the layout leaves empty draw the toyland pavement ground (4675, see SPR_TOY_HOLE).
 * @returns {Map<string, number>|null} "dx,dy" -> gfx, or null when no variant fits
 */
export function toylandIndustryLayout(typeId, w, h, id) {
  const key = typeId + '|' + w + 'x' + h + '|' + id;
  if (indMemo.has(key)) return indMemo.get(key);
  const fam = TOYLAND_INDUSTRY_LAYOUTS[typeId] || [];
  const fits = (v) => Math.max(...v.map((e) => e[0] + 1)) === h && Math.max(...v.map((e) => e[1] + 1)) === w;
  const exact = fam.filter(fits);
  let m = null;
  if (exact.length) {
    m = new Map();
    for (const [X, Y, g] of exact[Math.abs(id | 0) % exact.length]) m.set(Y + ',' + X, g); // our (dx,dy) = (Y,X)
  }
  indMemo.set(key, m);
  return m;
}

/** Pavement ground for a toyland industry footprint tile the OpenTTD layout leaves empty (OpenGFX toyland 4675). */
export const SPR_TOY_HOLE = 4675;

/**
 * Draw one toyland industry footprint tile from the TOYLAND pack (OpenGFX ids 4677+ and the base industry ids the
 * toyland pack carries, see tools/ogfx/extract_toyland.js). Returns false when there is no toyland layout for the
 * footprint or the pack lacks the sprites (the caller falls back to the temperate path / procedural art).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{id:number,typeId:string,x:number,y:number,w:number,h:number}} ind industry
 * @param {number} x tile x
 * @param {number} y tile y
 * @param {number} topX tile top corner x
 * @param {number} topY tile top corner y
 */
export function drawToylandIndustryTile(ctx, ind, x, y, topX, topY) {
  const pack = toylandState.pack;
  if (!pack) return false;
  const w = ind.w || 1, h = ind.h || 1;
  const layout = toylandIndustryLayout(ind.typeId, w, h, ind.id);
  if (!layout) return false;
  const gfx = layout.get((x - ind.x) + ',' + (y - ind.y));
  if (gfx === undefined) { blitPackFrom(pack, ctx, String(SPR_TOY_HOLE), topX, topY); return true; } // empty layout tile
  const pair = TOYLAND_INDUSTRY_GFX[gfx];
  if (!pair) return false;
  const [ground, building, dx, dy] = pair;
  if (!ground && !building) return false;
  blitPackFrom(pack, ctx, String(ground || SPR_TOY_HOLE), topX, topY);
  if (building) {
    const [ox, oy] = subtileOffset(dx | 0, dy | 0);
    blitPackFrom(pack, ctx, String(building), topX + ox, topY + oy);
  }
  // OTTD special draw proc (industry_cmd.cpp): child sprites at screen offsets from the tile origin, frame 0
  for (const [sid, cx, cy] of TOYLAND_INDUSTRY_CHILDREN[gfx] || []) blitPackFrom(pack, ctx, String(sid), topX + cx, topY + cy);
  return true;
}
