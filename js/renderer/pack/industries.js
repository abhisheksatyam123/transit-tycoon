/**
 * OpenGFX industry drawing. Ported from OpenTTD src/build_industry.h (_tile_table_*), src/industry_land.h
 * (_industry_draw_tile_data) and src/industry_cmd.cpp DrawTile_Industry, GPL-2.0.
 * Our footprint (dx along our x, dy along our y) maps to OpenTTD tile offsets X = dy, Y = dx.
 */
import { blitPack } from './draw.js';
import { INDUSTRY_LAYOUTS, INDUSTRY_GFX } from './ottd_tables.js';

/**
 * TP sub-tropical water industries (OpenTTD IT_WATER_TOWER / IT_WATER_SUPPLY). Layout gfx ids 900..903 are our own
 * entries (not OpenTTD ids): ground 2022 under the OpenGFX water tower (atlas 2344) and pumping station (atlas 2347).
 */
const TP_GFX = {
  900: [2022, 2344, 0, 0], // water tower (1x1)
  901: [2022, 2347, 0, 0], // pumping station, water supply top-left
  902: [2022, 0, 0, 0], // ground under the rest of the water supply
};
const TP_LAYOUTS = {
  water_tower: [[[0, 0, 900]]],
  water_supply: [[[0, 0, 901], [0, 1, 902], [1, 0, 902], [1, 1, 901]]],
};
const GFX = { ...INDUSTRY_GFX, ...TP_GFX };
import { subtileOffset } from './subtile.js';

/** Concrete ground drawn where a layout has no entry (OpenTTD SPR_CONCRETE_GROUND). */
const SPR_CONCRETE_GROUND = 1420;

/**
 * Our industry type id -> OpenTTD layout family in INDUSTRY_LAYOUTS (T-IA).
 * Exact footprint match only (tile sprites cannot be rotated): bank 1x2 and paper mill 3x4 use the OpenTTD footprints.
 * printing works (OTTD 4x4 layout with 4 empty corners; footprint 4x4) and food plant (OTTD 4x3 exact; footprint 4x3).
 * Quarry: OTTD coal mine variant 1 (3x3, full coverage) reused. Building materials: no OTTD analogue, procedural.
 */
export const INDUSTRY_OTTD = {
  coal_mine: 'coal_mine',
  power_station: 'power_station',
  forest: 'forest',
  sawmill: 'sawmill',
  oil_wells: 'oil_wells',
  refinery: 'oil_refinery',
  farm: 'farm',
  factory: 'factory',
  iron_mine: 'iron_mine',
  steel_mill: 'steel_mill',
  bank: 'bank',
  quarry: 'coal_mine',
  paper_mill: 'paper_mill',
  water_tower: 'water_tower',
  water_supply: 'water_supply',
  printing_works: 'printing_works',
  food_plant: 'food_plant',
  // TP sub-tropical chain (OpenTTD build_industry.h families; see ottd_tables.js)
  rubber_plantation: 'rubber_plantation',
  fruit_plantation: 'fruit_plantation',
  maize_farm: 'farm2',
  copper_mine: 'copper_mine',
  diamond_mine: 'diamond_mine',
  lumber_mill: 'lumber_mill',
  factory_tropic: 'factory_tropic',
  food_plant_tropic: 'food_plant',
  bank_tropic: 'bank_tropic',
};

/** Layouts whose OpenTTD shape has empty tiles inside the footprint; those tiles draw concrete ground. */
const HOLEY = new Set(['printing_works', 'oil_wells']); // oil wells: OTTD 3x3 layout 0 covers 5 tiles, the other 4 are bare ground

/** Layout entries of variant v that lie in the w x h footprint, as a Map key "dx,dy" -> gfx. */
function coverage(variant, w, h) {
  const m = new Map();
  for (const [X, Y, g] of variant) {
    // our (dx, dy) = (Y, X)
    if (Y < w && X < h) m.set(Y + ',' + X, g);
  }
  return m;
}

const memo = new Map();

/**
 * Choose the layout for an industry: exact footprint match first (hash picks among them), else the
 * variant covering most footprint tiles. Result cached by typeId|w|h|id.
 * @returns {Map<string, number>} "dx,dy" -> gfx
 */
export function industryLayout(typeId, w, h, id) {
  const key = typeId + '|' + w + 'x' + h + '|' + id;
  let m = memo.get(key);
  if (m !== undefined) return m;
  const fam = INDUSTRY_LAYOUTS[INDUSTRY_OTTD[typeId]] || TP_LAYOUTS[typeId] || [];
  // Exact footprint only: OpenTTD X extent must be our h, Y extent our w. No same-size layout -> null (procedural).
  const fits = (v) => Math.max(...v.map((e) => e[0] + 1)) === h && Math.max(...v.map((e) => e[1] + 1)) === w;
  let exact = fam.filter(fits);
  m = exact.length ? coverage(exact[Math.abs(id | 0) % exact.length], w, h) : null;
  // A layout must cover every footprint tile, else use procedural drawing.
  if (m && m.size !== w * h && !HOLEY.has(typeId)) m = null;
  memo.set(key, m);
  return m;
}

