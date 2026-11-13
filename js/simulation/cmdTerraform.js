/**
 * Terraform commands (OpenTTD terraform_cmd.cpp / tree_cmd.cpp, OpenLoco Terraform/*).
 *
 * Height model: one integer height per tile (0..7), which is the tile's N corner (see renderer/heights.js).
 * A "corner" raise/lower therefore moves the tile's own height by one level. Neighbour rule: every pair of
 * 8-adjacent tiles differs by at most 1 level after the change. Changes cascade to neighbours (raise pulls
 * low neighbours up to h-1, lower pushes high neighbours down to h+1). The command is refused when a changed
 * tile is water, carries a structure/track, or touches water; when a height would leave 0..7; or when the
 * cascade would have to modify such a tile. Level sets a rectangle to the start tile's height. Plant trees
 * turns clear grass into forest (the tree terrain; demolish clears it again).
 *
 * estimateTerraform is pure (no mutation) and shared by the command and the UI preview.
 */
import { tropicZonesReset, isArctic, isToyland, isTropic } from './climate.js';
import { COSTS } from '../config/costs.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { ERR, checkMoney, coordsOk, objectError } from './trackRules.js';
import { cornerSlopeOk } from './map.js';
import { getSetting } from './settings.js';

const MIN_HEIGHT = 0;
export const MAX_HEIGHT = 7;
const TERRAFORM_OPS = ['raise', 'lower', 'level', 'plant'];

/** Tree-planting modes (OpenTTD tree_gui.cpp PM_NORMAL / PM_FOREST_SM / PM_FOREST_LG). */
export const PLANT_MODES = ['normal', 'forestSmall', 'forestLarge'];
/** OpenTTD DoPlantForest: radius and tree count per forest group. */
export const FOREST_GROUP = { forestSmall: { radius: 5, count: 5 }, forestLarge: { radius: 12, count: 12 } };

/**
 * Tree species the renderer can draw in the game's climate (pack/trees.js rows): temperate and toyland 9,
 * sub-arctic 8, sub-tropical 4 (rainforest and cactus rows are picked by zone and ignore the index).
 * @param {object} state
 */
export function treeSpeciesCount(state) {
  if (isArctic(state)) return 8;
  if (isToyland(state)) return 9;
  if (isTropic(state)) return 4;
  return 9;
}

/** Deterministic 0..2^32 mix of tile coordinates and a group number (no RNG: estimate == commit). */
function scatterHash(x, y, k) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Forest group around (cx,cy): ports OTTD tree_cmd.cpp PlaceTreeGroupAroundTile (radius 5/count 5 small,
 * 12/12 large). Each of `count` attempts picks an offset by the OTTD quasi-normal distribution (sum of
 * 4 bytes scaled to radius), so plants cluster near the clicked tile; exactly one tree per attempt, no
 * neighbour halo. Deterministic in (cx,cy,k) so estimate == commit.
 * @returns {{x:number,y:number}[]} candidate tiles (may repeat; the caller dedupes and checks terrain)
 */
export function forestCandidates(map, cx, cy, mode) {
  const { radius, count } = FOREST_GROUP[mode] || FOREST_GROUP.forestSmall;
  const out = [];
  for (let k = 0; k < count; k++) {
    const h = scatterHash(cx, cy, k);
    const byte = (s) => (h >>> s) & 0xff;
    const mkcoord = () => ((byte(0) + byte(8) + byte(16) + byte(24)) * radius / 512 | 0) - radius;
    const x = cx + mkcoord(), y = cy + mkcoord();
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    out.push({ x, y });
  }
  return out;
}

const NB8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** Error messages for terraform commands. */
export const TERRA_ERR = {
  water: 'Cannot terraform water: sea and lakes stay as they are',
  edge: 'Next to water: shore cannot be changed',
  structure: 'Tile occupied by a building',
  max: 'Maximum height reached',
  min: 'Minimum height reached',
  nothing: 'Nothing to change here',
  steep: 'Too much terrain would change',
  slope: 'Track or road would not fit the new slope',
  trackBridge: 'Bridge above: track under it cannot change',
  tunnel: 'Tunnel below: its ground cannot change',
};

/**
 * Why a tile may not change height ('' when it may). With autoslope on, rail/road tiles are not blocked
 * here: they are validated afterwards against the slope rule (see trackSlopeOk).
 */
function blockReason(map, x, y, autoslope) {
  const t = map.tiles[y * map.width + x];
  if (t.terrain === 'water') return TERRA_ERR.water;
  if (objectError(t)) return objectError(t);
  if (t.building) return TERRA_ERR.structure;
  if (t.tunnel || t.tunnelPortal) return TERRA_ERR.tunnel;
  if (t.bridgeDeck !== undefined || t.playerBridge) return 'Bridge above: its ground cannot change';
  if (t.rail || t.road) {
    if (!autoslope || t.owner === 'rival' || t.overBridge) return t.overBridge ? TERRA_ERR.trackBridge : ERR.track;
  }
  for (const [dx, dy] of NB8) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    if (map.tiles[ny * map.width + nx].terrain === 'water') return TERRA_ERR.edge;
  }
  return '';
}

