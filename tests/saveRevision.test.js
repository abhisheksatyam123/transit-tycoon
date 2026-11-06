import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState, SAVE_REVISION, MIGRATIONS } from '../js/simulation/save.js';

describe('save revision (gap #38)', () => {
  const g = Game.create({ seed: 5, width: 48, height: 48 });

  test('one migration step per revision', () => {
    expect(MIGRATIONS.length).toBe(SAVE_REVISION);
  });

  test('revision 0 is not written (saves unchanged) and loads', () => {
    const json = serializeState(g.state);
    if (SAVE_REVISION === 0) expect(JSON.parse(json).revision).toBeUndefined();
    const st = parseState(json);
    expect(st.map.width).toBe(48);
  });

  test('a save from a newer build is refused with a clear message', () => {
    const o = JSON.parse(serializeState(g.state));
    o.revision = SAVE_REVISION + 1;
    expect(() => parseState(JSON.stringify(o))).toThrow(/newer version/);
  });

  test('invalid revision is refused', () => {
    const o = JSON.parse(serializeState(g.state));
    o.revision = -1;
    expect(() => parseState(JSON.stringify(o))).toThrow(/Invalid save revision/);
  });
});
