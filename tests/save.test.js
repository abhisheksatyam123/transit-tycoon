import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame, coalLine } from './helpers.js';

describe('save / load', () => {
  test('deserialize(serialize()) round-trips to identical JSON', () => {
    const g = flatGame();
    coalLine(g);
    const json = g.serialize();
    const g2 = Game.deserialize(json);
    expect(g2.serialize()).toBe(json);
  });

  // Explicit timeout: 6000 total steps (two games x 3000 ticks), ~0.55 s standalone but well
  // past Bun's 5 s default when the host is loaded by the rest of the suite; the tick count is
  // part of the check, so keep it and give the work a generous bound (20 s = >4x margin).
  test('loaded game and original stay identical after 3000 ticks', () => {
    const g = flatGame(11);
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 3, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    g.setOrders(r.vehicle.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]);
    g.startVehicle(r.vehicle.id);
    const g2 = Game.deserialize(g.serialize());
    for (let i = 0; i < 3000; i++) { g.step(); g2.step(); }
    expect(g2.serialize()).toBe(g.serialize());
  }, 20000);

  test('deserialize rejects garbage input', () => {
    expect(() => Game.deserialize('{not json')).toThrow();
  });
});
