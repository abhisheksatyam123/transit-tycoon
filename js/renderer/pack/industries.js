/**
 * OpenGFX industry drawing. Ported from OpenTTD src/build_industry.h (_tile_table_*), src/industry_land.h
 * (_industry_draw_tile_data) and src/industry_cmd.cpp DrawTile_Industry, GPL-2.0.
 * Our footprint (dx along our x, dy along our y) maps to OpenTTD tile offsets X = dy, Y = dx.
 */
import { blitPack } from './draw.js';
import { INDUSTRY_LAYOUTS, INDUSTRY_GFX } from './ottd_tables.js';
import { subtileOffset } from './subtile.js';

/** Concrete ground drawn where a layout has no entry (OpenTTD SPR_CONCRETE_GROUND). */
export const SPR_CONCRETE_GROUND = 1420;

/**
 * Our industry type id -> OpenTTD layout family in INDUSTRY_LAYOUTS (T-IA).
 * Exact footprint match only (tile sprites cannot be rotated): bank 1x2 and paper mill 3x4 use the OpenTTD footprints.
 * Not mapped (procedural): printing works (OTTD 4x4, ours 3x2), food plant (OTTD 3x4/4x3, ours 3x3), building materials
 * (no OTTD equivalent). Quarry has no OTTD equivalent: coal mine art (3x3, exact) stays as a reuse.
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
};

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
  const fam = INDUSTRY_LAYOUTS[INDUSTRY_OTTD[typeId]] || [];
  // Exact footprint only: OpenTTD X extent must be our h, Y extent our w. No same-size layout -> null (procedural).
  const fits = (v) => Math.max(...v.map((e) => e[0] + 1)) === h && Math.max(...v.map((e) => e[1] + 1)) === w;
  let exact = fam.filter(fits);
  m = exact.length ? coverage(exact[Math.abs(id | 0) % exact.length], w, h) : null;
  // A layout must cover every footprint tile, else use procedural drawing.
  if (m && m.size !== w * h) m = null;
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
  const pair = INDUSTRY_GFX[gfx];
  if (!pair) { blitPack(ctx, SPR_CONCRETE_GROUND, topX, topY); return true; }
  if (pair[0]) blitPack(ctx, pair[0], topX, topY);
  if (pair[1]) {
    const [ox, oy] = subtileOffset(pair[2] | 0, pair[3] | 0);
    blitPack(ctx, pair[1], topX + ox, topY + oy);
  }
  return true;
}
