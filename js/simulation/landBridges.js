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
 *   of the bridge's own layer. Ground track of the other layer (road under a rail bridge, rail under a road bridge) may
 *   be crossed at any height not above h; the deck then sits on tile[layer] and tile.overBridge = layer.
 * - Max length MAX_BRIDGE_LENGTH
 * @param {object} map
 * @param {{x:number,y:number}[]} pts
 * @returns {{ok:true, deck:Set<number>, height:number}|{ok:false, error:string}}
 */
export function planLandBridge(map, pts, layer = 'rail') {
  const other = layer === 'rail' ? 'road' : 'rail';
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
    if (t.building || t[other] || t.overBridge || (t[layer] & ~AXIS_BITS[axis])) {
      return { ok: false, error: 'Bridge heads need a free tile or straight track on the axis' };
    }
  }

  const deck = new Set();
  const over = new Map(); // tile index -> bridge layer, for deck tiles above ground track of the other layer
  for (let k = 1; k < n - 1; k++) {
    const t = tiles[k];
    if (t.building) return { ok: false, error: 'Bridge is blocked by a building' };
    if (t[layer]) return { ok: false, error: 'Bridge is blocked by track or road' };
    if (t.tunnel || t.playerTunnel) return { ok: false, error: 'Bridge is blocked by a tunnel' };
    if (t.bridgeDeck !== undefined || t.playerBridge) return { ok: false, error: 'Bridge is blocked by another bridge' };
    const i = pts[k].y * map.width + pts[k].x;
    if (t[other]) {
      // OpenTTD-style: the deck runs over ground track of the other layer; that tile keeps its own track
      if (t.height >= h) return { ok: false, error: 'Bridge must clear the road or track below' };
      over.set(i, layer);
    } else if (t.height >= h) {
      return { ok: false, error: 'Bridge must run higher than the valley floor' };
    }
    deck.add(i);
  }

  return { ok: true, deck, over, height: h };
}

/**
 * Layer of the bridge deck on a tile that also carries ground track of the other layer ('rail'|'road'), else null.
 * Only set for deck tiles over a road or rail (OpenTTD-style); valley and water decks have no overBridge.
 */
export const overBridgeLayer = (t) => (t && t.bridgeDeck !== undefined && t.overBridge) || null;

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
  if (!t || !isPlayerLandBridge(t)) return [];
  const layer = overBridgeLayer(t) || (t.rail ? 'rail' : 'road');
  if (!t[layer]) return [];

  const axis = straightAxis(t[layer]);
  if (!axis) return [];
  const cells = [{ x, y }];
  const dirs = axis === 'x' ? [DIRS[3], DIRS[1]] : [DIRS[0], DIRS[2]];

  for (const d of dirs) {
    let cx = x, cy = y;
    for (;;) {
      const nx = cx + d.dx, ny = cy + d.dy;
      if (!inBounds(map, nx, ny)) break;
      const nt = map.tiles[ny * map.width + nx];
      if (!isPlayerLandBridge(nt) || !(nt[layer] & OPPOSITE[d.bit])) break;
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
  const layer = opts.layer === 'road' ? 'road' : 'rail';
  const plan = planLandBridge(map, pts, layer);
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
      cost += COSTS[layer] + (layer === 'road' ? COSTS.bridgeRoad : COSTS.bridgeRail) + clearingCost(t);
      changed++;
      continue;
    }
    if ((t[layer] | bits) !== t[layer]) {
      cost += COSTS[layer] + clearingCost(t);
      changed++;
    }
  }

  // The outer neighbours of both heads connect to existing track beyond them, if any
  for (const [p, out] of [[pts[0], -1], [pts[n - 1], 1]]) {
    const d = axis === 'x' ? DIRS[out < 0 ? 3 : 1] : DIRS[out < 0 ? 0 : 2];
    const nx = p.x + d.dx, ny = p.y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    const nt = map.tiles[ny * map.width + nx];
    if (nt[layer] && !canAddBits(nt, layer, OPPOSITE[d.bit])) outer.push({ x: nx, y: ny, bit: OPPOSITE[d.bit] });
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
    t[layer] |= bits;
    t.playerBridge = 1;
    if (plan.deck.has(i)) t.bridgeDeck = plan.height;
    if (plan.over.has(i)) {
      // ground track of the other layer stays as it is; the deck is only added above it
      t.overBridge = plan.over.get(i);
      if (!t.owner) t.owner = 'company';
      continue;
    }
    delete t.signal;
    if (!t.owner) t.owner = 'company';
    pruneOneWay(t);
  }
  for (const o of outer) map.tiles[o.y * map.width + o.x][layer] |= o.bit;
  invalidateBlocks(state);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, tiles: n };
}
