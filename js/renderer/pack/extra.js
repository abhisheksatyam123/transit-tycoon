/**
 * OpenGFX EXTRA sprites (separate pack, tools/ogfx/extract_extra.js): canal water and dikes, lock water
 * and gates, river slopes, tram overlays. Ported from OpenTTD src/water_cmd.cpp (DrawCanalWater,
 * DrawWaterEdges, DrawWaterLock, DrawRiverWater), src/table/water_land.h (_lock_display_data),
 * src/road_cmd.cpp (GetRoadSpriteOffset, SPR_TRAMWAY_OVERLAY) (GPL-2.0).
 * Ground pieces are anchored at the tile's LOWEST corner (as pack/ground.js does). Each function returns
 * false when the pack or the sprite is missing, so the caller keeps the procedural art.
 */
import { packState } from './state.js';
import { blitPackFrom } from './draw.js';
import { HALF_H, HEIGHT_STEP as S } from '../iso.js';
import { twoCornerSlope } from './rail.js';

/** Flat water in the base pack (OpenTTD SPR_FLAT_WATER_TILE). */
const FLAT_WATER = 4061;
/** Slope name -> canal_water / river_slope index: flat is 0, slopes 1 + OpenTTD ground index (DrawWaterLock/DrawRiverWater). */
const WATER_SLOPE = { SE: 1, NE: 2, SW: 3, NW: 4 };
/** OpenTTD lock ground index per slope (table/water_land.h TILE_SPRITE_LINE): NE 1, SE 0, SW 2, NW 3. */
const LOCK_GROUND = { NE: 1, SE: 0, SW: 2, NW: 3 };
/** Lock part base in the 24 locks.* sprites: middle 0, lower 8, upper 16 (front wall = rear + 4). */
const LOCK_BASE = { middle: 0, lower: 8, upper: 16 };
/** Our lock climb bit -> slope name: bit N (raised N+E corners), E (E+S), S (S+W), W (W+N). */
const LOCK_SLOPE = { 1: 'NE', 2: 'SE', 4: 'SW', 8: 'NW' };
/** Our tram bit (N=1 E=2 S=4 W=8) -> OpenTTD RoadBit (NW=1 SW=2 SE=4 NE=8). */
const TRAM_BITS = { 1: 8, 2: 4, 4: 2, 8: 1 };
/** OpenTTD GetRoadSpriteOffset flat table indexed by RoadBits (road_cmd.cpp). */
const ROAD_OFFSET = [0, 18, 17, 7, 16, 0, 10, 5, 15, 8, 1, 4, 9, 3, 6, 2];
/** Tram slope offsets (GetRoadSpriteOffset slope case): NE 11, SE 12, SW 13, NW 14. */
const TRAM_SLOPE = { NE: 11, SE: 12, SW: 13, NW: 14 };
/** Straight tram axis on a diagonal slope: X (our N|S, mask 5) on NE/SW, Y (E|W, 10) on SE/NW. */
const SLOPE_AXIS = { NE: 5, SW: 5, SE: 10, NW: 10 };

/** Extra pack loaded and drawing on. */
export function extraActive() { return !!(packState.extra && packState.pack && packState.enabled); }
/** Extra sprite present. */
function has(key) { return !!(packState.extra && packState.extra.sprites[key]); }
/** Blit an extra sprite whose top corner is the tile's lowest corner. */
function blitExtra(ctx, key, sx, sy, c) {
  const min = Math.min(c[0], c[1], c[2], c[3]);
  return blitPackFrom(packState.extra, ctx, key, sx, sy - HALF_H - S * min);
}
const flat = (c) => c[0] === c[1] && c[1] === c[2] && c[2] === c[3];

/**
 * Canal or lock tile (OpenTTD DrawCanalWater / DrawWaterLock).
 * Canal: flat canal water, then dikes on each side whose neighbour is not water, then the corner pieces
 * (DrawWaterEdges). Lock: water (flat for lower/upper, slope for middle), then the rear and front gate sprite.
 * @param {object} map
 * @param {number} x
 * @param {number} y
 * @param {number} sx flat tile centre x
 * @param {number} sy flat tile centre y
 * @param {number[]} c corner heights [N,E,S,W]
 * @param {{dir:number,part:string}|null} lock lock info of the tile
 * @returns {boolean} false when the caller must draw the procedural canal
 */
