import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { purchasable } from '../js/simulation/vehicles.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { vehicleDaily, obsoleteYear } from '../js/simulation/loco/vehicle.js';
import { vehiclesYearly } from '../js/simulation/vehicleLife.js';
import { Game } from '../js/simulation/game.js';

describe('vehicle eras (T17)', () => {
  test('obsoleteYear only where a successor carrying the same cargo exists (successor intro + 10); every cargo stays buyable', () => {
    for (const m of Object.values(MODEL_BY_ID)) {
      if (m.kind === 'wagon') expect(m.obsoleteYear).toBeUndefined();
      else if (m.obsoleteYear !== undefined) expect(m.obsoleteYear).toBeGreaterThan(m.introYear);
    }
    // in any year from 1920 to 2100 every vehicle kind/cargo that was ever offered still has a buyable model
    const all = Object.values(MODEL_BY_ID).filter((m) => m.kind !== 'wagon');
    for (let y = 1920; y <= 2100; y++) {
      const roles = new Set(all.filter((m) => m.introYear <= y).flatMap((m) => (m.cargos || ['-']).map((c) => `${m.kind}:${c}`)));
      const buy = new Set(all.filter((m) => purchasable(m, y)).flatMap((m) => (m.cargos || ['-']).map((c) => `${m.kind}:${c}`)));
      for (const r of roles) expect(`${y} ${r} ${buy.has(r)}`).toBe(`${y} ${r} true`);
    }
  });

  test('purchasable: not before intro, not from obsoleteYear on', () => {
    const m = MODEL_BY_ID.eng_puffer; // 1920 .. 1955 (Comet 1945 + 10)
    expect(purchasable(m, 1919)).toBe(false);
    expect(purchasable(m, 1920)).toBe(true);
    expect(purchasable(m, 1954)).toBe(true);
    expect(purchasable(m, 1955)).toBe(false);
    expect(purchasable(MODEL_BY_ID.wag_coach, 2100)).toBe(true);
  });

  test('buy list hides obsolete models; existing vehicles of an obsolete model keep running', () => {
    const g = flatGame();
    const L = coalLine(g);
    g.state.date.year = 1950;
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(g.listModels('engine').some((m) => m.id === 'eng_puffer')).toBe(true);
    g.state.date.year = 1961;
    expect(g.listModels('engine').some((m) => m.id === 'eng_puffer')).toBe(false);
    expect(g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).error).toBe('Model is obsolete');
    // the old vehicle is still there and not removed or stopped by the change
    expect(g.state.vehicles.some((x) => x.id === v.id)).toBe(true);
    expect(v.modelId).toBe('eng_puffer');
    // reliability decay keeps OpenLoco's successor rule (Comet 1945 + 5), independent of the purchase window
    expect(obsoleteYear(MODEL_BY_ID.eng_puffer)).toBe(1950);
  });

  test('news: a model is announced on Jan 1 of its intro year only (not at game start)', () => {
    const g = flatGame();
    const before = g.state.news.filter((n) => /New vehicle available/.test(n.text)).length;
    vehiclesYearly(g.ctx, 1951); // no model is introduced in 1951
    expect(g.state.news.filter((n) => /New vehicle available/.test(n.text)).length).toBe(before);
    vehiclesYearly(g.ctx, 1958);
    const hits = g.state.news.filter((n) => /New vehicle available: Thunder Diesel/.test(n.text));
    expect(hits.length).toBe(1);
  });

  test('old-age news fires when a vehicle reaches its max age', () => {
    const g = flatGame();
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL' });
    const v = r.vehicle;
    v.state = 'running'; // the daily ageing runs for vehicles outside depots
    v.age = v.maxAge - 1;
    vehicleDaily(g.ctx, v, { next: () => 0.5, int: (a) => a }, 1950);
    expect(g.state.news.some((n) => /is getting old/.test(n.text) && n.text.includes(v.name))).toBe(true);
  });

  test('era fields survive a save round-trip', () => {
    const g = flatGame();
    const g2 = Game.deserialize(g.serialize());
    expect(g2.serialize()).toBe(g.serialize());
  });
});
