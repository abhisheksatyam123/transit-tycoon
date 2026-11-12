/**
 * Moscow scenario, land and depots: demolish houses and local links where industries, stations
 * or depots need room, and attach depots to a line through a one-tile spur.
 */
import { tl, TS } from './moscowScale.js';
import { DIRS, OPPOSITE } from '../constants.js';
import { inBounds } from '../map.js';

/** Demolish the house on tile index i (and drop it from its town). @returns {boolean} true if removed */
export function demolishHouseAt(state, i) {
  const { map } = state;
  const t = map.tiles[i];
  if (!t.building || t.building.type !== 'house') return false;
  const town = state.towns.find((tw) => tw.id === t.building.townId);
  if (town) town.houses = town.houses.filter((hh) => hh.y * map.width + hh.x !== i);
  t.building = null;
  return true;
}

/** Remove a tile's road/rail bits and the matching reverse bits on its neighbours. */
export function clearLinks(state, i) {
  const { map } = state;
  const t = map.tiles[i];
  const x = i % map.width, y = (i - x) / map.width;
  for (const d of DIRS) {
    const nx = x + d.dx, ny = y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    const nt = map.tiles[ny * map.width + nx];
    nt.road &= ~OPPOSITE[d.bit];
    nt.rail &= ~OPPOSITE[d.bit];
  }
  t.road = 0;
  t.rail = 0;
}

/** True when the tile may be cleared: land, and either empty or a house (no station/depot/industry). */
export function clearable(map, i) {
  const t = map.tiles[i];
  if (t.terrain === 'water') return false;
  return !t.building || t.building.type === 'house';
}

/**
 * Clear a w×h footprint at (x0,y0): houses demolished; road/rail links removed unless keepLinks.
 * @returns {boolean} false (no change) when any tile is water, a station, depot or industry
 */
export function clearFootprint(state, x0, y0, w, h, keepLinks = false) {
  const { map } = state;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!inBounds(map, x, y) || !clearable(map, y * map.width + x)) return false;
  }
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const i = y * map.width + x;
    demolishHouseAt(state, i);
    if (!keepLinks) clearLinks(state, i);
    map.tiles[i].owner = null;
  }
  return true;
}

/**
 * Nearest anchor (ring search) for a w×h footprint around (cx,cy): every tile clearable, no rail,
 * and no major road (local streets may be cleared). Does not modify the map.
 * @returns {{x:number,y:number}|null}
 */

/** Tile free for a spur or depot: land, no track, no building except houses (demolished on use). */
function spurFree(map, x, y) {
  if (!inBounds(map, x, y)) return false;
  const t = map.tiles[y * map.width + x];
  return t.terrain !== 'water' && !t.road && !t.rail && (!t.building || t.building.type === 'house');
}

/**
 * Attach a depot to a line through a spur: anchor (track of `layer`, no station) -> branch tile
 * -> depot tile. Links are mutual: anchor<->branch (d), branch<->depot (e). The depot's exit faces
 * the branch. Branch and depot tiles are cleared of houses first.
 * @param {object} game Game (commands)
 * @param {'rail'|'road'} layer
 * @param {number[]} anchors candidate tile indices already carrying `layer` bits
 * @returns {number|null} depot id
 */
export function spurDepot(game, layer, anchors) {
  const { state } = game;
  const map = state.map;
  const W = map.width;
  for (const a of anchors) {
    const at = map.tiles[a];
    if (!at[layer] || (at.building && at.building.type !== 'house')) continue;
    const ax = a % W, ay = (a - ax) / W;
    for (const d of DIRS) {
      const bx = ax + d.dx, by = ay + d.dy;
      if (!spurFree(map, bx, by) || at[layer] & d.bit) continue;
      for (const e of DIRS) {
        if (e.bit === OPPOSITE[d.bit]) continue;
        const dx = bx + e.dx, dy = by + e.dy;
        if (!spurFree(map, dx, dy)) continue;
        clearFootprint(state, bx, by, 1, 1, true);
        clearFootprint(state, dx, dy, 1, 1, true);
        const dep = game.buildDepot(dx, dy, layer, OPPOSITE[e.bit]);
        if (!dep.ok) continue;
        const bt = map.tiles[by * W + bx];
        bt[layer] |= OPPOSITE[d.bit] | e.bit;
        bt.owner = 'company';
        at[layer] |= d.bit;
        return dep.depotId;
      }
    }
  }
  return null;
}

/**
 * Remove tiny road islands (components of at most maxTiles road tiles with no building on them),
 * e.g. bridge stubs cut off by water polygons or metro works. Rail bits are kept.
 * @returns {number} road tiles removed
 */
