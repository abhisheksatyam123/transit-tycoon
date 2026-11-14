/** modelRefitCost fallback: a cargo part without refitCost pays the flat 10%; default (off) is unchanged. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { refitVehicle, REFIT_COST_FRACTION } from '../js/simulation/cmdVehicle.js';
import { vehiclePrice } from '../js/simulation/prices.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { setSetting } from '../js/simulation/settings.js';

function train() {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, v: r.vehicle };
}

/** Temporarily set (or delete when undefined) refitCost on models; returns a restore function. */
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

describe('modelRefitCost fallback to flat 10% for parts without refitCost', () => {
  test('setting off: refit cost is the unchanged flat 10% of the whole vehicle (6000 + 2x1000 = 8000 -> 800)', () => {
    const restore = setRefitCost({ eng_puffer: undefined, wag_hopper: undefined });
    try {
      const { g, v } = train();
      const dry = refitVehicle(g.ctx, v.id, 'GRAI', { dryRun: true });
      expect(dry.ok).toBe(true);
      expect(dry.cost).toBe(800);
      expect(dry.cost).toBe(vehiclePrice(g.state, Math.round((MODEL_BY_ID.eng_puffer.cost + MODEL_BY_ID.wag_hopper.cost * 2) * REFIT_COST_FRACTION)));
    } finally {
      restore();
    }
  });

  test('setting on, models without refitCost: cost is > 0 and equals flat 10% of the cargo wagons only (locomotive 0)', () => {
    const restore = setRefitCost({ eng_puffer: undefined, wag_hopper: undefined });
    try {
      const { g, v } = train();
      setSetting(g.state, 'modelRefitCost', true);
      const w = MODEL_BY_ID.wag_hopper;
      const dry = refitVehicle(g.ctx, v.id, 'GRAI', { dryRun: true });
      expect(dry.ok).toBe(true);
      expect(dry.cost).toBeGreaterThan(0);
      expect(dry.cost).toBe(vehiclePrice(g.state, Math.round(w.cost * REFIT_COST_FRACTION) * 2));
      expect(dry.cost).toBe(200);
    } finally {
      restore();
    }
  });

  test('setting on, models WITH refitCost: cost is the permille formula per part', () => {
    const restore = setRefitCost({ eng_puffer: 50, wag_hopper: 80 });
    try {
      const { g, v } = train();
      setSetting(g.state, 'modelRefitCost', true);
      const e = MODEL_BY_ID.eng_puffer;
      const w = MODEL_BY_ID.wag_hopper;
      const dry = refitVehicle(g.ctx, v.id, 'GRAI', { dryRun: true });
      expect(dry.ok).toBe(true);
      expect(dry.cost).toBe(vehiclePrice(g.state, Math.round((e.cost * 50) / 1000) + Math.round((w.cost * 80) / 1000) * 2));
      expect(dry.cost).toBe(vehiclePrice(g.state, 300 + 160));
    } finally {
      restore();
    }
  });
});
