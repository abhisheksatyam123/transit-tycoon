/** Ships (T26): docks on land, ship depots and buoys on water, water pathing, delivery, buoy orders, save/load. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { findShipPath } from '../js/simulation/shipPath.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { SHIP_MODELS } from '../js/config/ships.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { placeIndustry } from '../js/simulation/industries.js';

/**
 * Flat 40x30 map, all grass at height 1, with a water channel and an island. Water: x 4..35, y 4..25 is a sea,
 * with a 6x6 island of land at x 14..19, y 12..17 in the middle. Returns the game.
 */
function seaGame() {
  const game = Game.create({ seed: 7, width: 40, height: 30 });
  const s = game.state;
  for (let y = 0; y < s.map.height; y++) for (let x = 0; x < s.map.width; x++) {
    const t = s.map.tiles[y * s.map.width + x];
    t.height = 1; t.rail = 0; t.road = 0; t.building = null; t.owner = null; t.terrain = 'grass';
  }
  for (let y = 4; y <= 25; y++) for (let x = 4; x <= 35; x++) {
    const t = s.map.tiles[y * s.map.width + x];
    t.terrain = 'water'; t.height = 0;
  }
  for (let y = 12; y <= 17; y++) for (let x = 14; x <= 19; x++) {
    const t = s.map.tiles[y * s.map.width + x];
    t.terrain = 'grass'; t.height = 1;
  }
  for (const town of s.towns) town.houses = [];
  s.company.money = 5_000_000;
  return game;
}

/**
 * A dock on the west shore (land at x 3, beside water x 4) and one on the east shore (land at x 36, beside water x 35).
 * The east dock sits next to an oil refinery (accepts OIL), so the station accepts oil through its catchment.
 */
function twoDocks(game) {
  const a = game.buildDock(3, 8);
  const b = game.buildDock(36, 8);
  expect(a.ok).toBe(true);
  expect(b.ok).toBe(true);
  const ref = placeIndustry(game.state, 'refinery', 36, 4);
  expect(ref).toBeTruthy();
  return { a, b };
}

describe('dock placement', () => {
  test('a dock needs land next to open water', () => {
    const game = seaGame();
    const r = game.buildDock(3, 8, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(game.buildDock(20, 14, { dryRun: true }).ok).toBe(false); // interior land, no water neighbour
      });

  test('a dock on water fails and is never built', () => {
    const game = seaGame();
    const r = game.buildDock(10, 10);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/water/i);
    expect(game.state.stations.length).toBe(0);
  });

  test('a dock is a station tile of kind dock with catchment radius 4, and merges with adjacent station tiles', () => {
    const game = seaGame();
    const a = game.buildDock(3, 8);
    expect(a.ok).toBe(true);
    const st = game.state.stations.find((x) => x.id === a.stationId);
    expect(st.kinds.dock).toBe(true);
    expect(st.tiles[0].kind).toBe('dock');
    expect(st.tiles[0].radius).toBe(4);
    const b = game.buildDock(3, 9);
    expect(b.stationId).toBe(a.stationId);
    expect(game.state.stations.length).toBe(1);
  });

  test('a dock cannot be built on a tile with track or a building', () => {
    const game = seaGame();
    game.tile(3, 8).road = 2;
    expect(game.buildDock(3, 8, { dryRun: true }).ok).toBe(false);
  });
});

describe('ship depot and buoy', () => {
  test('a ship depot goes on water only', () => {
    const game = seaGame();
    expect(game.buildShipDepot(10, 10).ok).toBe(true);
    const bad = game.buildShipDepot(3, 8);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/water/i);
    const dep = game.state.depots.find((d) => d.kind === 'ship');
    expect(dep).toBeTruthy();
    expect(dep.x).toBe(10);
  });

  test('a buoy is a one-tile water station of kind buoy', () => {
    const game = seaGame();
    const r = game.buildBuoy(10, 20);
    expect(r.ok).toBe(true);
    const st = game.state.stations.find((x) => x.id === r.stationId);
    expect(st.tiles).toEqual([{ x: 10, y: 20, kind: 'buoy', radius: 0 }]);
    expect(game.buildBuoy(3, 8).ok).toBe(false);
  });
});

describe('ship models', () => {
  test('three temperate ship models from OpenTTD, not in the news list', () => {
    expect(SHIP_MODELS.map((m) => m.name)).toEqual(['MPS Oil Tanker', 'MPS Passenger Ferry', 'Yate Cargo Ship']);
    for (const m of SHIP_MODELS) expect(MODEL_BY_ID[m.id]).toBe(m);
    expect(MODEL_BY_ID.ship_oiltanker.kind).toBe('ship');
    expect(MODEL_BY_ID.ship_oiltanker.news).toBe(false);
  });

  test('buy ship: a ship depot sells ships of its kind and creates a ship vehicle', () => {
    const game = seaGame();
    const d = game.buildShipDepot(10, 10);
    expect(d.ok).toBe(true);
    const models = game.listModels('ship').map((m) => m.id);
    expect(models).toContain('ship_oiltanker');
    expect(models).toContain('ship_ferry');
    const r = game.buyVehicle(d.depotId, { modelId: 'ship_oiltanker' });
    expect(r.ok).toBe(true);
    expect(r.vehicle.kind).toBe('ship');
    expect(r.vehicle.state).toBe('depot');
    expect(r.vehicle.cargoId).toBe('OIL');
    // a train model cannot be bought in a ship depot
    expect(game.buyVehicle(d.depotId, { modelId: 'eng_puffer' }).ok).toBe(false);
  });
});

