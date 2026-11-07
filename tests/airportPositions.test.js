/** OpenTTD airport positions (airportPositions.js) and the drawn OTTD holding ring of holding planes (airportHold.js). */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { AIRPORT_TYPES } from '../js/simulation/airportTypes.js';
import { OTTD_AIRPORT_NODES } from '../js/simulation/airportPositions.js';
import { holdRing, holdDrawPos } from '../js/simulation/airportHold.js';
import { getVehicleSegments } from '../js/simulation/vehicles.js';
import { startServiceTrip } from '../js/simulation/movement.js';

function findSpot(game, type, avoid = null) {
  const t = AIRPORT_TYPES[type];
  for (let y = 4; y < game.state.map.height - t.h; y++) for (let x = 4; x < game.state.map.width - t.w; x++) {
    if (avoid && Math.abs(avoid.x - x) + Math.abs(avoid.y - y) < 30) continue; // far apart: planes shuttle, slots turn over
    if (game.buildAirport(x, y, { type, dryRun: true }).ok) return { x, y };
  }
  return null;
}
function rich(seed = 5) {
  const game = Game.create({ seed, width: 96, height: 96 });
  game.state.company.money = 20_000_000;
  game.state.date.year = 1995;
  return game;
}

describe('OTTD airport node tables', () => {
  test('every plane type we map has a touchdown node and four holding nodes', () => {
    for (const t of ['small', 'commuter', 'city', 'metropolitan', 'international']) {
      const d = OTTD_AIRPORT_NODES[t];
      expect(d.hold.length).toBe(4);
      expect(d.nodes[d.landing].flags).toContain('Land');
      for (const i of d.hold) expect(d.nodes[i].name).toMatch(/Fly around waiting/);
    }
  });

  test('city touchdown node 14 is OTTD (89,87)/16 = 5.56 x 5.44 tiles from the origin', () => {
    const d = OTTD_AIRPORT_NODES.city;
    expect(d.landing).toBe(14);
    expect(d.nodes[14].x).toBe(89);
    expect(d.nodes[14].y).toBe(87);
  });

  test('small node positions match OTTD: terminal 1 (32,23), taxi-out start (61,40)', () => {
    const n = OTTD_AIRPORT_NODES.small.nodes;
    expect([n[2].x, n[2].y]).toEqual([32, 23]);
    expect([n[7].x, n[7].y]).toEqual([61, 40]);
  });
});

describe('OTTD holding ring', () => {
  test('ring is 4 points relative to the touchdown, in tiles, sorted into a loop', () => {
    for (const t of ['small', 'city', 'international']) {
      const r = holdRing(t);
      expect(r.length).toBe(4);
      const cx = r.reduce((s, p) => s + p.x, 0) / 4, cy = r.reduce((s, p) => s + p.y, 0) / 4;
      const ang = r.map((p) => Math.atan2(p.y - cy, p.x - cx));
      for (let i = 1; i < 4; i++) expect(ang[i]).toBeGreaterThan(ang[i - 1]);
    }
  });

  test('holdDrawPos interpolates between ring nodes; f=0 is the start node, f=1 the end node', () => {
    const a = holdDrawPos('city', 10, 10, 0, 1, 0), b = holdDrawPos('city', 10, 10, 0, 1, 1);
    const mid = holdDrawPos('city', 10, 10, 0, 1, 0.5);
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2, 9);
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 9);
  });

  test('unknown type has no ring', () => {
    expect(holdRing('heliport')).toBeNull();
    expect(holdDrawPos('heliport', 0, 0, 0, 1, 0.5)).toBeNull();
  });
});

describe('holding plane drawn on the OTTD ring', () => {
  test('a plane held at a busy runway is drawn on the OTTD ring (display only)', () => {
    const game = rich();
    const s = game.state;
    const A = findSpot(game, 'small');
    const built = game.buildAirport(A.x, A.y, { type: 'small' });
    expect(built.ok).toBe(true);
    const B = findSpot(game, 'small', A);
    const bb = game.buildAirport(B.x, B.y, { type: 'small' });
    expect(bb.ok).toBe(true);
    const planes = [];
    for (let i = 0; i < 3; i++) {
      const r = game.buyVehicle(built.depotId, { modelId: 'ac_tu134' });
      expect(r.ok).toBe(true);
      planes.push(r.vehicle);
    }
    for (const v of planes) {
      expect(game.setOrders(v.id, [{ stationId: built.stationId }, { stationId: bb.stationId }]).ok).toBe(true);
      expect(game.startVehicle(v.id).ok).toBe(true);
    }
    let held = null;
    for (let t = 0; t < 6000 && !held; t++) {
      game.step();
      held = planes.find((v) => v.hold && v.hold.t === 'small') || null;
    }
    expect(held).not.toBeNull();
    const segs = getVehicleSegments(held);
    expect(segs.length).toBeGreaterThan(0);
    // the drawn head sits on the OTTD ring around the runway centre of the anchor (within the ring extent)
    const ring = holdRing('small');
    const ax = held.hold.x, ay = held.hold.y;
    const xs = ring.map((p) => ax + p.x), ys = ring.map((p) => ay + p.y);
    expect(segs[0].x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6);
    expect(segs[0].x).toBeLessThanOrEqual(Math.max(...xs) + 1e-6);
    expect(segs[0].y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6);
    expect(segs[0].y).toBeLessThanOrEqual(Math.max(...ys) + 1e-6);
    expect(s.tick).toBeGreaterThan(0);
  });
});
