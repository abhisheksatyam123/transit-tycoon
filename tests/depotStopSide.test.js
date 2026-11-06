/** F12: a depot exit must not face the side of a drive-through road stop (OpenTTD); plain-road orientation unchanged. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { autoDepotDir, onlyStopSideNeighbour, depotUiRefusal } from '../js/ui/tools/depot.js';
import { STOP_SIDE_ERR } from '../js/simulation/cmdStation.js';
import { placeIndustry } from '../js/simulation/industries.js';

/** Straight road y=17 x 24..28 with truck drive-through stops at both ends. */
function stopRoad(seed = 7) {
  const g = flatGame(seed);
  expect(g.buildRoad(24, 17, 28, 17).ok).toBe(true);
  const a = g.buildRoadStop(24, 17, 'truck');
  const b = g.buildRoadStop(28, 17, 'truck');
  expect(a.ok && b.ok).toBe(true);
  return { g, a, b };
}

describe('depot exit vs drive-through stop side', () => {
  test('depot south of a stop: no connectable neighbour, placement refused with the hint', () => {
    const { g } = stopRoad();
    expect(onlyStopSideNeighbour(g, 24, 18, 'road')).toBe(true);
    expect(autoDepotDir(g, 24, 18, 'road')).toBe(0);
    // the UI's default exit (S) would face empty land: the depot tool refuses with the hint, places nothing
    expect(depotUiRefusal(g, 24, 18, 'road')).toBe(STOP_SIDE_ERR);
    expect(g.state.depots.length).toBe(0);
    expect(g.state.map.tiles[18 * 96 + 24].road | 0).toBe(0);
    // the core keeps the old empty-land rule for a deliberate exit into bare ground
    expect(g.buildDepot(24, 18, 'road', 4, { dryRun: true }).ok).toBe(true);
  });

  test('core refuses an exit facing a stop side, dry run too', () => {
    const { g } = stopRoad();
    expect(g.buildDepot(24, 18, 'road', 1).error).toBe(STOP_SIDE_ERR); // exit N into the stop
    expect(g.buildDepot(24, 18, 'road', 1, { dryRun: true }).ok).toBe(false);
  });

  test('a depot at the stop axis end (exit along the stop) is allowed and auto-oriented', () => {
    const { g } = stopRoad();
    expect(onlyStopSideNeighbour(g, 23, 17, 'road')).toBe(false);
    expect(autoDepotDir(g, 23, 17, 'road')).toBe(2); // east, into the stop's entry
    expect(g.buildDepot(23, 17, 'road', 2).ok).toBe(true);
  });

  test('a plain road beside a stop still wins the auto orientation', () => {
    const { g } = stopRoad();
    expect(g.buildRoad(29, 17, 29, 14).ok).toBe(true);
    expect(g.buildRoad(29, 18, 29, 19).ok).toBe(true); // plain road east of the depot spot (28,18)
    expect(autoDepotDir(g, 28, 18, 'road')).toBe(2); // exit east onto the plain road
    expect(onlyStopSideNeighbour(g, 28, 18, 'road')).toBe(false);
  });

  test('plain-road auto-orient for a normal road is unchanged', () => {
    const g = flatGame(7);
    expect(g.buildRoad(20, 24, 30, 24).ok).toBe(true);
    expect(autoDepotDir(g, 25, 25, 'road')).toBe(1); // road to the north
    expect(g.buildDepot(25, 25, 'road', 1).ok).toBe(true);
    expect(g.state.map.tiles[24 * 96 + 25].road & 4).toBeTruthy();
  });

  test('a depot at the stop axis end lets a truck leave, load coal, and reach both stops', () => {
    const { g, a, b } = stopRoad(7);
    const s = g.state;
    placeIndustry(s, 'coal_mine', 25, 19);
    const dep = g.buildDepot(23, 17, 'road', 2);
    expect(dep.ok).toBe(true);
    const r = g.buyVehicle(dep.depotId, { modelId: 'trk_bulk', cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(g.setOrders(v.id, [{ stationId: a.stationId, full: true }, { stationId: b.stationId, full: false }]).ok).toBe(true);
    expect(g.startVehicle(v.id).ok).toBe(true);
    const visited = new Set();
    let loaded = 0;
    for (let d = 0; d < 60; d++) {
      g.stepDays(1);
      if (v.atStationId) visited.add(v.atStationId);
      if (v.cargo && v.cargo.amount > loaded) loaded = v.cargo.amount;
      if (v.load && v.load.amount > loaded) loaded = v.load.amount;
    }
    expect(loaded).toBeGreaterThan(0);
    expect(visited.has(a.stationId)).toBe(true);
    expect(visited.has(b.stationId)).toBe(true);
  });
});

import { Game } from '../js/simulation/game.js';
import { TERRA_ERR } from '../js/simulation/cmdTerraform.js';
import { createTerraformTool } from '../js/ui/tools/terraform.js';

describe('scenario editor: empty flat map is land, water refusals say why', () => {
  const editor = () => Game.create({ editor: true, seed: 7, width: 96, height: 96, startYear: 1950, emptyFlat: true, townCount: 0, industryCount: 0 });
  test('empty flat map has no water; the centre is flat land at height 1', () => {
    const g = editor();
    expect(g.state.map.tiles.some((t) => t.terrain === 'water')).toBe(false);
    expect(g.state.map.tiles[48 * 96 + 48]).toMatchObject({ terrain: 'grass', height: 1 });
  });
  test('raise and found a town work at the centre of an empty flat map', () => {
    const g = editor();
    expect(g.terraform('raise', { x0: 40, y0: 40, x1: 43, y1: 43 }).ok).toBe(true);
    expect(g.foundTown(60, 60).ok).toBe(true);
  });
  test('found town on water says why', () => {
    const g = editor();
    g.state.map.tiles[60 * 96 + 60].terrain = 'water';
    expect(g.foundTown(60, 60)).toEqual({ ok: false, error: 'Cannot found a town on water' });
  });
  test('terraform on water says why', () => {
    const g = editor();
    g.state.map.tiles[40 * 96 + 40].terrain = 'water';
    expect(g.terraform('raise', { x0: 40, y0: 40, x1: 40, y1: 40 })).toEqual({ ok: false, error: TERRA_ERR.water });
    expect(TERRA_ERR.water).toMatch(/water/);
  });
  test('terraform tool shows the water reason in its preview', () => {
    const g = editor();
    g.state.map.tiles[40 * 96 + 40].terrain = 'water';
    const app = { game: g, renderer: { overlay: {} }, toast() {}, exec() {}, ui: {} };
    const tool = createTerraformTool(app);
    tool.down({ x: 40, y: 40 });
    tool.move({ x: 40, y: 40 });
    expect(app.renderer.overlay.preview.ok).toBe(false);
    expect(app.renderer.overlay.preview.label).toBe(TERRA_ERR.water);
  });
});
