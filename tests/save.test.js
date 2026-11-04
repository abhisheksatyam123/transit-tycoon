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
  });

  test('deserialize rejects garbage input', () => {
    expect(() => Game.deserialize('{not json')).toThrow();
  });
});
