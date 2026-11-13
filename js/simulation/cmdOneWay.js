/**
 * One-way road toggle (T42, OpenTTD CMD_BUILD_ONEWAY). Cycles a straight road tile:
 * two-way -> one-way +axis -> one-way -axis -> two-way. Free of charge (only road ownership matters).
 */
import { straightAxis } from './network.js';
import { coordsOk, ERR } from './trackRules.js';

/** Next state in the cycle: 0 two-way, 1 +axis only, 2 -axis only. */
function nextOneWay(v) { return v === 1 ? 2 : v === 2 ? 0 : 1; }

/** Human label of a one-way state. */
export function oneWayLabel(v) { return v === 1 ? 'one-way (east/south)' : v === 2 ? 'one-way (west/north)' : 'two-way'; }

/**
 * Why a one-way flag cannot be set/cycled on (x,y), or null when it can.
 * Only plain straight road the company (not a town) owns, with no rail, station or depot.
 */
export function oneWayRefusal(state, x, y) {
  const map = state.map;
  if (!coordsOk(map, x, y)) return ERR.bounds;
  const t = map.tiles[y * map.width + x];
  if (!t.road) return 'No road here';
  if (straightAxis(t.road) === null) return 'One-way needs a straight road';
  if (t.rail) return 'Not on a level crossing';
  if (t.building) return 'Not on stations or depots';
  if (t.owner === 'town') return 'Town roads cannot be made one-way';
  return null;
}

/** Cycle the one-way state of a straight road tile. opts.dryRun: check only. */
export function toggleOneWay(ctx, x, y, opts = {}) {
  const { state } = ctx;
  const err = oneWayRefusal(state, x, y);
  if (err) return { ok: false, error: err };
  const t = state.map.tiles[y * state.map.width + x];
  const next = nextOneWay(t.oneWay | 0);
  if (opts.dryRun) return { ok: true, cost: 0, tiles: 1, state: next };
  if (next) t.oneWay = next; else delete t.oneWay;
  return { ok: true, cost: 0, tiles: 1, state: next };
}