export function pruneRoadIslands(state, maxTiles = 8 * TS * TS) {
  const { map } = state;
  const W = map.width, N = W * map.height;
  const seen = new Uint8Array(N);
  let removed = 0;
  for (let s = 0; s < N; s++) {
    if (seen[s] || !map.tiles[s].road) continue;
    const comp = [s];
    seen[s] = 1;
    let built = false;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k], t = map.tiles[i];
      if (t.building) built = true;
      const x = i % W, y = (i - x) / W;
      for (const d of DIRS) {
        if (!(t.road & d.bit)) continue;
        const nx = x + d.dx, ny = y + d.dy;
        if (!inBounds(map, nx, ny)) continue;
        const j = ny * W + nx;
        if (seen[j] || !(map.tiles[j].road & OPPOSITE[d.bit])) continue;
        seen[j] = 1;
        comp.push(j);
      }
    }
    if (built || comp.length > maxTiles) continue;
    for (const i of comp) {
      const x = i % W, y = (i - x) / W;
      for (const d of DIRS) {
        if (inBounds(map, x + d.dx, y + d.dy)) map.tiles[(y + d.dy) * W + x + d.dx].road &= ~OPPOSITE[d.bit];
      }
      map.tiles[i].road = 0;
      delete map.tiles[i].avenue;
      if (!map.tiles[i].rail && !map.tiles[i].building) map.tiles[i].owner = null;
      removed++;
    }
  }
  return removed;
}

/** Road component label per tile (-1 = no road) and the label of the largest component. */
function roadLabels(map) {
  const W = map.width, N = W * map.height;
  const lab = new Int32Array(N).fill(-1);
  const sizes = [];
  for (let s = 0; s < N; s++) {
    if (lab[s] !== -1 || !map.tiles[s].road) continue;
    const id = sizes.length;
    const stack = [s];
    lab[s] = id;
    let n = 0;
    while (stack.length) {
      const i = stack.pop(); n++;
      const x = i % W, y = (i - x) / W, t = map.tiles[i];
      for (const d of DIRS) {
        if (!(t.road & d.bit) || !inBounds(map, x + d.dx, y + d.dy)) continue;
        const j = (y + d.dy) * W + x + d.dx;
        if (lab[j] === -1 && (map.tiles[j].road & OPPOSITE[d.bit])) { lab[j] = id; stack.push(j); }
      }
    }
    sizes.push(n);
  }
  let main = -1;
  sizes.forEach((n, id) => { if (main < 0 || n > sizes[main]) main = id; });
  return { lab, sizes, main };
}

/**
 * Join road components cut off from the main network (e.g. roads that leave the map bbox and
 * rejoin outside it) with the shortest local street over free land (houses demolished, forest
 * cleared; water, rail, stations and other buildings avoided).
 * @param {object} state
 * @param {number} [maxLen=20] longest connector in tiles
 * @returns {{joined:number, tiles:number}}
 */
export function joinRoadComponents(state, maxLen = tl(20)) {
  const { map } = state;
  const W = map.width, N = W * map.height;
  const { lab, sizes, main } = roadLabels(map);
  let joined = 0, tiles = 0;
  if (main < 0) return { joined, tiles };
  const free = (j) => {
    const t = map.tiles[j];
    return t.terrain !== 'water' && !t.rail && !t.road && (!t.building || t.building.type === 'house');
  };
  for (let id = 0; id < sizes.length; id++) {
    if (id === main) continue;
    const prev = new Int32Array(N).fill(-2);
    const dist = new Int32Array(N);
    let q = [];
    for (let i = 0; i < N; i++) if (lab[i] === id) { prev[i] = -1; q.push(i); }
    let hit = -1;
    for (let depth = 0; q.length && hit < 0 && depth <= maxLen; depth++) {
      const nq = [];
      for (const i of q) {
        const x = i % W, y = (i - x) / W;
        for (const d of DIRS) {
          if (!inBounds(map, x + d.dx, y + d.dy)) continue;
          const j = (y + d.dy) * W + x + d.dx;
          if (prev[j] !== -2) continue;
          if (lab[j] === main && !map.tiles[j].building) { prev[j] = i; hit = j; break; }
          if (!free(j)) continue;
          prev[j] = i; dist[j] = dist[i] + 1; nq.push(j);
        }
        if (hit >= 0) break;
      }
      q = nq;
    }
    if (hit < 0) continue;
    for (let j = hit; prev[j] >= 0; j = prev[j]) {
      const i = prev[j];
      const t = map.tiles[i];
      if (lab[i] !== id) {
        demolishHouseAt(state, i);
        if (t.terrain === 'forest') t.terrain = 'grass';
        t.owner = 'town';
        lab[i] = main;
        tiles++;
      }
      const d = DIRS.find((dd) => (i % W) + dd.dx === j % W && Math.floor(i / W) + dd.dy === Math.floor(j / W));
      t.road |= d.bit;
      map.tiles[j].road |= OPPOSITE[d.bit];
    }
    for (let i = 0; i < N; i++) if (lab[i] === id) lab[i] = main;
    joined++;
  }
  return { joined, tiles };
}
