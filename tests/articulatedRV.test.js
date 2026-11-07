/** Articulated road vehicles (articulated.js, ARTIC_VEHICLE_MODELS, articulatedRV setting). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { ARTIC_VEHICLE_MODELS, MODEL_BY_ID, VEHICLE_MODELS } from '../js/config/vehicles.js';
import { articParts, partOffsets, partFills, articSpan } from '../js/simulation/articulated.js';
import { getVehicleSegments, historyNeeded, createVehicle, resolvePurchase } from '../js/simulation/vehicles.js';
import { setSetting, getSetting } from '../js/simulation/settings.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { listModels } from '../js/simulation/queries.js';

const PLAIN_SPEC = { modelId: 'bus_city' };

describe('articulated model config', () => {
  test('models carry parts that sum to their capacity, length in tiles', () => {
    expect(ARTIC_VEHICLE_MODELS.length).toBeGreaterThanOrEqual(3);
    for (const m of ARTIC_VEHICLE_MODELS) {
      expect(m.parts.length).toBeGreaterThan(1);
      expect(m.parts.reduce((s, p) => s + p.capacity, 0)).toBe(m.capacity);
      for (const p of m.parts) expect(p.length).toBeGreaterThan(0);
      expect(m.optIn).toBe('articulated');
      expect(m.news).toBe(false);
      expect(MODEL_BY_ID[m.id]).toBe(m);
    }
  });

  test('has an articulated bus, a lorry and a tram with realistic intro years', () => {
    const bus = MODEL_BY_ID.bus_artic, truck = MODEL_BY_ID.trk_artic, tram = MODEL_BY_ID.tram_artic;
    expect([bus.kind, truck.kind, tram.kind]).toEqual(['bus', 'truck', 'tram']);
    expect(bus.introYear).toBeGreaterThanOrEqual(1950);
    expect(truck.introYear).toBeGreaterThanOrEqual(1950);
    expect(tram.introYear).toBeGreaterThanOrEqual(1920);
  });

  test('existing models are unchanged (no parts, no optIn)', () => {
    for (const m of VEHICLE_MODELS) {
      expect(m.parts).toBeUndefined();
      expect(m.optIn).toBeUndefined();
    }
  });
});

describe('articulated helpers', () => {
  test('partOffsets: head at 0, each part half its length plus half the next apart', () => {
    expect(partOffsets([{ capacity: 1, length: 1 }, { capacity: 1, length: 1 }])).toEqual([0, 1]);
    const off = partOffsets([{ capacity: 1, length: 0.8 }, { capacity: 1, length: 0.6 }, { capacity: 1, length: 0.6 }]);
    expect(off[0]).toBe(0);
    expect(off[1]).toBeCloseTo(0.7, 9);
    expect(off[2]).toBeCloseTo(1.3, 9);
  });

  test('partFills fills the head first and clamps to 0..1', () => {
    const p = [{ capacity: 20, length: 1 }, { capacity: 20, length: 1 }];
    expect(partFills(p, 0)).toEqual([0, 0]);
    expect(partFills(p, 25)).toEqual([1, 0.25]);
    expect(partFills(p, 40)).toEqual([1, 1]);
  });

  test('articParts is null for plain and non-road vehicles', () => {
    expect(articParts({ kind: 'road', modelId: 'bus_city' })).toBeNull();
    expect(articParts({ kind: 'train', modelId: 'bus_artic' })).toBeNull();
    expect(articParts({ kind: 'road', modelId: 'bus_artic' })).toEqual(MODEL_BY_ID.bus_artic.parts);
    expect(articSpan({ kind: 'road', modelId: 'bus_city' })).toBe(0);
    expect(articSpan({ kind: 'road', modelId: 'bus_artic' })).toBeGreaterThan(0);
  });
});

describe('articulated gating and purchase', () => {
  test('default games do not offer articulated models (setting off)', () => {
    const g = flatGame();
    expect(getSetting(g.state, 'articulatedRV')).toBe(false);
    const ids = listModels(g.state, 'bus').map((m) => m.id);
    expect(ids).not.toContain('bus_artic');
  });

  test('with the setting on, the bus is offered and resolves to total capacity and parts', () => {
    const g = flatGame();
    setSetting(g.state, 'articulatedRV', true);
    g.state.date.year = 1990;
    const depot = { kind: 'road', id: 1, x: 0, y: 0 };
    const r = resolvePurchase(depot, { modelId: 'bus_artic' }, 1990);
    expect(r.ok).toBe(true);
    expect(r.template.capacity).toBe(MODEL_BY_ID.bus_artic.capacity);
    expect(listModels(g.state, 'bus').map((m) => m.id)).toContain('bus_artic');
  });

  test('plain bus purchase is unchanged by the setting', () => {
    const g = flatGame();
    g.state.date.year = 1990;
    const depot = { kind: 'road', id: 1, x: 0, y: 0 };
    const before = resolvePurchase(depot, PLAIN_SPEC, 1990);
    setSetting(g.state, 'articulatedRV', true);
    const after = resolvePurchase(depot, PLAIN_SPEC, 1990);
    expect(after).toEqual(before);
  });

  test('buying an articulated bus on a road depot creates a vehicle with the model parts and full capacity', () => {
    const g = flatGame();
    setSetting(g.state, 'articulatedRV', true);
    g.state.date.year = 1990;
    const r = g.buildRoad(10, 24, 30, 24);
    expect(r.ok).toBe(true);
    const d = g.buildDepot(12, 25, 'road', 1);
    expect(d.ok).toBe(true);
    const depotId = g.state.depots[g.state.depots.length - 1].id;
    const buy = g.buyVehicle(depotId, { modelId: 'bus_artic' });
    expect(buy.ok).toBe(true);
    expect(buy.vehicle.modelId).toBe('bus_artic');
    expect(buy.vehicle.capacity).toBe(60);
    expect(articParts(buy.vehicle).length).toBe(2);
  });
});

describe('articulated segments and occupancy', () => {
  function artic(modelId = 'bus_artic') {
    const g = flatGame();
    const model = MODEL_BY_ID[modelId];
    const depot = { kind: 'road', id: 1, x: 10, y: 24, dir: 2 };
    const v = createVehicle(g.state, depot, { model, wagonModelId: undefined, wagons: 0, cargoId: 'PASS', capacity: model.capacity, running: model.running }, 1000);
    v.state = 'running';
    v.path = Array.from({ length: 12 }, (_, i) => ({ x: 10 + i, y: 24 }));
    v.pathIndex = 6;
    v.progress = 0;
    v.history = [{ x: 16, y: 24 }, { x: 15, y: 24 }, { x: 14, y: 24 }, { x: 13, y: 24 }, { x: 12, y: 24 }, { x: 11, y: 24 }, { x: 10, y: 24 }];
    return v;
  }

  test('one segment per part, head first, followers trail behind the head along the path', () => {
    const v = artic();
    const segs = getVehicleSegments(v);
    expect(segs.length).toBe(2);
    expect(segs[0].x).toBe(16);
    expect(segs[1].x).toBeLessThan(segs[0].x);
    expect(segs[0].x - segs[1].x).toBeCloseTo(MODEL_BY_ID.bus_artic.parts[0].length / 2 + MODEL_BY_ID.bus_artic.parts[1].length / 2, 9);
  });

  test('loaded fill is distributed over the parts head first', () => {
    const v = artic();
    v.load = { amount: 30, sourceX: 0, sourceY: 0, sinceTick: 0, fromStationId: null };
    const segs = getVehicleSegments(v);
    expect(segs[0].fill).toBe(1);
    expect(segs[1].fill).toBe(0);
    expect(segs[0].loaded).toBe(true);
    expect(segs[1].loaded).toBe(false);
  });

  test('a plain bus still yields exactly one segment', () => {
    const g = flatGame();
    const model = MODEL_BY_ID.bus_city;
    const depot = { kind: 'road', id: 1, x: 10, y: 24, dir: 2 };
    const v = createVehicle(g.state, depot, { model, wagons: 0, cargoId: 'PASS', capacity: model.capacity, running: model.running }, 1000);
    v.state = 'running';
    v.path = [{ x: 10, y: 24 }, { x: 11, y: 24 }];
    v.pathIndex = 0;
    v.progress = 0.5;
    v.history = [{ x: 10, y: 24 }];
    expect(getVehicleSegments(v).length).toBe(1);
    expect(historyNeeded(v)).toBe(3);
  });

  test('history kept behind an articulated vehicle covers its whole span', () => {
    const v = artic();
    expect(historyNeeded(v)).toBeGreaterThanOrEqual(Math.ceil(articSpan(v)) + 3);
  });

  test('save/load keeps the articulated model and capacity (fields are derived from the model)', () => {
    const g = flatGame();
    setSetting(g.state, 'articulatedRV', true);
    const v = artic();
    g.state.vehicles.push(v);
    const s2 = parseState(serializeState(g.state));
    const back = s2.vehicles.find((x) => x.id === v.id);
    expect(back.modelId).toBe('bus_artic');
    expect(back.capacity).toBe(60);
    expect(articParts(back).length).toBe(2);
  });
});
