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
import { COSTS } from '../config/costs.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { ERR, checkMoney, coordsOk, objectError } from './trackRules.js';

export const MIN_HEIGHT = 0;
export const MAX_HEIGHT = 7;
export const TERRAFORM_OPS = ['raise', 'lower', 'level', 'plant'];

const NB8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** Error messages for terraform commands. */
export const TERRA_ERR = {
  edge: 'Next to water: shore cannot be changed',
  structure: 'Tile occupied by a building',
  max: 'Maximum height reached',
  min: 'Minimum height reached',
  nothing: 'Nothing to change here',
  steep: 'Too much terrain would change',
  tunnel: 'Tunnel below: its ground cannot change',
};

/** Why a tile may not change height ('' when it may). */
function blockReason(map, x, y) {
  const t = map.tiles[y * map.width + x];
  if (t.terrain === 'water') return ERR.water;
  if (objectError(t)) return objectError(t);
  if (t.building) return TERRA_ERR.structure;
  if (t.tunnel || t.tunnelPortal) return TERRA_ERR.tunnel;
  if (t.bridgeDeck !== undefined || t.playerBridge) return 'Bridge above: its ground cannot change';
  if (t.rail || t.road) return ERR.track;
  for (const [dx, dy] of NB8) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    if (map.tiles[ny * map.width + nx].terrain === 'water') return TERRA_ERR.edge;
  }
  return '';
}

/**
 * Plan a terraform operation without mutating state.
 * @returns {{ok:true, changes:object[], raw:number, area:object}|{ok:false,error:string}}
 */
function evaluate(state, op, rect) {
  const map = state.map, W = map.width, tiles = map.tiles;
  if (!TERRAFORM_OPS.includes(op)) return { ok: false, error: 'Unknown operation' };
  if (!rect || !coordsOk(map, rect.x0, rect.y0, rect.x1, rect.y1)) return { ok: false, error: ERR.bounds };
  const xa = Math.min(rect.x0, rect.x1), xb = Math.max(rect.x0, rect.x1);
  const ya = Math.min(rect.y0, rect.y1), yb = Math.max(rect.y0, rect.y1);
  const area = { x0: xa, y0: ya, x1: xb, y1: yb };
  if (op === 'plant') {
    const changes = [];
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const t = tiles[y * W + x];
      if (t.terrain === 'grass' && !t.building && !t.rail && !t.road) changes.push({ i: y * W + x, x, y, terrain: 'forest' });
    }
    if (!changes.length) return { ok: false, error: TERRA_ERR.nothing };
    return { ok: true, changes, raw: changes.length * COSTS.plantTree, area };
  }
  const startH = tiles[rect.y0 * W + rect.x0].height;
  // rect tiles are pinned to their target height; every other tile relaxes toward the neighbour rule
  const pinned = new Map(); // idx -> target height
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const i = y * W + x, h = tiles[i].height;
    const v = op === 'raise' ? h + 1 : op === 'lower' ? h - 1 : startH;
    if (v > MAX_HEIGHT) return { ok: false, error: TERRA_ERR.max };
    if (v < MIN_HEIGHT) return { ok: false, error: TERRA_ERR.min };
    pinned.set(i, v);
  }
  const cur = new Map(); // idx -> planned height (changed tiles only)
  for (const [i, v] of pinned) if (v !== tiles[i].height) cur.set(i, v);
  if (!cur.size) return { ok: false, error: TERRA_ERR.nothing };
  const get = (i) => (cur.has(i) ? cur.get(i) : tiles[i].height);
  const blocked = new Map(); // idx -> block reason ('' = modifiable), cached
  const reasonOf = (i) => {
    if (!blocked.has(i)) blocked.set(i, blockReason(map, i % W, Math.floor(i / W)));
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
    let lo = MIN_HEIGHT, hi = MAX_HEIGHT;
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
      const g = get(ny * W + nx);
      if (g - 1 > lo) lo = g - 1;
      if (g + 1 < hi) hi = g + 1;
    }
    const v = get(j);
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
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.height) continue;
      if (Math.abs(get(ny * W + nx) - v) > 1) return { ok: false, error: TERRA_ERR.steep };
    }
  }
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
export function planTerraform(state, op, rect) {
  return evaluate(state, op, rect);
}

/**
 * Pure cost/validity estimate (also used by the drag preview).
 * @param {object} state
 * @param {'raise'|'lower'|'level'|'plant'} op
 * @param {{x0:number,y0:number,x1:number,y1:number}} rect start tile (x0,y0) and end tile (x1,y1)
 * @returns {{ok:boolean, cost:number, tiles:number, error:string|null}}
 */
export function estimateTerraform(state, op, rect) {
  const p = evaluate(state, op, rect);
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
  const p = evaluate(state, op, rect);
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
  }
  spend(state.company, 'construction', cost);
  return { ok: true, cost, tiles: p.changes.length, area: p.area };
}
