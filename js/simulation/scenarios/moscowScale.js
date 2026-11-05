/**
 * Moscow map scale. The baked map stores its tile size (metres); every distance constant of the Moscow
 * scenario was tuned for 200 m tiles, so tile counts are multiplied by TS = 200 / tileMeters.
 */
import { MOSCOW } from '../../config/maps/moscow.js';

/** Metres per tile of the baked map. */
export const TILE_M = MOSCOW.tileMeters || 200;
/** Tiles per 200 m (1 at the original 200 m bake, 2 at 100 m). */
export const TS = 200 / TILE_M;
/** Scale a tile distance tuned for 200 m tiles to the baked map (rounded, at least 1). */
export const tl = (n) => Math.max(1, Math.round(n * TS));