/**
 * Autoslope check: every rail/road tile whose corner block contains a changed vertex must sit on a valid
 * slope after the change (same rule as rivers: flat or a straight single-step incline, cornerSlopeOk).
 * Corners outside the map clamp to the edge tile, as the renderer draws them.
 * @param {Map<number,number>} cur changed tiles (idx -> planned height)
 * @param {(i:number)=>number} get planned height of any tile
 */
function trackSlopesOk(map, cur, get) {
  const W = map.width, H = map.height, tiles = map.tiles;
  const hAt = (x, y) => get(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x)));
  const seen = new Set();
  for (const i of cur.keys()) {
    const a = i % W, b = Math.floor(i / W);
    for (const [x, y] of [[a, b], [a - 1, b], [a, b - 1], [a - 1, b - 1]]) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x;
      if (seen.has(j)) continue;
      seen.add(j);
      const t = tiles[j];
      if (!t.rail && !t.road) continue;
      if (!cornerSlopeOk([hAt(x, y), hAt(x + 1, y), hAt(x + 1, y + 1), hAt(x, y + 1)])) return false;
    }
  }
  return true;
}

/**
 * Plan a terraform operation without mutating state.
 * @returns {{ok:true, changes:object[], raw:number, area:object}|{ok:false,error:string}}
 */
function evaluate(state, op, rect, opts = {}) {
  const map = state.map, W = map.width, tiles = map.tiles;
  if (!TERRAFORM_OPS.includes(op)) return { ok: false, error: 'Unknown operation' };
  if (!rect || !coordsOk(map, rect.x0, rect.y0, rect.x1, rect.y1)) return { ok: false, error: ERR.bounds };
  const xa = Math.min(rect.x0, rect.x1), xb = Math.max(rect.x0, rect.x1);
  const ya = Math.min(rect.y0, rect.y1), yb = Math.max(rect.y0, rect.y1);
  const area = { x0: xa, y0: ya, x1: xb, y1: yb };
  if (op === 'plant') {
    const tree = opts.tree;
    if (tree !== undefined && !(Number.isInteger(tree) && tree >= 0 && tree < treeSpeciesCount(state))) {
      return { ok: false, error: 'Unknown tree type' };
    }
    const mode = opts.mode || 'normal';
    if (mode !== 'normal' && !FOREST_GROUP[mode]) return { ok: false, error: 'Unknown planting mode' };
    const plantable = (x, y) => {
      const t = tiles[y * W + x];
      return t.terrain === 'grass' && !t.building && !t.rail && !t.road;
    };
    const changes = [];
    const seen = new Set();
    const add = (x, y) => {
      const i = y * W + x;
      if (seen.has(i) || !plantable(x, y)) return;
      seen.add(i);
      const c = { i, x, y, terrain: 'forest' };
      if (tree !== undefined) c.tree = tree;
      changes.push(c);
    };
    if (mode === 'normal') {
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) add(x, y);
      area.x0 = xa; area.y0 = ya; area.x1 = xb; area.y1 = yb;
    } else {
      // forest modes plant around the clicked (start) tile only; the drag rectangle is not used
      const cx = rect.x0, cy = rect.y0;
      for (const c of forestCandidates(map, cx, cy, mode)) add(c.x, c.y);
      if (!changes.length) return { ok: false, error: TERRA_ERR.nothing };
      area.x0 = Math.min(...changes.map((c) => c.x)); area.x1 = Math.max(...changes.map((c) => c.x));
      area.y0 = Math.min(...changes.map((c) => c.y)); area.y1 = Math.max(...changes.map((c) => c.y));
    }
    if (!changes.length) return { ok: false, error: TERRA_ERR.nothing };
    return { ok: true, changes, raw: changes.length * COSTS.plantTree, area };
  }
  const startH = tiles[rect.y0 * W + rect.x0].height;
  const heightCap = getSetting(state, 'mapHeightLimit') ?? MAX_HEIGHT; // construction.map_height_limit (default = MAX_HEIGHT)
  // rect tiles are pinned to their target height; every other tile relaxes toward the neighbour rule
  const pinned = new Map(); // idx -> target height
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const i = y * W + x, h = tiles[i].height;
    const v = op === 'raise' ? h + 1 : op === 'lower' ? h - 1 : startH;
    // the cap only refuses RAISING a tile above it; lowering (or levelling down) is always allowed
    if (v > h && v > heightCap) return { ok: false, error: TERRA_ERR.max };
    if (v < MIN_HEIGHT) return { ok: false, error: TERRA_ERR.min };
    pinned.set(i, v);
  }
  const cur = new Map(); // idx -> planned height (changed tiles only)
  for (const [i, v] of pinned) if (v !== tiles[i].height) cur.set(i, v);
  if (!cur.size) return { ok: false, error: TERRA_ERR.nothing };
  const get = (i) => (cur.has(i) ? cur.get(i) : tiles[i].height);
  const autoslope = !!getSetting(state, 'autoslope');
  const blocked = new Map(); // idx -> block reason ('' = modifiable), cached
  const reasonOf = (i) => {
    if (!blocked.has(i)) blocked.set(i, blockReason(map, i % W, Math.floor(i / W), autoslope));
    return blocked.get(i);
  };
  for (const i of cur.keys()) { const e = reasonOf(i); if (e) return { ok: false, error: e }; }
  // worklist: neighbours of changed tiles; each step clamps a free tile into [max(nb)-1, min(nb)+1]
  const queue = [];
  const inQueue = new Set();
  const enqueueAround = (i) => {
    const x = i % W, y = Math.floor(i / W);
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
      const j = ny * W + nx;
      if (pinned.has(j) || inQueue.has(j)) continue;
      inQueue.add(j); queue.push(j);
    }
  };
  for (const i of [...cur.keys()]) enqueueAround(i);
  let steps = 0;
  const limit = 64 * map.width * map.height + 1000;
  while (queue.length) {
    const j = queue.shift();
    inQueue.delete(j);
    if (++steps > limit) return { ok: false, error: TERRA_ERR.steep };
    const x = j % W, y = Math.floor(j / W);
    const v = get(j);
    // a free tile already above the cap may be pulled down (never capped from below); it is never raised above the cap
    let lo = MIN_HEIGHT, hi = Math.max(heightCap, v);
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
      const g = get(ny * W + nx);
      if (g - 1 > lo) lo = g - 1;
      if (g + 1 < hi) hi = g + 1;
    }
    const nv = v < lo ? lo : v > hi ? hi : v;
    if (nv === v) continue;
    const e = reasonOf(j);
    if (e) return { ok: false, error: e };
    cur.set(j, nv);
    enqueueAround(j);
  }
  // every changed tile must satisfy the rule against all its neighbours (blocked ones included)
  for (const i of cur.keys()) {
    const x = i % W, y = Math.floor(i / W), v = get(i);
    // final check (not per step: the worklist may raise a tile transiently): no tile ends raised above the cap
    if (v > tiles[i].height && v > heightCap) return { ok: false, error: TERRA_ERR.max };
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
      if (Math.abs(get(ny * W + nx) - v) > 1) return { ok: false, error: TERRA_ERR.steep };
    }
  }
  if (autoslope && !trackSlopesOk(map, cur, get)) return { ok: false, error: TERRA_ERR.slope };
  const changes = [];
  let raw = 0;
  for (const [i, v] of cur) {
    const from = tiles[i].height;
    if (v === from) continue;
    const x = i % W, y = Math.floor(i / W);
    changes.push({ i, x, y, from, to: v });
    raw += Math.abs(v - from) * COSTS.terraformStep;
    area.x0 = Math.min(area.x0, x); area.x1 = Math.max(area.x1, x);
    area.y0 = Math.min(area.y0, y); area.y1 = Math.max(area.y1, y);
  }
  if (!changes.length) return { ok: false, error: TERRA_ERR.nothing };
  return { ok: true, changes, raw, area };
}

