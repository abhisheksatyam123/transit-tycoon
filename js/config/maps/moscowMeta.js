/**
 * Tiny metadata of the baked Moscow map, kept out of moscow.js (833 KB) so that every game can read
 * the tile size without loading the map. tests/moscowScale.test.js asserts it equals MOSCOW.tileMeters.
 */
export const MOSCOW_TILE_M = 100;
