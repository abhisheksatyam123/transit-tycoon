import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { refitVehicle, REFIT_COST_FRACTION } from '../js/simulation/cmdVehicle.js';
import { vehiclePrice } from '../js/simulation/prices.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { parseState } from '../js/simulation/save.js';

function train() {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('partial refit (A2, opt-in)', () => {
  test('default off: a loaded vehicle is still refused (today\'s TT rule)', () => {
    const { g, v } = train();
    expect(DEFAULT_SETTINGS.partialRefit).toBe(false);
    expect(getSetting(g.state, 'partialRefit')).toBe(false);
    v.load.amount = 5;
    expect(refitVehicle(g.ctx, v.id, 'IORE').error).toMatch(/Unload/);
    expect(v.cargoId).toBe('COAL');
    expect(v.load.amount).toBe(5);
  });

  test('on: a loaded same-cargo refit keeps the load and truncates it to the new capacity', () => {
    const { g, v } = train();
    setSetting(g.state, 'partialRefit', true);
    const w = MODEL_BY_ID.wag_hopper;
    // fewer wagons than the load was loaded for: the refit recomputes capacity from the consist
    v.wagons = 1;
    v.capacity = w.capacity * 2;
    v.load.amount = w.capacity * 2;
    v.load.fromStationId = 123;
    v.load.feeder = 7;
    const r = refitVehicle(g.ctx, v.id, 'COAL');
    expect(r.ok).toBe(true);
    expect(r.capacity).toBe(w.capacity);
    expect(v.cargoId).toBe('COAL');
    expect(v.capacity).toBe(w.capacity);
    expect(v.load.amount).toBe(w.capacity);
    expect(r.cost).toBe(0); // same cargo: OpenTTD charges only on a cargo type change
  });

  test('on: a cargo type change drops the load and charges the cost', () => {
    const { g, v } = train();
    setSetting(g.state, 'partialRefit', true);
    v.load.amount = 30;
    v.load.fromStationId = 123;
    v.load.feeder = 9;
    v.load.dests = { 5: 30 };
    const before = g.state.company.money;
    const r = refitVehicle(g.ctx, v.id, 'IORE');
    expect(r.ok).toBe(true);
    expect(v.cargoId).toBe('IORE');
    expect(v.load.amount).toBe(0);
    expect(v.load.fromStationId).toBe(null);
    expect(v.load.feeder).toBeUndefined();
    expect(v.load.dests).toBeUndefined();
    expect(g.state.company.money).toBe(before - r.cost);
    expect(r.cost).toBeGreaterThan(0);
  });

  test('on: the refit cost is unchanged (flat fraction of the inflated purchase price)', () => {
    const { g, v } = train();
    const off = refitVehicle(g.ctx, v.id, 'GRAI', { dryRun: true });
    expect(off.ok).toBe(true);
    const w = MODEL_BY_ID.wag_hopper;
    const expected = vehiclePrice(g.state, Math.round((MODEL_BY_ID.eng_puffer.cost + w.cost * 2) * REFIT_COST_FRACTION));
    expect(off.cost).toBe(expected);
    setSetting(g.state, 'partialRefit', true);
    v.load.amount = 12;
    const on = refitVehicle(g.ctx, v.id, 'GRAI', { dryRun: true });
    expect(on.ok).toBe(true);
    expect(on.cost).toBe(expected);
    const real = refitVehicle(g.ctx, v.id, 'GRAI');
    expect(real.cost).toBe(expected);
  });

  test('the setting has exactly one SETTING_META entry in the vehicles group', () => {
    const hits = SETTING_META.filter((m) => m.key === 'partialRefit');
    expect(hits.length).toBe(1);
    expect(hits[0].group).toBe('vehicles');
    expect(hits[0].type).toBe('check');
    expect(hits[0].label.length).toBeGreaterThan(0);
    expect(hits[0].help.length).toBeGreaterThan(0);
  });

  test('a default save has no new keys; the setting round-trips when on', () => {
    const { g } = train();
    const raw = JSON.parse(g.serialize());
    expect(raw.settings).toBeUndefined();
    const loaded = parseState(g.serialize());
    expect(loaded.settings).toBeUndefined();
    expect(getSetting(loaded, 'partialRefit')).toBe(false);
    // save round-trip with the setting on (generic settings bag, no new state fields)
    setSetting(g.state, 'partialRefit', true);
    const again = parseState(g.serialize());
    expect(getSetting(again, 'partialRefit')).toBe(true);
  });
});
