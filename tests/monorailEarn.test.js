/** Monorail earnings: the existing coal-line fixture (helpers.coalLine) built on monorail track. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';

describe('monorail train earns money', () => {
  test('X2001 + coal wagons on a monorail coal line deliver and income > 0', () => {
    const g = flatGame();
    g.state.date.year = 2005; // monorail track and X2001 introduced (1998)
    const s = g.state;
    placeIndustry(s, 'coal_mine', 10, 20);
    placeIndustry(s, 'power_station', 40, 20);
    expect(g.buildRailStation(10, 24, 'x', 3, { trk: 2 }).ok).toBe(true);
    expect(g.buildRailStation(40, 24, 'x', 3, { trk: 2 }).ok).toBe(true);
    expect(g.buildRail(13, 24, 39, 24, { trk: 2 }).ok).toBe(true);
    expect(g.buildDepot(20, 25, 'rail', 1).ok).toBe(true);
    const depot = s.depots[s.depots.length - 1];
    const [a, b] = [s.stations[s.stations.length - 2], s.stations[s.stations.length - 1]];
    const r = g.buyVehicle(depot.id, { modelId: 'eng_mono_x2001', wagonModelId: 'wag_mono_coal', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(g.setOrders(v.id, [{ stationId: a.id, full: true }, { stationId: b.id, full: false }]).ok).toBe(true);
    let income = 0;
    g.on('income', (e) => { income += e?.amount ?? 1; });
    expect(g.startVehicle(v.id).ok).toBe(true);
    for (let i = 0; i < 30000 && income === 0; i++) g.step();
    expect(income).toBeGreaterThan(0);
  }, 60000);
});

describe('plain control on the same fixture', () => {
  test('plain coal train on plain track earns too (fixture is sound)', () => {
    const g = flatGame();
    g.state.date.year = 2005;
    const s = g.state;
    placeIndustry(s, 'coal_mine', 10, 20);
    placeIndustry(s, 'power_station', 40, 20);
    expect(g.buildRailStation(10, 24, 'x', 3).ok).toBe(true);
    expect(g.buildRailStation(40, 24, 'x', 3).ok).toBe(true);
    expect(g.buildRail(13, 24, 39, 24).ok).toBe(true);
    expect(g.buildDepot(20, 25, 'rail', 1).ok).toBe(true);
    const depot = s.depots[s.depots.length - 1];
    const [a, b] = [s.stations[s.stations.length - 2], s.stations[s.stations.length - 1]];
    const r = g.buyVehicle(depot.id, { modelId: g.listModels('engine')[0].id, wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(g.setOrders(r.vehicle.id, [{ stationId: a.id, full: true }, { stationId: b.id, full: false }]).ok).toBe(true);
    let income = 0;
    g.on('income', (e) => { income += e?.amount ?? 1; });
    expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
    for (let i = 0; i < 30000 && income === 0; i++) g.step();
    expect(income).toBeGreaterThan(0);
  }, 60000);
});
