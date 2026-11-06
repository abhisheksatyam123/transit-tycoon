/** Pre-signals (S3, pathSignals.js header): entry/exit/combo gate, combo chaining, save round-trip, block unchanged. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { typedGate } from '../js/simulation/pathSignals.js';

const E = 2, Y = 24;

/** Straight east-running train record on row Y; `pos` is its tile x (path index 0 at x=20). */
function trainOn(g, id) {
  const path = [];
  for (let x = 20; x <= 50; x++) path.push({ x, y: Y });
  const v = { id, kind: 'train', path, pathIndex: 9, state: 'running', tx: 29, ty: Y, history: [{ x: 29, y: Y }], progress: 0 };
  return v;
}

/** Put a parked train body on tile x (another vehicle that occupies the block). */
function parked(g, id, x) {
  const v = { id, kind: 'train', path: [{ x, y: Y }], pathIndex: 0, state: 'running', tx: x, ty: Y, history: [{ x, y: Y }], progress: 0 };
  g.state.vehicles.push(v);
  return v;
}

/** Gate for a train entering tile x=30 from x=29 (movement.js nextBlocker shape). */
function enter(g, v) {
  const a = { x: 29, y: Y }, b = { x: 30, y: Y };
  return typedGate({ state: g.state }, v, a, b);
}

function lineWith(sig) {
  const g = flatGame(19);
  expect(g.buildRail(20, Y, 50, Y).ok).toBe(true);
  for (const [x, type] of sig) expect(g.buildSignal(x, Y, { type, dir: E }).ok).toBe(true);
  return g;
}

describe('entry and exit pre-signals', () => {
  test('entry holds the train while the exit block beyond is occupied, lets it in when free', () => {
    // entry 30 -> block 31..33 -> exit 34 -> block 35..50 (the "platforms" beyond the throat)
    const g = lineWith([[30, 'entry'], [34, 'exit']]);
    const v = trainOn(g, 1);
    expect(enter(g, v)).toBeNull(); // empty beyond: green
    const p = parked(g, 9, 40); // platform occupied
    expect(enter(g, v)).not.toBeNull(); // red: exit beyond is full
    expect(enter(g, v).state).toBe('signal');
    g.state.vehicles.splice(g.state.vehicles.indexOf(p), 1);
    expect(enter(g, v)).toBeNull(); // platform free again: green
  });

  test('exit signal alone is a block-style gate: holds when its beyond block is occupied', () => {
    const g = lineWith([[30, 'exit']]);
    const v = trainOn(g, 2);
    expect(enter(g, v)).toBeNull();
    parked(g, 8, 40);
    expect(enter(g, v)).not.toBeNull();
  });

  test('entry with no wall ahead (line end) is green when the block is free', () => {
    const g = lineWith([[30, 'entry']]);
    const v = trainOn(g, 3);
    expect(enter(g, v)).toBeNull();
  });
});

describe('combo chaining', () => {
  test('combo at 30 needs combo at 34 green, which needs exit at 40 green', () => {
    const g = lineWith([[30, 'combo'], [34, 'combo'], [40, 'exit']]);
    const v = trainOn(g, 4);
    expect(enter(g, v)).toBeNull();
    const p = parked(g, 9, 45); // beyond the exit at 40
    expect(enter(g, v)).not.toBeNull();
    g.state.vehicles.splice(g.state.vehicles.indexOf(p), 1);
    expect(enter(g, v)).toBeNull();
  });

  test('an entry signal is never a wall for a combo chain', () => {
    const g = lineWith([[30, 'combo'], [34, 'entry']]);
    const v = trainOn(g, 5);
    expect(enter(g, v)).not.toBeNull(); // the wall at 34 is entry: it does not lead out
  });
});

describe('save round-trip and block signals', () => {
  test('pre-signal kinds survive serialize and deserialize', () => {
    const g = lineWith([[30, 'entry'], [34, 'exit'], [38, 'combo']]);
    const g2 = Game.deserialize(g.serialize());
    const W = g2.state.map.width;
    expect(g2.state.map.tiles[Y * W + 30].signal).toEqual({ type: 'entry', dir: E });
    expect(g2.state.map.tiles[Y * W + 34].signal).toEqual({ type: 'exit', dir: E });
    expect(g2.state.map.tiles[Y * W + 38].signal).toEqual({ type: 'combo', dir: E });
  });

  test('a plain block signal is unaffected by the pre-signal code', () => {
    const g = lineWith([]);
    expect(g.buildSignal(30, Y).ok).toBe(true);
    const v = trainOn(g, 6);
    expect(enter(g, v)).toBeNull(); // block signal is not a typed gate
  });
});
