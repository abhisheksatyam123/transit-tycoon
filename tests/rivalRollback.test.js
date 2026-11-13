/** N11: rival attempt rollback is indistinguishable from a failure-free run. A rolled-back route must
 * restore the map/town house bookkeeping, cash + ledger buckets + expenditures, ids, and merged-station
 * accepts/kinds. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { ensureRivals } from '../js/simulation/aiCompanies.js';
import { beginRivalAttempt, rollbackRivalAttempt } from '../js/simulation/rivalAttempt.js';
import { spend } from '../js/simulation/economy.js';
import { createStation } from '../js/simulation/stations.js';
import { airportType } from '../js/simulation/airportTypes.js';
import { buildAirport } from '../js/simulation/cmdAirport.js';
import { buildRailStation, buildRoadStop } from '../js/simulation/cmdStation.js';
import { makeTile } from '../js/simulation/map.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

function world(seed, startYear = 2000) {
  const g = Game.create({ seed, width: 96, height: 96, townCount: 8, startYear });
  setSetting(g.state, 'aiCompanies', 1);
  const r = ensureRivals(g.state, 1)[0];
  r.money = 1e6;
  return { g, r };
}

/** Replace a rectangle with fresh grass tiles so a build has a deterministic, empty, flat site. */
function clearArea(state, x0, y0, w, h) {
  const map = state.map;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) map.tiles[y * map.width + x] = makeTile();
}

describe('N11 rival rollback hardening', () => {
  test('rollback restores money, nested ledger.byType, expenditures and nextId', () => {
    const { g, r } = world(31);
    const before = {
      money: r.money,
      byType: clone(r.ledger.current.byType),
      expenses: r.ledger.current.expenses,
      expenditures: clone(r.expenditures),
      nextId: g.state.nextId,
      stations: g.state.stations.length,
    };
    const preByType = r.ledger.current.byType;
    const a = beginRivalAttempt(g.state, r, []);
    spend(r, 'construction', 700);
    createStation(g.state, 5, 5);
    expect(r.ledger.current.byType.construction).toBe(before.byType.construction + 700);
    expect(g.state.nextId).toBe(before.nextId + 1);
    rollbackRivalAttempt(a);
    expect(r.money).toBe(before.money);
    expect(r.ledger.current.byType).toEqual(before.byType);
    expect(r.ledger.current.expenses).toBe(before.expenses);
    expect(r.expenditures).toEqual(before.expenditures);
    expect(g.state.nextId).toBe(before.nextId);
    expect(g.state.stations.length).toBe(before.stations);
    // the restored buckets are a fresh object, not the shared one the shallow copy used to leave behind
    expect(r.ledger.current.byType).not.toBe(preByType);
  });

  test('airport rollback restores map tiles and town.houses, including parts of a large house outside the footprint', () => {
    const { g, r } = world(17);
    const state = g.state;
    clearArea(state, 18, 18, 16, 12);
    const map = state.map;
    const town = state.towns[0];
    const ax = 22, ay = 22; // small airport origin (4x3)
    const hx = ax + 3, hy = ay + 2; // 2x2 house anchor at the footprint's bottom-right corner
    // a 1x1 house inside the footprint
    const one = map.tiles[ay * map.width + ax];
    one.building = { type: 'house', townId: town.id, level: 1, variant: 2 };
    one.owner = 'town';
    town.houses.push({ x: ax, y: ay });
    // a 2x2 house whose anchor is the only part inside the footprint; the other 3 parts are outside
    for (let part = 0; part < 4; part++) {
      const dx = part % 2, dy = part >> 1;
      const t = map.tiles[(hy + dy) * map.width + hx + dx];
      t.building = { type: 'house', townId: town.id, level: 2, variant: part, size: '2x2', part, ax: hx, ay: hy, lgId: 20 };
      t.owner = 'town';
    }
    town.houses.push({ x: hx, y: hy });

    const footprint = airportType('small').layout.map((p) => ({ x: ax + p.dx, y: ay + p.dy }));
    const houseParts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => ({ x: hx + dx, y: hy + dy }));
    const touched = [...footprint, ...houseParts];
    const beforeTiles = touched.map((p) => clone(map.tiles[p.y * map.width + p.x]));
    const beforeHouses = clone(state.towns.map((t) => t.houses));
    const beforeHouseCount = state.towns.find((t) => t.id === town.id).houses.length;
    const beforeStations = state.stations.length, beforeDepots = state.depots.length;

    const a = beginRivalAttempt(state, r, footprint);
    const res = buildAirport(g.ctx, ax, ay, { type: 'small', owner: r.id });
    expect(res.ok).toBe(true);
    expect(state.towns.find((t) => t.id === town.id).houses.length).toBe(beforeHouseCount - 2);
    expect(map.tiles[(hy + 1) * map.width + hx + 1].building).toBeNull(); // off-footprint part cleared by clearHouseAt

    rollbackRivalAttempt(a);
    expect(touched.map((p) => map.tiles[p.y * map.width + p.x])).toEqual(beforeTiles);
    expect(state.towns.map((t) => t.houses)).toEqual(beforeHouses);
    expect(state.stations.length).toBe(beforeStations);
    expect(state.depots.length).toBe(beforeDepots);
  });

  test('a merge into an existing station leaves its accepts/kinds unchanged after rollback', () => {
    const { g, r } = world(23);
    clearArea(g.state, 40, 40, 16, 10);
    const rail = buildRailStation(g.ctx, 42, 42, 'x', 3, { owner: r.id });
    expect(rail.ok).toBe(true);
    const st = g.state.stations.find((s) => s.id === rail.stationId);
    expect(st).toBeTruthy();
    const beforeKinds = clone(st.kinds);
    const beforeAccepts = clone(st.accepts);
    const beforeTiles = st.tiles.length;

    const a = beginRivalAttempt(g.state, r, [{ x: 42, y: 43 }, { x: 43, y: 43 }, { x: 44, y: 43 }]);
    const stop = buildRoadStop(g.ctx, 42, 43, 'bus', { owner: r.id, axis: 'x' });
    expect(stop.ok).toBe(true);
    expect(stop.stationId).toBe(st.id);
    expect(st.kinds.bus).toBe(true);

    rollbackRivalAttempt(a);
    expect(st.tiles.length).toBe(beforeTiles);
    expect(st.kinds).toEqual(beforeKinds);
    expect(st.accepts).toEqual(beforeAccepts);
  });
});
