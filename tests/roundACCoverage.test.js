/**
 * Round AC coverage: settings that had no behaviour test.
 *  - maxTrains / maxAircraft / maxShips: the purchase is refused at the per-company limit.
 *  - linkgraphDistributionMail: the mail link-graph routing mode reads its own setting.
 *  - trainAcceleration: 'realistic' feeds realisticTrainSpeedStep in movement.js.
 *  - planeSpeedFactor: a non-default factor divides the aircraft speed target in movement.js.
 */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { cdMode, cdApplies, cargodistMode } from '../js/simulation/cargodist.js';
import { vehicleTick } from '../js/simulation/movement.js';
import { KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
import { AIRPORT_W, AIRPORT_H } from '../js/simulation/constants.js';

const countKind = (state, kind) => state.vehicles.filter((v) => v.kind === kind).length;

/** First top-left airport corner where a small airport can be built (dry run). */
function findAirportSpot(game) {
  for (let y = 4; y < game.state.map.height - AIRPORT_H; y++) {
    for (let x = 4; x < game.state.map.width - AIRPORT_W; x++) {
      if (game.buildAirport(x, y, { dryRun: true }).ok) return { x, y };
    }
  }
  return null;
}

/** Air game with one airport; returns the game and the hangar depot id. */
function airGame() {
  const game = Game.create({ seed: 5, width: 96, height: 96 });
  game.state.company.money = 5_000_000;
  const spot = findAirportSpot(game);
  if (!spot) throw new Error('no airport spot');
  const r = game.buildAirport(spot.x, spot.y);
  if (!r.ok) throw new Error(r.error);
  return { game, depotId: r.depotId };
}

/** Flat 40x30 map with a sea (x 4..35, y 4..25); returns the game and a ship depot id. */
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
  for (const town of s.towns) town.houses = [];
  s.company.money = 5_000_000;
  const d = game.buildShipDepot(10, 10);
  if (!d.ok) throw new Error(d.error);
  return { game, depotId: d.depotId };
}

describe('maxTrains / maxAircraft / maxShips: purchase refused at the limit', () => {
  test('maxTrains: a second train at the limit is refused and the count stays 1', () => {
    const g = flatGame();
    const d = g.buildDepot(20, 25, 'rail', 1);
    expect(d.ok).toBe(true);
    const depotId = g.state.depots[g.state.depots.length - 1].id;
    setSetting(g.state, 'maxTrains', 1);
    const spec = { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL' };
    expect(g.buyVehicle(depotId, spec).ok).toBe(true);
    const second = g.buyVehicle(depotId, spec);
    expect(second.ok).toBe(false);
    expect(second.error).toBe('Vehicle limit reached: 1 trains per company');
    expect(countKind(g.state, 'train')).toBe(1);
  });

  test('maxAircraft: a second aircraft at the limit is refused and the count stays 1', () => {
    const { game, depotId } = airGame();
    setSetting(game.state, 'maxAircraft', 1);
    expect(game.buyVehicle(depotId, { modelId: 'ac_li2' }).ok).toBe(true);
    const second = game.buyVehicle(depotId, { modelId: 'ac_li2' });
    expect(second.ok).toBe(false);
    expect(second.error).toBe('Vehicle limit reached: 1 aircraft per company');
    expect(countKind(game.state, 'aircraft')).toBe(1);
  });

  test('maxShips: a second ship at the limit is refused and the count stays 1', () => {
    const { game, depotId } = seaGame();
    setSetting(game.state, 'maxShips', 1);
    expect(game.buyVehicle(depotId, { modelId: 'ship_oiltanker' }).ok).toBe(true);
    const second = game.buyVehicle(depotId, { modelId: 'ship_oiltanker' });
    expect(second.ok).toBe(false);
    expect(second.error).toBe('Vehicle limit reached: 1 ships per company');
    expect(countKind(game.state, 'ship')).toBe(1);
  });
});

describe('linkgraphDistributionMail', () => {
  test('mail routing mode reads its own setting; the default follows cargodist', () => {
    const g = flatGame();
    setSetting(g.state, 'cargodist', 'symmetric');
    expect(DEFAULT_SETTINGS.linkgraphDistributionMail).toBe('follow');
    expect(cargodistMode(g.state)).toBe('symmetric');
    expect(cdMode(g.state, 'MAIL')).toBe('symmetric');
    expect(cdMode(g.state, 'PASS')).toBe('symmetric');
    expect(cdApplies(g.state, 'MAIL')).toBe(true);

    setSetting(g.state, 'linkgraphDistributionMail', 'manual');
    expect(cdMode(g.state, 'MAIL')).toBe('manual');
    expect(cdApplies(g.state, 'MAIL')).toBe(false);
    // mail only: passenger distribution keeps following cargodist
    expect(cdMode(g.state, 'PASS')).toBe('symmetric');

    setSetting(g.state, 'linkgraphDistributionMail', 'asymmetric');
    expect(cdMode(g.state, 'MAIL')).toBe('asymmetric');
    expect(cdApplies(g.state, 'MAIL')).toBe(true);
  });
});

describe('trainAcceleration: movement uses the selected model', () => {
  /** Rail line (10,10)..(15,10); returns { g, path }. */
  function railLine() {
    const g = flatGame();
    for (let x = 10; x < 15; x++) expect(g.buildRail(x, 10, x + 1, 10).ok).toBe(true);
    return { g, path: [[10, 10], [11, 10], [12, 10], [13, 10], [14, 10], [15, 10]].map(([x, y]) => ({ x, y })) };
  }

  function runTicks(g, path, mode, ticks = 50) {
    setSetting(g.state, 'trainAcceleration', mode);
    const v = {
      kind: 'train', modelId: 'eng_thunder', wagons: 4, load: null, speed: 0,
      maxSpeed: 128 * KMH_TO_TILES_PER_TICK, path: path.slice(), pathIndex: 1, progress: 0,
      tx: 11, ty: 10, orders: [], history: [], state: 'running',
    };
    const ctx = { state: g.state, emit() {}, collide: false };
    for (let t = 0; t < ticks; t++) { v.pathIndex = 1; v.progress = 0; vehicleTick(ctx, v); }
    return v.speed;
  }

  test('realistic mode changes the speed produced by vehicleTick after 50 ticks', () => {
    const { g, path } = railLine();
    const original = runTicks(g, path, 'original');
    const realistic = runTicks(g, path, 'realistic');
    expect(realistic).not.toBe(original);
    expect(realistic).toBeGreaterThan(0);
  });
});

describe('planeSpeedFactor: movement divides the aircraft speed target', () => {
  test('factor 2 halves the aircraft speed reached by vehicleTick', () => {
    const g = flatGame(7);
    const path = Array.from({ length: 800 }, (_, i) => ({ x: 10 + i, y: 20 }));
    function run(pf) {
      setSetting(g.state, 'planeSpeedFactor', pf);
      const v = {
        kind: 'aircraft', modelId: 'ac_li2', state: 'running', speed: 0,
        maxSpeed: 100 / 1024, path: path.slice(), pathIndex: 1, progress: 0, history: [], orders: [],
      };
      const ctx = { state: g.state, emit() {}, collide: false };
      for (let t = 0; t < 100; t++) vehicleTick(ctx, v);
      return v.speed;
    }
    const full = run(1);
    const half = run(2);
    expect(half).toBeLessThan(full);
    expect(half).toBeCloseTo(full / 2, 5);
  });
});
