/**
 * Aqueducts (OpenTTD tunnelbridge_cmd.cpp, transport type Water; simplified to our corner-height model).
 * A canal drag between two sloped land tiles builds a straight water channel over lower ground:
 * - heads: the two ramp tiles at the ends. Terrain 'water', tile.canal = 1, tile.aqueduct = {id, role:'head', level, dir}.
 *   On the span side their two corners are at `level`; their two rear corners are one step lower (a single ramp).
 * - deck: the tiles between the heads keep their own terrain, road, rail and objects (OpenTTD draws the bridge over
 *   them). They only carry tile.aqueduct = {id, role:'deck', level, dir}. Ships sail the deck, never leave it sideways.
 * `dir` is the DIRS bit pointing from the start head to the end head; `id` is "x0,y0-x1,y1" of the drag.
 * All aqueduct fields are lazy: absent on every other tile, so old saves load unchanged.
 */
import { COSTS } from '../config/costs.js';
import { MAX_BRIDGE_LENGTH, ERR, clearingCost, clearTerrain, checkMoney, objectBlocks } from './trackRules.js';
import { DIRS, OPPOSITE } from './constants.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { getTile } from './map.js';

const AQ_ERR = {
  notStraight: 'Aqueducts must be straight',
  tooShort: 'An aqueduct needs at least one tile between its heads',
  tooLong: `Aqueduct too long (max ${MAX_BRIDGE_LENGTH} tiles)`,
  headSlope: 'Aqueduct heads must be one step up toward the span (high edge faces the valley)',
  headLevel: 'Aqueduct heads must be at the same height',
  headBlocked: 'Aqueduct heads need a free tile with no track, road or building',
  deckLow: 'Aqueduct must run higher than the valley floor',
  deckWater: 'Aqueduct is blocked by water',
  deckBuilding: 'Aqueduct is blocked by a building',
  deckTunnel: 'Aqueduct is blocked by a tunnel',
  deckBridge: 'Aqueduct is blocked by another bridge',
  deckAqueduct: 'Aqueduct is blocked by another aqueduct',
};

/** Corner indices (N-W, N-E, S-E, S-W as in cornersOf) that lie on the side facing each DIRS bit. */
const SIDE = { 1: [0, 1], 2: [1, 2], 4: [2, 3], 8: [0, 3] };

const dirOf = (bit) => DIRS.find((d) => d.bit === bit) || null;

/** Four corner heights of tile (x,y): [x,y], [x+1,y], [x+1,y+1], [x,y+1]; null off the map. */
function cornersOf(map, x, y) {
  const out = [];
  for (const [cx, cy] of [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]) {
    const t = getTile(map, cx, cy);
    if (!t) return null;
    out.push(t.height);
  }
  return out;
}

const isFlat = (map, x, y) => { const c = cornersOf(map, x, y); return !c || c.every((v) => v === c[0]); };

/**
 * Head shape for a ramp whose span side faces `toward`: the span-side corners are at h and the rear corners at h-1.
 * @returns {number|null} the head level h, or null when the ramp is not that shape
 */
function headLevel(map, x, y, toward) {
  const c = cornersOf(map, x, y);
  if (!c) return null;
  const hi = SIDE[toward];
  const lo = [0, 1, 2, 3].filter((i) => !hi.includes(i));
  const h = c[hi[0]];
  if (!hi.every((i) => c[i] === h) || !lo.every((i) => c[i] === h - 1)) return null;
  return h;
}

/**
 * Plan an aqueduct for a drag (x0,y0)-(x1,y1). @returns {null|{ok:false,error:string}|{ok:true,tiles,level,dir,id}} null = not an aqueduct drag.
 * fullSpan (opt-in `aqueductFullSpanLimit`, default false): measure the length like bridges and tunnels (full head-to-head
 * span, n > maxLen) instead of the legacy n - 2 > maxLen, which is off by two. false = unchanged.
 */