describe('ship pathing', () => {
  test('a ship goes around an island on the water, never over land', () => {
    const game = seaGame();
    const path = findShipPath(game.state.map, { x: 10, y: 14 }, [{ x: 25, y: 14 }]);
    expect(path).toBeTruthy();
    expect(path[0]).toEqual({ x: 10, y: 14 });
    expect(path[path.length - 1]).toEqual({ x: 25, y: 14 });
    for (const p of path) {
      const t = game.tile(p.x, p.y);
      expect(t.terrain === 'water' || (p.x === 10 && p.y === 14) || (p.x === 25 && p.y === 14)).toBe(true);
    }
    // the island blocks the straight line, so the route is longer than the 15 tiles straight across
    expect(path.length - 1).toBeGreaterThan(15);
  });

  test('no water route: an island cut off from the sea has no path', () => {
    const game = seaGame();
    for (let y = 4; y <= 25; y++) game.tile(30, y).terrain = 'grass'; // a land wall splits the sea
    const path = findShipPath(game.state.map, { x: 10, y: 14 }, [{ x: 33, y: 14 }]);
    expect(path).toBeNull();
  });
});

describe('ship trips', () => {
  test('a tanker loads at one dock, sails and delivers oil at the other, and is paid', () => {
    const game = seaGame();
    const { a, b } = twoDocks(game);
    const s = game.state;
    const depot = game.buildShipDepot(5, 10);
    expect(depot.ok).toBe(true);
    const st = s.stations.find((x) => x.id === a.stationId);
    st.cargo.OIL = [{ amount: 500, sourceX: 3, sourceY: 8, sinceTick: 0 }];
    const dst = s.stations.find((x) => x.id === b.stationId);
    const bought = game.buyVehicle(depot.depotId, { modelId: 'ship_oiltanker' });
    expect(bought.ok).toBe(true);
    const v = bought.vehicle;
    expect(game.setOrders(v.id, [{ stationId: a.stationId }, { stationId: b.stationId }]).ok).toBe(true);
    expect(game.startVehicle(v.id).ok).toBe(true);
    const money0 = s.company.money;
    let loaded = false, moved = false;
    for (let t = 0; t < 8000 && !(loaded && s.company.money > money0); t++) {
      game.step();
      if (v.load.amount > 0) loaded = true;
      if (v.kind === 'ship' && (v.tx !== 3 || v.ty !== 8) && v.state === 'running') moved = true;
    }
    expect(loaded).toBe(true);
    expect(moved).toBe(true);
    expect(s.company.money).toBeGreaterThan(money0);
  }, 20000);

  test('buoy order: a ship passes its buoy waypoint and continues to the dock', () => {
    const game = seaGame();
    const { a, b } = twoDocks(game);
    const s = game.state;
    const depot = game.buildShipDepot(5, 10);
    const buoy = game.buildBuoy(10, 20);
    expect(buoy.ok).toBe(true);
    const st = s.stations.find((x) => x.id === a.stationId);
    st.cargo.OIL = [{ amount: 200, sourceX: 3, sourceY: 8, sinceTick: 0 }];
    const v = game.buyVehicle(depot.depotId, { modelId: 'ship_oiltanker' }).vehicle;
    expect(game.setOrders(v.id, [{ stationId: a.stationId }, { stationId: buoy.stationId }, { stationId: b.stationId }]).ok).toBe(true);
    expect(game.startVehicle(v.id).ok).toBe(true);
    // the ship first loads at the west dock (order 0), then must pass the buoy (order 1) before the east dock
    let passedBuoy = false, passedBuoyAt = null;
    for (let t = 0; t < 8000 && !passedBuoy; t++) {
      game.step();
      if (v.orderIndex === 2 && passedBuoyAt === null) passedBuoyAt = s.tick;
      if (v.tx === 10 && v.ty === 20) passedBuoy = true;
    }
    expect(passedBuoy).toBe(true);
    const money0 = s.company.money;
    for (let t = 0; t < 8000 && !(s.company.money > money0); t++) game.step();
    expect(s.company.money).toBeGreaterThan(money0);
  }, 30000);
});

describe('save and load', () => {
  test('docks, ship depots, buoys and ships survive a save/load round trip', () => {
    const game = seaGame();
    const { a, b } = twoDocks(game);
    const depot = game.buildShipDepot(5, 10);
    const buoy = game.buildBuoy(10, 20);
    const v = game.buyVehicle(depot.depotId, { modelId: 'ship_ferry' }).vehicle;
    game.setOrders(v.id, [{ stationId: a.stationId }, { stationId: b.stationId }]);
    const state = parseState(serializeState(game.state));
    const kinds = state.stations.flatMap((st) => st.tiles.map((t) => t.kind));
    expect(kinds).toContain('dock');
    expect(kinds).toContain('buoy');
    expect(state.depots.some((d) => d.kind === 'ship' && d.x === 5 && d.y === 10)).toBe(true);
    const sv = state.vehicles.find((x) => x.id === v.id);
    expect(sv.kind).toBe('ship');
    expect(sv.modelId).toBe('ship_ferry');
    expect(sv.orders.map((o) => o.stationId)).toEqual([a.stationId, b.stationId]);
    expect(state.stations.some((st) => st.id === buoy.stationId)).toBe(true);
  });
});
