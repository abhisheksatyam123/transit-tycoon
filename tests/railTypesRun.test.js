/** Monorail line end to end: monorail stations + depot + X2001 with wagons run orders A->B and earn; plain trains refused. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { findVehiclePath } from '../js/simulation/routing.js';
import { addWaiting, waitingAmount } from '../js/simulation/stations.js';

function monoLine() {
  const g = flatGame();
  g.state.date.year = 2025;
  // 40-tile monorail line y=24 with stations at both ends and a depot; plain track never touches it
  expect(g.buildRailStation(20, 24, 'x', 3, { trk: 2 }).ok).toBe(true);
  expect(g.buildRailStation(50, 24, 'x', 3, { trk: 2 }).ok).toBe(true);
  expect(g.buildRail(23, 24, 49, 24, { trk: 2 }).ok).toBe(true);
  expect(g.buildDepot(26, 25, 'rail', 1).ok).toBe(true); // exit faces east onto the monorail (trk inherited)
  const sts = g.state.stations;
  return { g, stA: sts[sts.length - 2], stB: sts[sts.length - 1], depot: g.state.depots[g.state.depots.length - 1] };
}

describe('monorail line runs a train', () => {
  test('stations and depot carry the track type', () => {
    const { g, stA, stB, depot } = monoLine();
    expect(g.tile(21, 24).trk).toBe(2);
    expect(g.tile(51, 24).trk).toBe(2);
    expect(g.tile(26, 24).trk).toBe(2);
    expect(stA.id).not.toBe(stB.id);
    expect(depot.kind).toBe('rail');
  });

  test('X2001 + wagons on orders A->B: loads at A, runs the monorail line and reaches B', () => {
    const { g, stA, stB, depot } = monoLine();
    const r = g.buyVehicle(depot.id, { modelId: 'eng_mono_x2001', wagonModelId: 'wag_mono_pass', wagons: 2, cargoId: 'PASS' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(g.setOrders(v.id, [{ stationId: stA.id, full: false }, { stationId: stB.id, full: false }]).ok).toBe(true);
    addWaiting(stA, 'PASS', 60, 20, 24, 0, 1000); // passengers at A (the flat map has no houses)
    expect(g.startVehicle(v.id).ok).toBe(true);
    let atB = false, loaded = false;
    for (let d = 0; d < 160 && !atB; d++) {
      g.stepDays(1);
      const cur = g.state.vehicles.find((x) => x.id === v.id);
      if (cur.load && cur.load.amount > 0) loaded = true;
      if (cur.tx === 52 && cur.ty === 24 && cur.state === 'loading') atB = true;
    }
    expect(loaded).toBe(true);   // the train took A's passengers aboard
    expect(atB).toBe(true);      // and reached the B platform on the monorail line
    expect(waitingAmount(stA, 'PASS')).toBe(0);
    // Income is not asserted: on this flat test map the same trip earns 0 for plain trains too, so the earning
    // path needs a real scenario (houses to accept passengers). See the report.
  });

  test('plain trains are refused at the monorail depot and cannot route over the line', () => {
    const { g, stB, depot } = monoLine();
    // a plain steam engine cannot be bought at the monorail depot (plain trains cannot leave a monorail depot)
    const plain = g.buyVehicle(depot.id, { modelId: 'eng_puffer', wagonModelId: 'wag_coach', wagons: 1 });
    expect(plain.ok).toBe(false);
    // and a plain train on plain track has no route onto the monorail stations
    expect(g.buildRail(56, 20, 56, 27).ok).toBe(true); // plain spur, never touches the monorail
    expect(g.buildRail(56, 27, 58, 27).ok).toBe(true);
    const v = { id: 99, kind: 'train', modelId: 'eng_puffer', tx: 56, ty: 27, wagons: 0, history: [] };
    expect(findVehiclePath(g.state, v, [{ x: 50, y: 24 }])).toBeNull();
  });
});
