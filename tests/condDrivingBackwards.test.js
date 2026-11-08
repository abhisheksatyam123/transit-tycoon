/** Conditional order drivingBackwards (OpenTTD OCV_DRIVING_BACKWARDS). */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame, coalLine } from './helpers.js';
import { condOperand, resolveConditionals, normaliseCond, condText } from '../js/simulation/condOrders.js';

describe('conditional order drivingBackwards', () => {
  test('normaliseCond with variable drivingBackwards', () => {
    // Validates boolean == 1 or 0
    const r1 = normaliseCond({ v: 'drivingBackwards', cmp: '!=', val: 5, to: 0 });
    expect(r1.ok).toBe(true);
    expect(r1.entry.cond.v).toBe('drivingBackwards');
    expect(r1.entry.cond.cmp).toBe('==');
    expect(r1.entry.cond.val).toBe(1);

    const r0 = normaliseCond({ v: 'drivingBackwards', cmp: '<=', val: 0, to: 2 });
    expect(r0.ok).toBe(true);
    expect(r0.entry.cond.v).toBe('drivingBackwards');
    expect(r0.entry.cond.cmp).toBe('==');
    expect(r0.entry.cond.val).toBe(0);
  });

  test('condOperand returns 1 when v.kind === "train" && v.flipped === true, and 0 when flipped is false or v is bus/truck', () => {
    const g = flatGame(11);
    const L = coalLine(g);
    const rTrain = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(rTrain.ok).toBe(true);
    const train = rTrain.vehicle;
    expect(train.kind).toBe('train');

    train.flipped = false;
    expect(condOperand(g.state, train, 'drivingBackwards')).toBe(0);

    train.flipped = true;
    expect(condOperand(g.state, train, 'drivingBackwards')).toBe(1);

    // Bus / truck
    const bus = { id: 999, kind: 'road', flipped: true };
    expect(condOperand(g.state, bus, 'drivingBackwards')).toBe(0);

    const truck = { id: 998, kind: 'truck', flipped: true };
    expect(condOperand(g.state, truck, 'drivingBackwards')).toBe(0);
  });

  test('resolveConditionals jumps when driving backwards condition is met', () => {
    const g = flatGame(11);
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    const v = r.vehicle;

    expect(g.setOrders(v.id, [
      { stationId: L.a.id },
      { cond: { v: 'drivingBackwards', cmp: '==', val: 1, to: 3 } },
      { stationId: L.a.id },
      { stationId: L.b.id },
    ]).ok).toBe(true);

    // When not flipped (driving forward), condition (drivingBackwards == 1) is false -> fall through to order 2
    v.flipped = false;
    v.orderIndex = 1;
    resolveConditionals(g.state, v);
    expect(v.orderIndex).toBe(2);

    // When flipped (driving backwards), condition is true -> jumps to order 3
    v.flipped = true;
    v.orderIndex = 1;
    resolveConditionals(g.state, v);
    expect(v.orderIndex).toBe(3);
  });

  test('condText formats string for driving backwards', () => {
    expect(condText({ v: 'drivingBackwards', cmp: '==', val: 1, to: 0 })).toBe('Jump to order 1 if driving backwards is true');
    expect(condText({ v: 'drivingBackwards', cmp: '==', val: 0, to: 2 })).toBe('Jump to order 3 if driving backwards is false');
  });
});