/** Planned changes for a terraform op (pure): {ok, changes:[{x,y,...}], raw, area} or {ok:false,error}. */
export function planTerraform(state, op, rect, opts) {
  return evaluate(state, op, rect, opts);
}

/**
 * Pure cost/validity estimate (also used by the drag preview).
 * @param {object} state
 * @param {'raise'|'lower'|'level'|'plant'} op
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect start tile (x0,y0) and end tile (x1,y1)
 * @returns {{ok:boolean, cost:number, tiles:number, error:string|null}}
 */
export function estimateTerraform(state, op, rect, opts) {
  const p = evaluate(state, op, rect, opts);
  if (!p.ok) return { ok: false, cost: 0, tiles: 0, error: p.error };
  const cost = constructionTotal(state, p.raw);
  const money = checkMoney(state, cost);
  if (money) return { ok: false, cost, tiles: p.changes.length, error: money.error };
  return { ok: true, cost, tiles: p.changes.length, error: null };
}

/**
 * Apply a terraform operation over a rectangle (or the single tile x0,y0 == x1,y1).
 * @param {{state:object}} ctx
 * @returns {{ok:true,cost:number,tiles:number,area?:object}|{ok:false,error:string}}
 */
export function terraform(ctx, op, rect, opts = {}) {
  const { state } = ctx;
  const p = evaluate(state, op, rect, opts);
  if (!p.ok) return { ok: false, error: p.error };
  const cost = constructionTotal(state, p.raw);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, tiles: p.changes.length };
  const map = state.map;
  for (const c of p.changes) {
    const t = map.tiles[c.i];
    if (c.terrain) t.terrain = c.terrain;
    else t.height = c.to;
    if (c.tree !== undefined) t.tree = c.tree; // lazy: only tiles planted with a chosen type carry the field
  }
  tropicZonesReset(map); // sub-tropical zones depend on heights and water (climate.js)
  spend(state.company, 'construction', state.editor ? 0 : cost);
  return { ok: true, cost, tiles: p.changes.length, area: p.area };
}
