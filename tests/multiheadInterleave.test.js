// D17 interleave (multiheadInterleave, default off): optional engine slot inside the engine block.
// Off = always append (unchanged). On (with multiEngineConsists) = addEngine honours opts.position;
// sums, the lead-first rule and wagon placement are unchanged.
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { engineList, extraEngineCount } from '../js/simulation/consistEngines.js';
import { totalWeight, totalPower } from '../js/simulation/loco/vehicleMotion.js';

function setup(year = 1950) {
  const g = flatGame(29);
  g.state.date.year = year;
  const L = coalLine(g);
  return { g, L };
}

describe('multiheadInterleave setting', () => {
  test('defaults off and has exactly one SETTING_META entry (vehicles / check)', () => {
    expect(DEFAULT_SETTINGS.multiheadInterleave).toBe(false);
    const entries = SETTING_META.filter((m) => m.key === 'multiheadInterleave');
    expect(entries.length).toBe(1);
    expect(entries[0].group).toBe('vehicles');
    expect(entries[0].type).toBe('check');
  });
});

describe('multiheadInterleave off: position ignored, always append', () => {
  test('opts.position is ignored when the setting is off', () => {
    const { g, L } = setup();
    setSetting(g.state, 'multiEngineConsists', true);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagons: 0 }).vehicle;
    expect(g.addEngine(v.id, 'eng_puffer', { position: 0 }).ok).toBe(true);
    expect(g.addEngine(v.id, 'eng_puffer', { position: 0 }).ok).toBe(true);
    expect(v.engines).toEqual(['eng_puffer', 'eng_puffer']);
  });
});

describe('multiheadInterleave on: engine slot', () => {
  test('extra engine placed at a chosen slot; sums count it once and wagons are unchanged', () => {
    const { g, L } = setup(1960);
    setSetting(g.state, 'multiEngineConsists', true);
    setSetting(g.state, 'multiheadInterleave', true);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_thunder', wagons: 1, cargoId: 'COAL' }).vehicle;
    expect(g.addEngine(v.id, 'eng_comet').ok).toBe(true); // end: ['eng_comet']
    expect(g.addEngine(v.id, 'eng_thunder', { position: 0 }).ok).toBe(true); // front of the engine block
    expect(v.engines).toEqual(['eng_thunder', 'eng_comet']);
    expect(engineList(v)[0]).toBe('eng_thunder');
    expect(extraEngineCount(v)).toBe(2);
    expect(v.wagons).toBe(1);
  });

  test('sum is independent of slot order', () => {
    const { g, L } = setup(1960);
    setSetting(g.state, 'multiEngineConsists', true);
    setSetting(g.state, 'multiheadInterleave', true);
    const a = g.buyVehicle(L.depotId, { modelId: 'eng_thunder', wagons: 0 }).vehicle;
    const b = g.buyVehicle(L.depotId, { modelId: 'eng_thunder', wagons: 0 }).vehicle;
    expect(g.addEngine(a.id, 'eng_comet').ok).toBe(true);
    expect(g.addEngine(a.id, 'eng_thunder').ok).toBe(true); // a: [comet, thunder] (end appends)
    expect(g.addEngine(b.id, 'eng_thunder').ok).toBe(true);
    expect(g.addEngine(b.id, 'eng_comet', { position: 0 }).ok).toBe(true); // b: [comet, thunder] (front slot)
    expect(a.engines).toEqual(['eng_comet', 'eng_thunder']);
    expect(b.engines).toEqual(['eng_comet', 'eng_thunder']);
    expect(totalPower(a)).toBe(totalPower(b));
    expect(totalWeight(a)).toBe(totalWeight(b));
  });

  test('out-of-range or fractional position is refused without spending', () => {
    const { g, L } = setup();
    setSetting(g.state, 'multiEngineConsists', true);
    setSetting(g.state, 'multiheadInterleave', true);
    const v = g.buyVehicle(L.depotId, { modelId: 'eng_comet', wagons: 0 }).vehicle;
    const money = g.state.company.money;
    expect(g.addEngine(v.id, 'eng_puffer', { position: 1 }).ok).toBe(false);
    expect(g.addEngine(v.id, 'eng_puffer', { position: -1 }).ok).toBe(false);
    expect(g.addEngine(v.id, 'eng_puffer', { position: 0.5 }).ok).toBe(false);
    expect(extraEngineCount(v)).toBe(0);
    expect(g.state.company.money).toBe(money);
  });
});
