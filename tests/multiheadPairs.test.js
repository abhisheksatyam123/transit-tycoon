// D17 multihead pairs (multiheadPairs, default off): one twin-engine unit (eng_twin_thunder) bought as a whole.
// Off = not offered and nothing changes. On = bought as the lead engine; power/cost/running are pair totals;
// a pair is never split or attached as an extra engine.
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { engineList, extraEngineCount, isMultihead } from '../js/simulation/consistEngines.js';
import { totalWeight, totalPower } from '../js/simulation/loco/vehicleMotion.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { modelAvailable, purchasable } from '../js/simulation/vehicles.js';
import { vehiclePrice } from '../js/simulation/prices.js';

const PAIR = 'eng_twin_thunder';

function setup(year = 1960) {
  const g = flatGame(23);
  g.state.date.year = year;
  const L = coalLine(g);
  return { g, L };
}

describe('multiheadPairs setting and model', () => {
  test('defaults off and has exactly one SETTING_META entry (vehicles / check)', () => {
    expect(DEFAULT_SETTINGS.multiheadPairs).toBe(false);
    const entries = SETTING_META.filter((m) => m.key === 'multiheadPairs');
    expect(entries.length).toBe(1);
    expect(entries[0].group).toBe('vehicles');
    expect(entries[0].type).toBe('check');
  });

  test('the pair model is multihead with pair totals and per-head (zero) capacity', () => {
    const m = MODEL_BY_ID[PAIR];
    expect(m.kind).toBe('engine');
    expect(isMultihead(m)).toBe(true);
    expect(m.weight).toBe(120);
    expect(m.power).toBe(2 * MODEL_BY_ID.eng_thunder.power);
    expect(m.capacity).toBe(0);
  });
});

describe('multiheadPairs off: not offered, nothing changes', () => {
  test('modelAvailable is false and buying the pair is refused', () => {
    const { g, L } = setup();
    expect(modelAvailable(g.state, MODEL_BY_ID[PAIR], null)).toBe(false);
    const r = g.buyVehicle(L.depotId, { modelId: PAIR, wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Model not yet available');
  });

  test('other engines are unaffected (single-engine motion path)', () => {
    const { g, L } = setup();
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_thunder', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
    expect(engineList(v)).toEqual(['eng_thunder']);
    expect(totalWeight(v)).toBe(60 + 2 * 25);
    expect(totalPower(v, MODEL_BY_ID.eng_thunder)).toBe(MODEL_BY_ID.eng_thunder.power);
  });
});

describe('multiheadPairs on: bought whole, pair totals', () => {
  test('buying the pair gives one engine unit with pair power, weight and cost', () => {
    const { g, L } = setup();
    setSetting(g.state, 'multiheadPairs', true);
    expect(modelAvailable(g.state, MODEL_BY_ID[PAIR], null)).toBe(true);
    expect(purchasable(MODEL_BY_ID[PAIR], g.state.date.year)).toBe(true);
    const r = g.buyVehicle(L.depotId, { modelId: PAIR, wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(Object.prototype.hasOwnProperty.call(v, 'engines')).toBe(false);
    expect(engineList(v)).toEqual([PAIR]);
    expect(totalWeight(v)).toBe(120 + 2 * 25);
    expect(totalPower(v, MODEL_BY_ID[PAIR])).toBe(3600);
    const plain = g.buyVehicle(L.depotId, { modelId: PAIR, wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }, { dryRun: true });
    expect(r.cost).toBe(plain.cost);
    expect(r.cost).toBe(vehiclePrice(g.state, MODEL_BY_ID[PAIR].cost) + vehiclePrice(g.state, MODEL_BY_ID.wag_hopper.cost) * 2);
  });

  test('the pair is never attached as an extra engine (buy spec or addEngine)', () => {
    const { g, L } = setup();
    setSetting(g.state, 'multiheadPairs', true);
    setSetting(g.state, 'multiEngineConsists', true);
    const bad = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL', engines: [PAIR] });
    expect(bad.ok).toBe(false);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
    const r = g.addEngine(v.id, PAIR);
    expect(r.ok).toBe(false);
    expect(extraEngineCount(v)).toBe(0);
  });
});
