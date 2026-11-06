/**
 * Electrification command (OpenTTD CMD_ELECTRIFY_TRACK, lazy): marks every rail tile in a rectangle with
 * `elec = 1` (catenary). Electric locomotives may only route over electrified rail. Station and depot
 * rail tiles can carry catenary too. `unelectrify` clears the flag; demolishing rail also clears it.
 */
import { COSTS } from '../config/costs.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { ERR, coordsOk, checkMoney } from './trackRules.js';

/**
 * @param {{state:any}} ctx
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 rectangle corners (inclusive)
 * @param {{dryRun?:boolean, unelectrify?:boolean}} [opts]
 * @returns {{ok:true,cost:number,tiles:number}|{ok:false,error:string}}
 */
export function convertRail(ctx, x0, y0, x1, y1, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (!coordsOk(map, x0, y0, x1, y1)) return { ok: false, error: ERR.bounds };
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const targets = [];
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const t = map.tiles[y * map.width + x];
      if (!t.rail) continue;
      if (!!t.elec === !opts.unelectrify) continue; // already in the requested state
      targets.push(y * map.width + x);
    }
  }
  if (targets.length === 0) {
    return { ok: false, error: opts.unelectrify ? 'No electrified rail here' : 'No rail to electrify here' };
  }
  // unelectrify is free (refund-less removal); electrify costs per tile at the inflated construction price
  const cost = opts.unelectrify ? 0 : constructionTotal(state, COSTS.electrify * targets.length);
  if (!opts.unelectrify) {
    const money = checkMoney(state, cost);
    if (money) return money;
  }
  if (opts.dryRun) return { ok: true, cost, tiles: targets.length };
  for (const i of targets) {
    if (opts.unelectrify) delete map.tiles[i].elec;
    else map.tiles[i].elec = 1;
  }
  if (!opts.unelectrify) spend(state.company, 'construction', cost);
  return { ok: true, cost, tiles: targets.length };
}
