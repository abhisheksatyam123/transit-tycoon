/** Monorail / maglev track types (config/railTypes.js; OpenTTD rail_type.h, railtypes.h, engines.h, rail.h). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { COSTS } from '../js/config/costs.js';
import { RAIL_TYPES, railBuildCost, railConvertCost, trackTypeAvailable, selectorTrack } from '../js/config/railTypes.js';
import { MODEL_BY_ID, ALL_VEHICLE_MODELS } from '../js/config/vehicles.js';
import { findPath } from '../js/simulation/pathfinder.js';
import { findVehiclePath, trainTrack } from '../js/simulation/routing.js';
import { modelAvailable, hasTrackType } from '../js/simulation/vehicles.js';
import { constructionTotal } from '../js/simulation/prices.js';

const at = (g, year) => { g.state.date.year = year; return g; };

describe('track type table', () => {
  test('ids follow OpenTTD rail_type.h: rail 0, monorail 2, maglev 3', () => {
    expect(RAIL_TYPES[0].name).toBe('Rail');
    expect(RAIL_TYPES[2].name).toBe('Monorail');
    expect(RAIL_TYPES[3].name).toBe('Maglev');
    expect(selectorTrack('mono')).toBe(2);
    expect(selectorTrack('maglev')).toBe(3);
    expect(selectorTrack('electric')).toBe(0); // electric is the elec flag, not a track type
  });

  test('build cost = COSTS.rail * cost_multiplier / 8 (OpenTTD RailBuildCost, rail.h:448-451)', () => {
    expect(railBuildCost(0)).toBe(COSTS.rail);
    expect(railBuildCost(2)).toBe(COSTS.rail * 2);
    expect(railBuildCost(3)).toBe(COSTS.rail * 3);
    expect(railConvertCost(2)).toBe(railBuildCost(2) + COSTS.demolishTrack);
  });

  test('introduction: monorail 1998, maglev 2020 (first engine intro, engines.h rows 54 and 84)', () => {
    expect(trackTypeAvailable(2, 1997)).toBe(false);
    expect(trackTypeAvailable(2, 1998)).toBe(true);
    expect(trackTypeAvailable(3, 2019)).toBe(false);
    expect(trackTypeAvailable(3, 2020)).toBe(true);
    expect(trackTypeAvailable(0, 1900)).toBe(true);
  });
});

describe('build a track type', () => {
  test('buildRail with trk sets tile.trk; plain rail leaves the field absent', () => {
    const g = at(flatGame(), 2005);
    const r = g.buildRail(10, 30, 14, 30, { trk: 2 });
    expect(r.ok).toBe(true);
    for (let x = 10; x <= 14; x++) expect(g.tile(x, 30).trk).toBe(2);
    expect(g.buildRail(10, 26, 14, 26).ok).toBe(true);
    expect(g.tile(12, 26).trk).toBeUndefined();
  });

  test('refused before the intro year', () => {
    const g = at(flatGame(), 1990);
    const r = g.buildRail(10, 30, 14, 30, { trk: 2 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not yet available/);
    expect(g.tile(12, 30).rail).toBe(0);
  });

  test('cost per tile follows the track type multiplier (dry run)', () => {
    const g = at(flatGame(), 2025);
    const plain = g.buildRail(10, 30, 14, 30, { dryRun: true });
    const mono = g.buildRail(10, 30, 14, 30, { dryRun: true, trk: 2 });
    const mag = g.buildRail(10, 30, 14, 30, { dryRun: true, trk: 3 });
    expect(plain.ok && mono.ok && mag.ok).toBe(true);
    expect(mono.cost).toBeGreaterThan(plain.cost);
    expect(mag.cost).toBeGreaterThan(mono.cost);
  });
});

describe('convert rail to a track type', () => {
  test('dragging a monorail line over plain track converts it and charges the convert cost', () => {
    const g = at(flatGame(), 2025);
    expect(g.buildRail(10, 30, 14, 30).ok).toBe(true);
    const money = g.state.company.money;
    const r = g.buildRail(10, 30, 14, 30, { trk: 2 });
    expect(r.ok).toBe(true);
    // 5 converted tiles at the OTTD convert price (rail.h RailConvertCost), before construction inflation
    expect(r.cost).toBe(constructionTotal(g.state, 5 * railConvertCost(2)));
    for (let x = 10; x <= 14; x++) expect(g.tile(x, 30).trk).toBe(2);
    expect(g.state.company.money).toBeLessThan(money);
  });

  test('converting back to plain rail clears tile.trk (absent again)', () => {
    const g = at(flatGame(), 2025);
    g.buildRail(10, 30, 14, 30, { trk: 3 });
    expect(g.buildRail(10, 30, 14, 30, { trk: 0 }).ok).toBe(true);
    expect(g.tile(12, 30).trk).toBeUndefined();
  });
});

describe('compatibility', () => {
  test('monorail train has no path over plain track; a monorail line is reachable', () => {
    const g = at(flatGame(), 2025);
    g.buildRail(10, 30, 20, 30); // plain
    const goal = [{ x: 20, y: 30 }];
    // trk requirement 2 on plain track: no route
    expect(findPath(g.state.map, { x: 10, y: 30 }, goal, 'rail', { trk: 2 })).toBeNull();
    // plain route is still found without a requirement
    expect(findPath(g.state.map, { x: 10, y: 30 }, goal, 'rail', {})).not.toBeNull();
    // converting the line makes it reachable for monorail
    expect(g.buildRail(10, 30, 20, 30, { trk: 2 }).ok).toBe(true);
    expect(findPath(g.state.map, { x: 10, y: 30 }, goal, 'rail', { trk: 2 })).not.toBeNull();
  });

  test('findVehiclePath routes a monorail train only on monorail track', () => {
    const g = at(flatGame(), 2025);
    g.buildRail(10, 30, 20, 30);
    const v = { id: 1, kind: 'train', modelId: 'eng_mono_x2001', tx: 10, ty: 30, wagons: 0, history: [] };
    expect(trainTrack(v)).toBe(2);
    expect(findVehiclePath(g.state, v, [{ x: 20, y: 30 }])).toBeNull();
  });

  test('a plain steam engine has no track type and ignores tile.trk', () => {
    const v = { kind: 'train', modelId: 'eng_puffer' };
    expect(trainTrack(v)).toBe(0);
  });

  test('buying a monorail engine is refused at a plain-rail depot', () => {
    const g = at(flatGame(), 2025);
    g.buildRail(10, 30, 20, 30, { trk: 2 });
    g.buildRail(10, 26, 20, 26); // plain track to the north
    expect(g.buildDepot(15, 27, 'rail', 1).ok).toBe(true); // depot on plain track (exit N onto y=26)
    expect(g.tile(15, 27).trk).toBeUndefined();
    const dep = g.state.depots[g.state.depots.length - 1];
    const r = g.buyVehicle(dep.id, { modelId: 'eng_mono_x2001' });
    expect(r.ok).toBe(false);
  });
});

describe('models', () => {
  test('monorail and maglev engines/wagons are in the vehicle list with their railType', () => {
    expect(MODEL_BY_ID.eng_mono_x2001.railType).toBe(2);
    expect(MODEL_BY_ID.eng_maglev_lev1.railType).toBe(3);
    expect(MODEL_BY_ID.wag_mono_pass.kind).toBe('wagon');
    expect(ALL_VEHICLE_MODELS.filter((m) => m.railType).length).toBe(11);
  });

  test('gated: offered only once a tile of that track type exists', () => {
    const g = at(flatGame(), 2025);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_mono_x2001)).toBe(false);
    expect(hasTrackType(g.state, 2)).toBe(false);
    g.buildRail(10, 30, 14, 30, { trk: 2 });
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_mono_x2001)).toBe(true);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_maglev_lev1)).toBe(false);
  });
});

describe('save round trip and old saves', () => {
  test('tile.trk round-trips through serialize/deserialize', () => {
    const g = at(flatGame(), 2025);
    g.buildRail(10, 30, 14, 30, { trk: 3 });
    const g2 = Game.deserialize(JSON.parse(g.serialize()));
    expect(g2.tile(12, 30).trk).toBe(3);
    expect(g2.serialize()).toBe(g.serialize());
  });

  test('old saves (no trk anywhere) load with plain rail', () => {
    const g = flatGame();
    g.buildRail(10, 30, 14, 30);
    const g2 = Game.deserialize(JSON.parse(g.serialize()));
    expect(g2.tile(12, 30).trk).toBeUndefined();
  });
});
