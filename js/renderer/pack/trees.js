/**
 * Forest trees. Ported from OpenTTD src/tree_cmd.cpp DrawTile_Trees and src/tree_land.h
 * (GPL-2.0): tmp = CountBits(tile + X + Y); index = (tmp & 3) + (treeType << 2) into
 * _tree_layout_sprite (base sprite per tree slot); position = _tree_layout_xy[(tmp >> 2) & 3];
 * fully grown frame = base + TreeGrowthStage::Grown (3). Trees sorted by X+Y (back to front).
 */
import { blitPack } from './draw.js';
import { HALF_H, HEIGHT_STEP as S } from '../iso.js';
import { packState } from './state.js';

/** Ported from OpenTTD tree_land.h `_tree_layout_xy` (GPL-2.0). [X, Y] in 0..15 tile units. */
const LAYOUT_XY = [
  [[9, 3], [1, 8], [0, 0], [8, 9]],
  [[4, 4], [9, 1], [6, 9], [0, 9]],
  [[9, 1], [0, 9], [6, 6], [3, 0]],
  [[3, 9], [8, 2], [9, 9], [1, 5]],
];
/** Ported from OpenTTD tree_land.h `_tree_layout_sprite` (base sprite of each tree slot; first 36 rows = temperate). */
const TREE_LAYOUT = [
  [1618, 1625, 1632, 1639],
  [1618, 1639, 1646, 1653],
  [1618, 1646, 1625, 1653],
  [1618, 1618, 1632, 1646],
  [1632, 1639, 1625, 1618],
  [1632, 1653, 1632, 1632],
  [1632, 1618, 1618, 1646],
  [1632, 1653, 1639, 1625],
  [1653, 1632, 1653, 1653],
  [1653, 1625, 1618, 1618],
  [1653, 1646, 1618, 1618],
  [1653, 1639, 1625, 1639],
  [1576, 1618, 1632, 1583],
  [1576, 1590, 1653, 1604],
  [1576, 1618, 1597, 1646],
  [1576, 1639, 1604, 1618],
  [1604, 1625, 1632, 1576],
  [1604, 1611, 1625, 1590],
  [1604, 1653, 1618, 1597],
  [1604, 1597, 1646, 1618],
  [1590, 1590, 1576, 1590],
  [1590, 1597, 1590, 1590],
  [1590, 1611, 1590, 1590],
  [1590, 1590, 1590, 1590],
  [1611, 1576, 1583, 1590],
  [1611, 1597, 1604, 1590],
  [1611, 1590, 1597, 1576],
  [1611, 1611, 1590, 1597],
  [1583, 1604, 1604, 1590],
  [1583, 1583, 1590, 1576],
  [1583, 1611, 1590, 1590],
  [1583, 1590, 1583, 1590],
  [1660, 1653, 1667, 1660],
  [1660, 1695, 1660, 1625],
  [1660, 1660, 1660, 1702],
  [1660, 1681, 1646, 1674],
];
/** TreeGrowthStage::Grown (tree_map.h). */
const GROWN = 3;
/** Temperate tree types: TREE_TEMPERATE = 0 .. TREE_COUNT_TEMPERATE-1 = 8 (tree_map.h). */
const TREE_COUNT_TEMPERATE = 9;

/** popcount of a 32-bit value (OpenTTD CountBits). */
function countBits(v) {
  v = v >>> 0;
  let n = 0;
  while (v) { v &= v - 1; n++; }
  return n;
}

/**
 * Draw the trees of one forest tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x tile x (ours)
 * @param {number} y tile y (ours)
 * @param {number} hash tile hash (deterministic)
 * @param {number} sx screen x of the flat tile centre
 * @param {number} sy screen y of the tile centre at its MEAN height
 * @returns {boolean} false when the pack is missing
 */
export function drawOgfxTrees(ctx, x, y, hash, sx, sy) {
  if (!packState.pack) return false;
  // tile top corner at the MIN corner height (OpenTTD TileHeight = min)
  // Corner heights differ by <= 1 level, so floor(mean corner height) is the min corner exactly.
  const mean = ((x + y) * HALF_H - sy) / S;
  const min = Math.floor(mean + 1e-6);
  const topX = sx, topY = (x + y) * HALF_H - HALF_H - S * min;
  const h = hash >>> 0;
  // OpenTTD tmp = CountBits(tile.base + X + Y); the tile hash stands in for the tile index.
  const tmp = countBits(h);
  const treeType = h % TREE_COUNT_TEMPERATE;
  const index = (tmp & 3) + (treeType << 2);
  const sprites = TREE_LAYOUT[index];
  const pos = LAYOUT_XY[(tmp >> 2) & 3];
  // tree count 1..4 (OpenTTD GetTreeCount), deterministic from the hash
  const count = 1 + ((h >>> 3) & 3);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const X = pos[i][0], Y = pos[i][1];
    pts.push({ id: sprites[i] + GROWN, px: topX + 2 * (Y - X), py: topY + (X + Y), d: X + Y });
  }
  pts.sort((a, b) => a.d - b.d);
  for (const p of pts) blitPack(ctx, p.id, p.px, p.py);
  return true;
}
