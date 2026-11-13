/**
 * Rollback support for rival route building (gap #25): a rival build that commits stations/depots/track
 * and then fails must not leave orphan assets behind. Callers snapshot the tiles the attempt may touch
 * (and the rival's lists/cash) before the first committed command, then either forget the snapshot on
 * success or roll it back on failure.
 *
 * Only assets created by this attempt are removed: tiles are restored from their pre-attempt copies and
 * stations/depots/vehicles are filtered back to the ids that existed in the snapshot, so pre-existing
 * player or rival infrastructure is untouched.
 *
 * The snapshot is complete enough to be indistinguishable from a failure-free run: the ledger's nested
 * byType buckets, state.nextId, every town's house list, station accepts/kinds and (for multi-tile
 * houses) every part of a house that intersects the touched tiles are restored too.
 */
import { getTile } from './map.js';
import { invalidateBlocks } from './signals.js';
import { LARGE_GROUPS } from './largeHouses.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * Expand the touched tiles with every part of any multi-tile house that intersects them. A house record
 * lives on each part as {type:'house', size, ax, ay, lgId}; the anchor (ax, ay) is the only town.houses
 * entry, and clearHouseAt clears the whole group. Without this a house straddling the footprint keeps its
 * parts outside the snapshot cleared after rollback.
 * @returns {{x:number,y:number}[]} footprint + all house-group tiles
 */
function houseTiles(state, tiles) {
  const map = state.map;
  const out = [];
  const seen = new Set();
  const add = (x, y) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    const key = y * map.width + x;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ x, y });
  };
  for (const p of tiles) {
    if (!p || p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) continue;
    const b = map.tiles[p.y * map.width + p.x].building;
    if (!b || b.type !== 'house') continue;
    if (!b.size) { add(p.x, p.y); continue; }
    const g = LARGE_GROUPS.find((q) => q.id === b.lgId);
    const offs = g ? g.parts : [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (const [dx, dy] of offs) add(b.ax + dx, b.ay + dy);
  }
  return out;
}

/**
 * Snapshot a rival build attempt.
 * @param {any} state game state
 * @param {any} r rival company
 * @param {{x:number,y:number}[]} tiles every map tile the attempt may change
 */
export function beginRivalAttempt(state, r, tiles = []) {
  const map = state.map;
  const seen = new Set();
  const tileSnap = [];
  // include the parts of any large house the footprint clips so clearHouseAt's off-footprint clears roll back
  for (const p of [...tiles, ...houseTiles(state, tiles)]) {
    if (!p || p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) continue;
    const key = p.y * map.width + p.x;
    if (seen.has(key)) continue;
    seen.add(key);
    tileSnap.push({ x: p.x, y: p.y, tile: clone(getTile(map, p.x, p.y)) });
  }
  return {
    state,
    r,
    tiles: tileSnap,
    stationIds: new Set(state.stations.map((s) => s.id)),
    depotIds: new Set(state.depots.map((d) => d.id)),
    vehicleIds: new Set(state.vehicles.map((v) => v.id)),
    // accepts/kinds are recomputed when a build merges into an existing station; snapshot them so a
    // rollback restores the exact pre-attempt values (a recompute would depend on post-restore map state).
    stationMeta: state.stations.map((s) => ({
      ref: s, tiles: s.tiles.map((p) => ({ ...p })), x: s.x, y: s.y,
      kinds: clone(s.kinds), accepts: clone(s.accepts),
    })),
    // the airport command removes houses from the town list; the tile snapshot alone cannot restore it
    towns: (state.towns || []).map((t) => ({ ref: t, houses: t.houses.slice() })),
    nextId: state.nextId,
    money: r.money,
    ledgerCurrent: r.ledger && r.ledger.current ? clone(r.ledger.current) : null,
    expenditures: r.expenditures ? clone(r.expenditures) : null,
    lists: {
      stations: r.stations.slice(),
      depots: r.depots.slice(),
      vehicles: r.vehicles.slice(),
      routes: r.routes.slice(),
      railIndustries: r.railIndustries ? r.railIndustries.slice() : null,
      freightIndustries: r.freightIndustries ? r.freightIndustries.slice() : null,
      shipIndustries: r.shipIndustries ? r.shipIndustries.slice() : null,
    },
  };
}

/** Undo everything an attempt added and restore its cash/ledger/lists. */
export function rollbackRivalAttempt(a) {
  const { state, r } = a;
  const map = state.map;
  for (const p of a.tiles) {
    const t = getTile(map, p.x, p.y);
    for (const k of Object.keys(t)) delete t[k];
    Object.assign(t, p.tile);
  }
  state.stations = state.stations.filter((s) => a.stationIds.has(s.id));
  for (const m of a.stationMeta) {
    m.ref.tiles = m.tiles; m.ref.x = m.x; m.ref.y = m.y;
    m.ref.kinds = m.kinds; m.ref.accepts = m.accepts;
  }
  state.depots = state.depots.filter((d) => a.depotIds.has(d.id));
  state.vehicles = state.vehicles.filter((v) => a.vehicleIds.has(v.id));
  for (const t of a.towns) t.ref.houses = t.houses;
  state.nextId = a.nextId;
  r.stations = a.lists.stations;
  r.depots = a.lists.depots;
  r.vehicles = a.lists.vehicles;
  r.routes = a.lists.routes;
  if (a.lists.railIndustries) r.railIndustries = a.lists.railIndustries; else delete r.railIndustries;
  if (a.lists.freightIndustries) r.freightIndustries = a.lists.freightIndustries; else delete r.freightIndustries;
  if (a.lists.shipIndustries) r.shipIndustries = a.lists.shipIndustries; else delete r.shipIndustries;
  r.money = a.money;
  if (r.ledger && a.ledgerCurrent) r.ledger.current = a.ledgerCurrent;
  if (a.expenditures) r.expenditures = a.expenditures; else delete r.expenditures;
  invalidateBlocks(state);
}
