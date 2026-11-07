/** Mass send to depot / for servicing (OpenTTD CmdMassSendVehicleToDepot, DEPOT_SERVICE). */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';

function setup(n = 2) {
  const g = flatGame(29);
  const L = coalLine(g);
  const vs = [];
  for (let i = 0; i < n; i++) {
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(g.setOrders(r.vehicle.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
    vs.push(r.vehicle);
  }
  return { g, L, vs };
}

describe('mass send to depot', () => {
  test('stop variant: every listed vehicle gets a depot goal and stops inside', () => {
    const { g, vs } = setup(3);
    for (const v of vs) g.startVehicle(v.id);
    for (let i = 0; i < 40; i++) g.step();
    const ids = vs.map((v) => v.id);
    const r = g.massSendToDepot(ids, false);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(3);
    for (const v of vs) {
      expect(v.goingToDepot == null && v.state !== 'depot').toBe(false);
      expect(v.serviceTrip).toBeFalsy();
    }
    for (let i = 0; i < 4000 && vs.some((v) => v.state !== 'depot'); i++) g.step();
    for (const v of vs) expect(v.state).toBe('depot');
  });

  test('service variant: vehicles are serviced in the depot and continue their orders', () => {
    const { g, vs } = setup(2);
    for (const v of vs) g.startVehicle(v.id);
    for (let i = 0; i < 40; i++) g.step();
    const before = vs.map((v) => v.services || 0);
    const r = g.massSendToDepot(vs.map((v) => v.id), true);
    expect(r.count).toBe(2);
    for (let i = 0; i < 4000 && vs.some((v) => (v.services || 0) === before[vs.indexOf(v)]); i++) g.step();
    vs.forEach((v, i) => {
      expect(v.services || 0).toBeGreaterThan(before[i]);
      expect(v.state).not.toBe('depot'); // never stopped
      expect(v.serviceTrip).toBeFalsy();
      expect(v.goingToDepot == null).toBe(true);
    });
    for (let i = 0; i < 2000; i++) g.step();
    for (const v of vs) expect(['running', 'lost', 'loading', 'unloading', 'waiting'].includes(v.state) || v.state === 'stopped').toBe(true);
  });

  test('skips vehicles already heading to a depot and unknown ids', () => {
    const { g, vs } = setup(2);
    for (const v of vs) g.startVehicle(v.id);
    for (let i = 0; i < 40; i++) g.step();
    expect(g.sendToDepot(vs[0].id).ok).toBe(true);
    const r = g.massSendToDepot([vs[0].id, vs[1].id, 424242], true);
    expect(r.count).toBe(1);
    expect(vs[0].serviceTrip).toBeFalsy();
    expect(vs[1].services || 0).toBeGreaterThan(0); // serviced (instant when already beside a depot, else on the way)
    expect(g.massSendToDepot([424242], false).ok).toBe(false);
  });

  test('dry run changes nothing', () => {
    const { g, vs } = setup(2);
    for (const v of vs) g.startVehicle(v.id);
    for (let i = 0; i < 40; i++) g.step();
    const r = g.massSendToDepot(vs.map((v) => v.id), true, { dryRun: true });
    expect(r.count).toBe(2);
    for (const v of vs) expect(v.serviceTrip).toBeFalsy();
  });
});
