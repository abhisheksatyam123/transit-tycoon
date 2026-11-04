/**
 * Town road layouts and growth rules (ported from OpenTTD town_cmd.cpp, GPL-2.0).
 * Ported from OpenTTD town_cmd.cpp (GPL-2.0): GetTownRoadGridElement, IsNeighbourRoadTile,
 * IsRoadAllowedHere, GrowTownInTile.
 *
 * Coordinates: our (x, y) map to OpenTTD (X = our y, Y = our x). Road bits are our masks:
 * N=1, E=2, S=4, W=8. Grid offsets are measured from the town centre.
 */
import { DIR_BY_BIT, OPPOSITE } from './constants.js';

/** Layouts: 'original' and 'better' grow freely; '2x2'/'3x3' grow on a fixed street grid. */
export const LAYOUTS = ['original', 'better', '2x2', '3x3'];

const ALL = 15;
const CW = [1, 2, 4, 8]; // clockwise order of direction bits

/** Clockwise (right) and counter-clockwise (left) neighbour direction bits. */
function rightOf(bit) { return CW[(CW.indexOf(bit) + 1) % 4]; }
function leftOf(bit) { return CW[(CW.indexOf(bit) + 3) % 4]; }

/**
 * Road bits a grid layout wants on a tile (OpenTTD GetTownRoadGridElement).
 * Horizontal (E|W) streets lie on rows where dy % n == 0; vertical (N|S) streets on
 * columns where dx % n == 0. Returns 0 when no street is wanted, 15 for a crossing.
 * Non-grid layouts return ALL (no restriction).
 */
export function gridElement(town, x, y, layout) {
  const n = layout === '2x2' ? 3 : layout === '3x3' ? 4 : 0;
  if (!n) return ALL;
  const dx = x - town.x, dy = y - town.y;
  let rb = 0;
  if (dy % n === 0) rb |= 2 | 8;
  if (dx % n === 0) rb |= 1 | 4;
  return rb;
}

/** Road bits of a tile in our map (0 when out of bounds). */
function roadAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  return map.tiles[y * map.width + x].road || 0;
}

/**
 * OpenTTD IsNeighbourRoadTile: is there a road parallel to `dir` within `distMulti` tiles
 * to the side of (x, y)? Ported loop over pos in [4, (distMulti+1)*4).
 */
export function isNeighbourRoad(map, x, y, dir, distMulti) {
  const { width: W, height: H } = map;
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const back = DIR_BY_BIT[OPPOSITE[dir]];
  const left = DIR_BY_BIT[leftOf(dir)], right = DIR_BY_BIT[rightOf(dir)];
  const end = (distMulti + 1) * 4;
  for (let pos = 4; pos < end; pos++) {
    const side = pos & 1 ? right : left;
    const k = pos >> 2;
    let cx = side.dx * k, cy = side.dy * k;
    if (pos & 2) { cx += back.dx; cy += back.dy; }
    const want = pos & 2 ? dir : OPPOSITE[dir];
    if (roadAt(map, x + cx, y + cy) & want) return true;
  }
  return false;
}

/**
 * OpenTTD IsRoadAllowedHere: may a town road be laid on (x, y) while growing in `dir`?
 * 'original' checks neighbours at distance 1, the other layouts at distance 2.
 */
export function roadAllowedHere(map, x, y, dir, layout) {
  if (x <= 0 || y <= 0 || x >= map.width - 1 || y >= map.height - 1) return false;
  const t = map.tiles[y * map.width + x];
  if (t.terrain === 'water') return false;
  if (t.rail || t.building) return false;
  return !isNeighbourRoad(map, x, y, dir, layout === 'original' ? 1 : 2);
}

/**
 * Decide what a growing street does at (x, y), heading `dir` (a direction bit).
 * Mirrors GrowTownInTile for a tile without road:
 *  - grid layouts: extend with the grid element, stop where the grid has no road;
 *  - free layouts: stop if a road is not allowed; with 1/4 chance try a random new heading
 *    ('turn'); a curve is only allowed beside a house, else stop.
 * @returns {{action: 'extend'|'turn'|'house'|'stop', dir: number, mask: number}}
 */
export function nextGrowthAction(state, rng, town, x, y, dir, layout) {
  const { map } = state;
  const stop = { action: 'stop', dir, mask: 0 };
  if (layout === '2x2' || layout === '3x3') {
    const mask = gridElement(town, x, y, layout);
    if (!(mask & dir)) return stop; // grid has no street continuing this way
    return { action: 'extend', dir, mask };
  }
  if (!roadAllowedHere(map, x, y, dir, layout)) return stop;
  const source = OPPOSITE[dir];
  let newDir = dir;
  if (rng.chance(0.25)) {
    const choices = CW.filter((b) => b !== source);
    newDir = rng.pick(choices);
  }
  const d = DIR_BY_BIT[newDir];
  if (!roadAllowedHere(map, x + d.dx, y + d.dy, newDir, layout)) {
    if (newDir !== OPPOSITE[source]) return stop;
    // a straight-on continuation needs a house beside the new road
    const sides = [DIR_BY_BIT[rightOf(newDir)], DIR_BY_BIT[leftOf(newDir)]];
    const hasHouse = sides.some((s) => {
      const nx = x + s.dx, ny = y + s.dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return false;
      const b = map.tiles[ny * map.width + nx].building;
      return !!b && b.type === 'house';
    });
    if (!hasHouse) return stop;
    return { action: 'house', dir: newDir, mask: source | newDir };
  }
  return { action: newDir === dir ? 'extend' : 'turn', dir: newDir, mask: source | newDir };
}