export function planAqueduct(map, x0, y0, x1, y1, maxLen = MAX_BRIDGE_LENGTH, fullSpan = false) {
  const A = getTile(map, x0, y0), B = getTile(map, x1, y1);
  if (!A || !B) return null;
  if (A.terrain === 'water' || B.terrain === 'water' || A.canal || B.canal) return null;
  if (isFlat(map, x0, y0) || isFlat(map, x1, y1)) return null; // flat ends: an ordinary canal
  if (x0 === x1 && y0 === y1) return null;
  if (x0 !== x1 && y0 !== y1) return { ok: false, error: AQ_ERR.notStraight };
  const n = Math.abs(x1 - x0) + Math.abs(y1 - y0) + 1;
  if (n < 3) return { ok: false, error: AQ_ERR.tooShort };
  if (fullSpan) { if (n > maxLen) return { ok: false, error: AQ_ERR.tooLong }; }
  else if (n - 2 > maxLen) return { ok: false, error: AQ_ERR.tooLong };
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
  const d = dx > 0 ? 2 : dx < 0 ? 8 : dy > 0 ? 4 : 1; // from start head toward end head
  const hA = headLevel(map, x0, y0, d);
  const hB = headLevel(map, x1, y1, OPPOSITE[d]);
  if (hA === null || hB === null) return { ok: false, error: AQ_ERR.headSlope };
  if (hA !== hB) return { ok: false, error: AQ_ERR.headLevel };
  const h = hA;
  for (const t of [A, B]) {
    if (objectBlocks(t) || t.building || t.rail || t.road || t.tram || t.tunnel || t.playerTunnel
      || t.aqueduct || t.bridgeDeck !== undefined || t.playerBridge || t.lock) return { ok: false, error: AQ_ERR.headBlocked };
  }
  const tiles = [{ x: x0, y: y0, role: 'head' }];
  for (let k = 1; k < n - 1; k++) {
    const x = x0 + dx * k, y = y0 + dy * k;
    const t = getTile(map, x, y);
    if (t.terrain === 'water' || t.canal) return { ok: false, error: AQ_ERR.deckWater };
    if (t.building) return { ok: false, error: AQ_ERR.deckBuilding };
    if (t.tunnel || t.playerTunnel) return { ok: false, error: AQ_ERR.deckTunnel };
    if (t.bridgeDeck !== undefined || t.playerBridge) return { ok: false, error: AQ_ERR.deckBridge };
    if (t.aqueduct) return { ok: false, error: AQ_ERR.deckAqueduct };
    if (objectBlocks(t)) return { ok: false, error: ERR.object };
    const c = cornersOf(map, x, y);
    if (c.reduce((s, v) => s + v, 0) / 4 >= h) return { ok: false, error: AQ_ERR.deckLow };
    tiles.push({ x, y, role: 'deck' });
  }
  tiles.push({ x: x1, y: y1, role: 'head' });
  return { ok: true, tiles, level: h, dir: d, id: `${x0},${y0}-${x1},${y1}` };
}

/**
 * Build an aqueduct from a plan (see planAqueduct). opts.dryRun = check and price only.
 * @returns {{ok:true,cost:number,dir:number,tiles:number,area:object}|{ok:false,error:string}}
 */
export function buildAqueduct(ctx, plan, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  let cost = 0;
  for (const p of plan.tiles) {
    const t = map.tiles[p.y * map.width + p.x];
    cost += p.role === 'head' ? COSTS.canal + clearingCost(t) : COSTS.aqueduct;
  }
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, dir: plan.dir, tiles: plan.tiles.length };
  for (const p of plan.tiles) {
    const t = map.tiles[p.y * map.width + p.x];
    if (p.role === 'head') { clearTerrain(t); t.terrain = 'water'; t.canal = 1; }
    t.aqueduct = { id: plan.id, role: p.role, level: plan.level, dir: plan.dir };
  }
  spend(state.company, 'construction', state.editor ? 0 : cost);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of plan.tiles) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { ok: true, cost, dir: plan.dir, tiles: plan.tiles.length, area: { x0, y0, x1, y1 } };
}

/** Every cell of the aqueduct that (x,y) belongs to (both heads and the deck between them); [] when none. */
export function aqueductCells(map, x, y) {
  const t = getTile(map, x, y);
  const aq = t && t.aqueduct;
  if (!aq) return [];
  const d = dirOf(aq.dir);
  const cells = [{ x, y }];
  for (const s of [1, -1]) {
    let cx = x, cy = y;
    for (;;) {
      cx += s * d.dx; cy += s * d.dy;
      const nt = getTile(map, cx, cy);
      if (!nt || !nt.aqueduct || nt.aqueduct.id !== aq.id) break;
      cells.push({ x: cx, y: cy });
    }
  }
  return cells;
}

/**
 * Ship step across an aqueduct: deck tiles link to deck tiles of the same aqueduct, and a head links to its own
 * deck and to ordinary water beside it (the ramp). Other steps onto or off a deck are refused.
 */
export function aqueductStepOk(ta, tb) {
  const a = ta.aqueduct, b = tb.aqueduct;
  if (a && b) return a.id === b.id;
  const aq = a || b, other = a ? tb : ta;
  return aq.role === 'head' ? other.terrain === 'water' && !other.building : false;
}
