/**
 * Player rail valley bridges (land bridges).
 * Connects two land heads at equal height across lower terrain (valleys/water).
 */
import { COSTS } from '../config/costs.js';
import { MAX_BRIDGE_LENGTH, ERR, canAddBits, clearingCost, clearTerrain, coordsOk, checkMoney } from './trackRules.js';
import { DIRS, OPPOSITE, AXIS_BITS } from './constants.js';
import { linePath, straightAxis, pruneOneWay } from './network.js';
import { inBounds } from './map.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { invalidateBlocks } from './signals.js';

/**
 * Plan a player rail land bridge along a straight run of tiles:
 * - Straight line (same x or same y)
 * - Length n >= 3
 * - First and last tiles are the heads: equal height h, land, free or carrying straight track on that axis
 * - Every tile between is land (or water) with height < h, and free (no building, industry, station, depot, track, road)
 * - Max length MAX_BRIDGE_LENGTH
 * @param {object} map
 * @param {{x:number,y:number}[]} pts
 * @returns {{ok:true, deck:Set<number>, height:number}|{ok:false, error:string}}
 */
export function planLandBridge(map, pts) {
  const n = pts.length;
  if (n < 3) return { ok: false, error: 'Bridge needs at least one tile between the heads' };
  const straight = pts.every((p) => p.x === pts[0].x) || pts.every((p) => p.y === pts[0].y);
  if (!straight) return { ok: false, error: 'Bridges must be straight' };
  if (n > MAX_BRIDGE_LENGTH) return { ok: false, error: `Bridge too long (max ${MAX_BRIDGE_LENGTH} tiles)` };

  const axis = pts[0].x === pts[1].x ? 'y' : 'x';
  const tiles = pts.map((p) => map.tiles[p.y * map.width + p.x]);
  const a = tiles[0], b = tiles[n - 1];

  if (a.terrain === 'water' || b.terrain === 'water') {
    return { ok: false, error: 'Bridge heads must be on land' };
  }
  if (a.height !== b.height) {
    return { ok: false, error: 'Bridge heads must be at the same height' };
  }
  const h = a.height;

  for (const t of [a, b]) {
    if (t.building || t.road || (t.rail & ~AXIS_BITS[axis])) {
      return { ok: false, error: 'Bridge heads need a free tile or straight track on the axis' };
    }
  }

  const deck = new Set();
  for (let k = 1; k < n - 1; k++) {
    const t = tiles[k];
    if (t.building) return { ok: false, error: 'Bridge is blocked by a building' };
    if (t.rail || t.road) return { ok: false, error: 'Bridge is blocked by track or road' };
    if (t.height >= h) return { ok: false, error: 'Bridge must run higher than the valley floor' };
    deck.add(pts[k].y * map.width + pts[k].x);
  }

  return { ok: true, deck, height: h };
}

/** A tile belongs to a player-built land bridge deck or head. */
export const isPlayerLandBridge = (t) => !!(t && (t.playerBridge || t.bridgeDeck !== undefined));

/**
 * All cells of the player land bridge that (x,y) belongs to: both heads and the deck run between them.
 * Returns [] for anything that is not a player land bridge.
 * @param {object} map
 * @param {number} x
 * @param {number} y
 * @returns {{x:number,y:number}[]}
 */
export function landBridgeCells(map, x, y) {
  const t = map.tiles[y * map.width + x];
  if (!t || !t.rail) return [];
  if (!isPlayerLandBridge(t)) return [];

  const axis = straightAxis(t.rail);
  if (!axis) return [];
  const cells = [{ x, y }];
  const dirs = axis === 'x' ? [DIRS[3], DIRS[1]] : [DIRS[0], DIRS[2]];

  for (const d of dirs) {
    let cx = x, cy = y;
    for (;;) {
      const nx = cx + d.dx, ny = cy + d.dy;
      if (!inBounds(map, nx, ny)) break;
      const nt = map.tiles[ny * map.width + nx];
      if (!isPlayerLandBridge(nt) || !(nt.rail & OPPOSITE[d.bit])) break;
      cells.push({ x: nx, y: ny });
      // If this tile is a head (not a deck tile), we reached the end of the bridge in this direction
      if (nt.bridgeDeck === undefined) break;
      cx = nx; cy = ny;
    }
  }
  return cells;
}

/**
 * Build a straight player rail land bridge along a drag (head, valley deck run, head).
 * @param {object} ctx {state}
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {object} [opts]
 * @returns {{ok:true,cost:number,tiles:number}|{ok:false,error:string}}
 */
export function buildLandBridge(ctx, x0, y0, x1, y1, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (!coordsOk(map, x0, y0, x1, y1)) return { ok: false, error: ERR.bounds };

  const pts = linePath(x0, y0, x1, y1);
  const plan = planLandBridge(map, pts);
  if (!plan.ok) return plan;

  const n = pts.length;
  const axis = pts[0].x === pts[1].x ? 'y' : 'x';
  const bits = AXIS_BITS[axis];
  let cost = 0, changed = 0;
  const outer = [];

  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const i = p.y * map.width + p.x;
    const t = map.tiles[i];
    if (plan.deck.has(i)) {
      cost += COSTS.rail + COSTS.bridgeRail + clearingCost(t);
      changed++;
      continue;
    }
    if ((t.rail | bits) !== t.rail) {
      cost += COSTS.rail + clearingCost(t);
      changed++;
    }
  }

  // The outer neighbours of both heads connect to existing track beyond them, if any
  for (const [p, out] of [[pts[0], -1], [pts[n - 1], 1]]) {
    const d = axis === 'x' ? DIRS[out < 0 ? 3 : 1] : DIRS[out < 0 ? 0 : 2];
    const nx = p.x + d.dx, ny = p.y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    const nt = map.tiles[ny * map.width + nx];
    if (nt.rail && !canAddBits(nt, 'rail', OPPOSITE[d.bit])) outer.push({ x: nx, y: ny, bit: OPPOSITE[d.bit] });
  }

  if (changed === 0) return { ok: false, error: ERR.built };
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, tiles: n };

  for (const p of pts) {
    const i = p.y * map.width + p.x;
    const t = map.tiles[i];
    clearTerrain(t);
    t.rail |= bits;
    t.playerBridge = 1;
    if (plan.deck.has(i)) {
      t.bridgeDeck = plan.height;
    }
    delete t.signal;
    if (!t.owner) t.owner = 'company';
    pruneOneWay(t);
  }
  for (const o of outer) map.tiles[o.y * map.width + o.x].rail |= o.bit;
  invalidateBlocks(state);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, tiles: n };
}
