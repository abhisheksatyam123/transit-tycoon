/** NE: never-expire vehicles (OpenTTD vehicle.never_expire_vehicles): obsoleteYear is ignored when on. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { purchasable, resolvePurchase } from '../js/simulation/vehicles.js';
import { replacementCandidates } from '../js/simulation/autoreplace.js';
import { listModels } from '../js/simulation/queries.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

const small = { seed: 3, width: 64, height: 64, townCount: 3, industryCount: 4 };
const rail = { kind: 'rail' };

describe('neverExpireVehicles', () => {
  test('default is off and the model is obsolete as before', () => {
    expect(DEFAULT_SETTINGS.neverExpireVehicles).toBe(false);
    const g = Game.create(small);
    expect(getSetting(g.state, 'neverExpireVehicles')).toBe(false);
    expect(purchasable(MODEL_BY_ID.eng_puffer, 1960)).toBe(false);
    expect(purchasable(MODEL_BY_ID.eng_puffer, 1960, false)).toBe(false);
    expect(resolvePurchase(rail, { modelId: 'eng_puffer', wagons: 0 }, 1960, false).error).toBe('Model is obsolete');
  });

  test('when on, an obsolete model is purchasable (introYear still applies)', () => {
    expect(purchasable(MODEL_BY_ID.eng_puffer, 1960, true)).toBe(true);
    expect(purchasable(MODEL_BY_ID.eng_puffer, 1919, true)).toBe(false);
    const r = resolvePurchase(rail, { modelId: 'eng_puffer', wagons: 0 }, 1960, true);
    expect(r.ok).toBe(true);
  });

  test('state-aware callers read the setting (listModels, replacement candidates)', () => {
    const g = Game.create(small);
    g.state.date.year = 1960;
    expect(listModels(g.state, 'engine').some((m) => m.id === 'eng_puffer')).toBe(false);
    setSetting(g.state, 'neverExpireVehicles', true);
    expect(listModels(g.state, 'engine').some((m) => m.id === 'eng_puffer')).toBe(true);
    expect(replacementCandidates('eng_thunder', 1960).map((m) => m.id)).not.toContain('eng_puffer');
    expect(replacementCandidates('eng_thunder', 1960, true).map((m) => m.id)).toContain('eng_puffer');
  });

  test('settings window row exists exactly once', () => {
    expect(SETTING_META.filter((m) => m.key === 'neverExpireVehicles').length).toBe(1);
  });

  test('save/load keeps the setting', () => {
    const g = Game.create(small);
    setSetting(g.state, 'neverExpireVehicles', true);
    const s2 = parseState(serializeState(g.state));
    expect(getSetting(s2, 'neverExpireVehicles')).toBe(true);
  });
});