/**
 * Draw one industry footprint tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{id:number,typeId:string,x:number,y:number,w:number,h:number}} ind industry
 * @param {number} x tile x
 * @param {number} y tile y
 * @param {number} topX tile top corner x
 * @param {number} topY tile top corner y
 * @returns {boolean} false when the footprint has no OpenTTD layout (caller draws procedurally)
 */
export function drawOgfxIndustryTile(ctx, ind, x, y, topX, topY) {
  const w = ind.w || 1, h = ind.h || 1;
  const dx = x - ind.x, dy = y - ind.y;
  const layout = industryLayout(ind.typeId, w, h, ind.id);
  if (!layout) return false;
  const gfx = layout.get(dx + ',' + dy);
  if (gfx === undefined) { blitPack(ctx, SPR_CONCRETE_GROUND, topX, topY); return true; }
  const pair = GFX[gfx];
  if (!pair) { blitPack(ctx, SPR_CONCRETE_GROUND, topX, topY); return true; }
  if (pair[0]) blitPack(ctx, pair[0], topX, topY);
  // IA4: animated coal tower wheel / oil derrick pump replace the building sprite (one blit, no overlay)
  const bsid = gfx === GFX_COAL_TOWER ? coalTowerSprite(x, y) : gfx === GFX_OILWELL ? oilPumpSprite(x, y) : pair[1];
  if (bsid) {
    const [ox, oy] = subtileOffset(pair[2] | 0, pair[3] | 0);
    blitPack(ctx, bsid, topX + ox, topY + oy);
  }
  if (gfx === GFX_POWER_SPARKS) drawPowerSparks(ctx, x, y, topX, topY);
  return true;
}

/** OTTD GFX_COAL_MINE_TOWER_NOT_ANIMATED (industry_type.h). Our layout maps it to 2013; the wheel animates from it. */
const GFX_COAL_TOWER = 0;
/** OTTD GFX_OILWELL_NOT_ANIMATED (industry_type.h). Derrick, animated pump. */
const GFX_OILWELL = 29;
/** Coal tower wheel frames by OTTD GetAnimationFrame & 3 (industry_land.h gfx 1 rows): 2013, 2014, 2015, 2015. */
const TOWER_WHEEL = [2013, 2014, 2015, 2015];
/** Derrick pump stages: OpenGFX oilwell_anim1..6 (2174..2179). */
const OIL_PUMP = [2174, 2175, 2176, 2177, 2178, 2179];

/**
 * Coal tower sprite for tile (x,y) (OTTD AnimateMineTower, render-only). Per-tile phase on a 2048-tick cycle; the
 * wheel turns in the 0x1A0 window after 0x400, one frame per 8 ticks, otherwise the base frame 2013.
 * Time is the renderer frame / 2 (no tick counter, no state, no allocation).
 * @returns {number} sprite id
 */
function coalTowerSprite(x, y) {
  const s = ((Math.floor(industryAnimState.frame / 2) + ((x * 7 + y * 13) & 0x7ff)) & 0x7ff) - 0x400;
  if (s < 0 || s >= 0x1a0) return 2013;
  return TOWER_WHEEL[(s >> 3) & 3];
}

/**
 * Oil derrick sprite for tile (x,y) (OTTD AnimateOilWell, render-only). The pump runs 32 of every 96 ticks per tile,
 * stepping every 4 ticks through the six stages; idle = base 2174.
 * @returns {number} sprite id
 */
function oilPumpSprite(x, y) {
  const t = (Math.floor(industryAnimState.frame / 2) + ((x * 5 + y * 3) & 0x7f)) % 96;
  if (t >= 32) return 2174;
  return OIL_PUMP[(t >> 2) % OIL_PUMP.length];
}

/** IA3 animation phase (set by renderer.render); drives the power station sparks (OTTD AnimatePowerPlantSparks). */
export const industryAnimState = { frame: 0 };
/** OpenTTD gfx id of the power station sparks tile (industry_type.h GFX_POWERPLANT_SPARKS). */
const GFX_POWER_SPARKS = 10;
/** OTTD _coal_plant_sparks offsets for images 1..6 and the base sprites SPR_IT_POWER_PLANT_TRANSFORMERS + image (2055..2060). */
const SPARK_OFFS = [[11, 23], [11, 11], [14, 6], [13, 3], [18, 1], [15, 0]];
const SPARK_SPR = [2055, 2056, 2057, 2058, 2059, 2060];

/** Draw the sparks child sprite for a power station tile (render-only). */
function drawPowerSparks(ctx, x, y, topX, topY) {
  const step = Math.floor(industryAnimState.frame / 4) + ((x * 5 + y * 3) & 3);
  const n = step % 7; // 0 = no spark, 1..6 = sparks frame (OTTD image 0 draws nothing)
  if (n === 0) return;
  const [cx, cy] = SPARK_OFFS[n - 1];
  blitPack(ctx, SPARK_SPR[n - 1], topX + cx, topY + cy);
}
