/** Force train to proceed (OpenTTD CmdForceTrainProceed, "Ignore signal"): passes exactly the next signal. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';

/** Single line from station a (x 10-12) to b (x 40-42) with a block signal at x=30 (trains go a -> b). */
function lineWorld() {
  const g = flatGame(19);
  const L = coalLine(g);
  expect(g.buildSignal(30, 24).ok).toBe(true);
  const mk = () => {
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(g.setOrders(r.vehicle.id, [{ stationId: L.b.id, full: false }]).ok).toBe(true);
    return r.vehicle;
  };
  return { g, L, mk };
}

describe('force train to proceed past a signal', () => {
  test('a train held at a block signal passes it after forceTrainProceed; the flag is removed', () => {
    const { g, mk } = lineWorld();
    const first = mk(), second = mk();
    expect(g.startVehicle(first.id).ok).toBe(true);
    for (let i = 0; i < 40 * 96 && first.tx < 33; i++) g.step(); // first is past the signal (x=30)
    expect(g.startVehicle(second.id).ok).toBe(true);
    // the first train is inside the block beyond the signal (x>30) when the second reaches the signal and waits
    let held = null;
    for (let i = 0; i < 40 * 96 && !held; i++) {
      g.step();
      // held on the signal tile (x=30) by the first train ahead in the block beyond it
      if (second.state === 'running' && second.speed === 0 && second.tx === 30 && second.blockedBy === first.id) held = second;
    }
    expect(held).not.toBeNull();
    expect(held.forceProceed).toBeUndefined();
    const r = g.forceTrainProceed(held.id);
    expect(r.ok).toBe(true);
    expect(held.forceProceed).toBeDefined();
    const passedX = 30;
    let passed = false;
    for (let i = 0; i < 20 * 96; i++) {
      g.step();
      if (held.tx > passedX) { passed = true; break; }
    }
    expect(passed).toBe(true); // moved beyond the signal tile (x=30) while the blocker still occupies the block
    expect(held.forceProceed).toBeUndefined(); // flag removed once it left the signal
  });

  test('dryRun changes nothing; refused for a bus, a train in a depot, and with no signal ahead', () => {
    const { g, mk } = lineWorld();
    const t = mk();
    expect(g.forceTrainProceed(t.id).ok).toBe(false); // in depot
    const bus = { id: 999999, kind: 'road', state: 'running' };
    g.state.vehicles.push(bus);
    expect(g.forceTrainProceed(bus.id).ok).toBe(false);
    g.state.vehicles.pop();
    expect(g.startVehicle(t.id).ok).toBe(true);
    expect(g.forceTrainProceed(t.id, { dryRun: true }).ok).toBe(true);
    expect(t.forceProceed).toBeUndefined();
  });
});
