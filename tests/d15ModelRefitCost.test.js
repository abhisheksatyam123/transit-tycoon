/** D15 opt-in modelRefitCost: per-model refit cost (permille of price, cargo-carrying parts only). Default off = flat 10%. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { refitVehicle, REFIT_COST_FRACTION } from '../js/simulation/cmdVehicle.js';
import { vehiclePrice } from '../js/simulation/prices.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

function train() {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, v: r.vehicle };
}

/** Temporarily set refitCost on models (static config); returns a restore function. */
function setRefitCost(values) {
  const saved = {};
  for (const [id, val] of Object.entries(values)) {
    saved[id] = MODEL_BY_ID[id].refitCost;
    if (val === undefined) delete MODEL_BY_ID[id].refitCost;
    else MODEL_BY_ID[id].refitCost = val;
  }
  return () => {
    for (const [id, val] of Object.entries(saved)) {
      if (val === undefined) delete MODEL_BY_ID[id].refitCost;
      else MODEL_BY_ID[id].refitCost = val;
    }
  };
}

describe('D15 modelRefitCost (opt-in, default off)', () => {
  test('setting defaults off and has exactly one settings meta entry', () => {
    expect(DEFAULT_SETTINGS.modelRefitCost).toBe(false);
    expect(SETTING_META.filter((m) => m.key === 'modelRefitCost').length).toBe(1);
  });

  test('off: flat 10% of the train price, regardless of refitCost data', () => {
    const restore = setRefitCost({ wag_hopper: 500, eng_puffer: 500 });
    try {
      const { g, v } = train();
      expect(getSetting(g.state, 'modelRefitCost')).toBe(false);
      const w = MODEL_BY_ID.wag_hopper;
      const dry = refitVehicle(g.ctx, v.id, 'GRAI', { dryRun: true });
      expect(dry.cost).toBe(vehiclePrice(g.state, Math.round((MODEL_BY_ID.eng_puffer.cost + w.cost * 2) * REFIT_COST_FRACTION)));
    } finally {
      restore();
    }
  });

  test('on: cost = sum of cargo-carrying parts at permille, locomotive skipped without its own refitCost', () => {
    const restore = setRefitCost({ wag_hopper: 80, eng_puffer: undefined });
    try {
      const { g, v } = train();
      setSetting(g.state, 'modelRefitCost', true);
      const w = MODEL_BY_ID.wag_hopper;
      const dry = refitVehicle(g.ctx, v.id, 'GRAI', { dryRun: true });
      expect(dry.ok).toBe(true);
      expect(dry.cost).toBe(vehiclePrice(g.state, Math.round((w.cost * 80 / 1000)) * 2));
      expect(dry.capacity).toBe(w.capacity * 2);
    } finally {
      restore();
    }
  });

  test('on: a model with refitCost 0 is free; same-cargo refit stays free', () => {
    const restore = setRefitCost({ wag_hopper: 0 });
    try {
      const { g, v } = train();
      setSetting(g.state, 'modelRefitCost', true);
      const before = g.state.company.money;
      const r = refitVehicle(g.ctx, v.id, 'GRAI');
      expect(r.ok).toBe(true);
      expect(r.cost).toBe(0);
      expect(g.state.company.money).toBe(before);
    } finally {
      restore();
    }
  });
});