export function drawCanalPack(ctx, map, x, y, sx, sy, c, lock) {
  if (!extraActive() || !has('canal_water.0')) return false;
  if (lock) {
    // water follows the tile geometry (slope of the middle tile); gates follow the lock direction
    const base = LOCK_BASE[lock.part];
    const dirName = LOCK_SLOPE[lock.dir];
    if (base === undefined || !dirName) return false;
    const water = lock.part === 'middle' ? WATER_SLOPE[twoCornerSlope(c)] : 0;
    if (water === undefined || !has('canal_water.' + water)) return false;
    const rear = base + LOCK_GROUND[dirName];
    if (!has('locks.' + rear) || !has('locks.' + (rear + 4))) return false;
    blitExtra(ctx, 'canal_water.' + water, sx, sy, c);
    blitExtra(ctx, 'locks.' + rear, sx, sy, c);
    // front wall: OTTD DrawTileSeqStruct dx/dy (water_land.h): (0,15) on NE/SW, (15,0) on SE/NW. RemapCoords
    // per 1/16 tile: px = 2*(dy-dx), py = dx+dy (dz 0); one tile = 64 px wide, so 16 units = 32 px half-width.
    const [fdx, fdy] = dirName === 'NE' || dirName === 'SW' ? [0, 15] : [15, 0];
    const fx = 2 * (fdy - fdx), fy = fdx + fdy;
    blitExtra(ctx, 'locks.' + (rear + 4), sx + fx, sy + fy, c);
    return true;
  }
  if (!flat(c)) return false; // a sloped canal tile is not drawn by OpenTTD's canal code (water is flat)
  blitExtra(ctx, 'canal_water.0', sx, sy, c);
  // dike feature (DrawWaterEdges): neighbour bits N, E, S, W on OpenTTD x-1, y+1, x+1, y-1 = our N, E, S, W
  const W = map.width, H = map.height, t = map.tiles;
  const watered = (nx, ny) => nx >= 0 && ny >= 0 && nx < W && ny < H && (!!t[ny * W + nx].canal || t[ny * W + nx].terrain === 'water');
  const n = watered(x, y - 1), e = watered(x + 1, y), s = watered(x, y + 1), w = watered(x - 1, y);
  [!n, !e, !s, !w].forEach((land, i) => { if (land && has('canal_dikes.' + i)) blitExtra(ctx, 'canal_dikes.' + i, sx, sy, c); });
  // corner pieces as OpenTTD DrawWaterEdges: right=N+E (4 land / 8 both watered, diagonal land), bottom=E+S (5/9),
  // left=S+W (6/10), upper=W+N (7/11); diagonal = the tile between the two neighbours
  const pick = [
    (!n && !e) ? 4 : (n && e && !watered(x + 1, y - 1) ? 8 : -1),
    (!e && !s) ? 5 : (e && s && !watered(x + 1, y + 1) ? 9 : -1),
    (!s && !w) ? 6 : (s && w && !watered(x - 1, y + 1) ? 10 : -1),
    (!w && !n) ? 7 : (w && n && !watered(x - 1, y - 1) ? 11 : -1),
  ];
  for (const k of pick) if (k >= 0 && has('canal_dikes.' + k)) blitExtra(ctx, 'canal_dikes.' + k, sx, sy, c);
  return true;
}

/**
 * River tile (OpenTTD DrawRiverWater): flat water (4061) on flat tiles, and the river slope sprite for a
 * diagonal one-level slope. Other shapes return false (procedural river).
 * @returns {boolean}
 */
export function drawRiverPack(ctx, sx, sy, c) {
  if (!extraActive()) return false;
  if (flat(c)) return blitPackFrom(packState.pack, ctx, FLAT_WATER, sx, sy - HALF_H - S * c[0]);
  const slope = twoCornerSlope(c);
  if (!slope || !has('river_slope.' + WATER_SLOPE[slope])) return false;
  return blitExtra(ctx, 'river_slope.' + WATER_SLOPE[slope], sx, sy, c);
}

/**
 * Tram track overlay (OpenTTD road_cmd.cpp SPR_TRAMWAY_OVERLAY + GetRoadSpriteOffset). Flat tiles use the
 * road-bit table (straight, corner, T and dead end); diagonal slopes use the straight sloped piece on the
 * matching axis. Anything else returns false (procedural rails).
 * @returns {boolean}
 */
export function drawTramPack(ctx, tile, sx, sy, c) {
  if (!extraActive() || !tile.tram) return false;
  if (flat(c)) {
    let bits = 0;
    for (const b of [1, 2, 4, 8]) if (tile.tram & b) bits |= TRAM_BITS[b];
    const key = 'tram_overlay.' + ROAD_OFFSET[bits];
    return has(key) && blitExtra(ctx, key, sx, sy, c);
  }
  const slope = twoCornerSlope(c);
  if (!slope || tile.tram !== SLOPE_AXIS[slope]) return false;
  const key = 'tram_overlay.' + TRAM_SLOPE[slope];
  return has(key) && blitExtra(ctx, key, sx, sy, c);
}
