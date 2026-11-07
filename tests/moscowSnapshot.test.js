import '../js/simulation/scenarios/moscowData.js'; // registers the Moscow data (Node: no dynamic import)
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { Game } from '../js/simulation/game.js';
import { SNAPSHOT_PATH, SNAPSHOT_REQUEST, isSnapshotRequest } from '../js/ui/scenarioSnapshot.js';

const root = join(import.meta.dir, '..');
const snapshot = readFileSync(join(root, SNAPSHOT_PATH), 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');

describe('Moscow day-0 snapshot', () => {
  test('snapshot equals a fresh Moscow build (seed 1)', () => {
    const fresh = Game.create({ ...SNAPSHOT_REQUEST }).serialize();
    if (fresh !== snapshot) {
      throw new Error(`stale snapshot: run bun run snapshot:moscow (snapshot ${sha(snapshot).slice(0, 12)} vs fresh ${sha(fresh).slice(0, 12)})`);
    }
    expect(fresh === snapshot).toBe(true);
  }, 60000);

  test('deserialized snapshot advances identically to a fresh build', () => {
    const a = Game.deserialize(snapshot);
    const b = Game.create({ ...SNAPSHOT_REQUEST });
    expect(a.serialize()).toBe(b.serialize());
    a.stepDays(3);
    b.stepDays(3);
    expect(sha(a.serialize())).toBe(sha(b.serialize()));
  }, 120000);

  test('only the exact default Moscow request uses the snapshot', () => {
    expect(isSnapshotRequest({ scenario: 'moscow', seed: 1 })).toBe(true);
    expect(isSnapshotRequest({ scenario: 'moscow', seed: 1, width: 96, height: 96, startYear: 1950 })).toBe(true);
    expect(isSnapshotRequest({ scenario: 'moscow', seed: 2 })).toBe(false);
    expect(isSnapshotRequest({ scenario: 'random', seed: 1 })).toBe(false);
    expect(isSnapshotRequest({ scenario: 'moscow', seed: 1, townCount: 5 })).toBe(false);
    expect(isSnapshotRequest({ scenario: 'moscow', seed: 1, settings: { inflation: false } })).toBe(false);
    expect(isSnapshotRequest({ scenario: 'moscow', seed: 1, objective: { type: 'none' } })).toBe(false);
  });
});
