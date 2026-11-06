/**
 * Placeable map objects (OpenTTD object_cmd.cpp CMD_BUILD_OBJECT for OBJECT_TRANSMITTER, OBJECT_LIGHTHOUSE,
 * OBJECT_OWNED_LAND; object_land.h). Stored lazily as tile.object = {type:'transmitter'|'lighthouse'|'owned'}.
 * Objects occupy one tile and are removed by demolish (no refund, like the HQ). Towns never build on an
 * object tile (towns.js / loco/townGrow.js), so owned land keeps a tile free of houses and roads.
 * The Company HQ is a separate 2x2 object (cmdHQ.js) and is not stored here.
 */
import { COSTS } from '../config/costs.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { checkMoney, coordsOk } from './trackRules.js';
import { notify } from './news.js';

export const OBJECT_TYPES = ['transmitter', 'lighthouse', 'owned'];

export const OBJECT_ERR = {
  bounds: 'Site is outside the map',
  water: 'Cannot build on water',
  terrain: 'Clear the trees or rock first',
  occupied: 'Site is occupied by a building, track, road or object',
  flat: 'Transmitters need a flat site',
  coast: 'Lighthouses must stand on the coast, beside water',
  unknown: 'Unknown object type',
};

/** Price of an object (inflation-adjusted). */
export function objectPrice(state, type) {
  const base = type === 'transmitter' ? COSTS.buildTransmitter
    : type === 'lighthouse' ? COSTS.buildLighthouse : COSTS.buildOwnedLand;
  return constructionTotal(state, base);
}

/** Site check (pure). @returns {string} error or '' */
export function objectSiteError(state, type, x, y) {
  if (!OBJECT_TYPES.includes(type)) return OBJECT_ERR.unknown;
  const map = state.map;
  if (!coordsOk(map, x, y)) return OBJECT_ERR.bounds;
  const t = map.tiles[y * map.width + x];
  if (t.terrain === 'water') return OBJECT_ERR.water;
  if (t.terrain === 'forest' || t.terrain === 'rock') return OBJECT_ERR.terrain;
  if (t.building || t.rail || t.road || t.object) return OBJECT_ERR.occupied;
  const nb = [];
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const nx = x + dx, ny = y + dy;
    if (coordsOk(map, nx, ny)) nb.push(map.tiles[ny * map.width + nx]);
  }
  if (type === 'transmitter' && nb.some((n) => n.height !== t.height)) return OBJECT_ERR.flat;
  if (type === 'lighthouse' && !nb.some((n) => n.terrain === 'water')) return OBJECT_ERR.coast;
  return '';
}

/** Pure estimate for the UI: {ok, cost, error}. */
export function estimateObject(state, type, x, y) {
  const cost = objectPrice(state, type);
  const err = objectSiteError(state, type, x, y) || (checkMoney(state, cost) || {}).error || '';
  return { ok: !err, cost, error: err || null };
}

/**
 * Build an object on tile (x,y). Charges the (inflated) price. opts.dryRun = check only.
 * @returns {{ok:true,cost:number}|{ok:false,error:string}}
 */
export function buildObject(ctx, type, x, y, opts = {}) {
  const { state } = ctx;
  const err = objectSiteError(state, type, x, y);
  if (err) return { ok: false, error: err };
  const cost = objectPrice(state, type);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost };
  spend(state.company, 'construction', state.editor ? 0 : cost);
  state.map.tiles[y * state.map.width + x].object = { type };
  notify(ctx, `A ${type === 'owned' ? 'parcel of owned land' : type} was built at ${x},${y}`, 'build');
  return { ok: true, cost };
}
