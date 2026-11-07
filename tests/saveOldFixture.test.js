import '../js/simulation/scenarios/moscowData.js'; // registers the Moscow data (Node: no dynamic import)
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState } from '../js/simulation/save.js';

/** Fixture written by the base commit db3c782 (pre packed-traffic save), Moscow after 3 days, seed 7. */
const FIXTURE = fileURLToPath(new URL('./fixtures/save-db3c782-moscow.json.gz', import.meta.url));

describe('old save compatibility (db3c782 fixture)', () => {
  const txt = gunzipSync(readFileSync(FIXTURE)).toString('utf8');

  test('loads a save written by the base commit', () => {
    const st = parseState(txt);
    expect(st.tick).toBe(289);
    expect(st.scenario).toBe('moscow');
    expect(st.map.tiles.length).toBe(st.map.width * st.map.height);
    expect(st.traffic.cars.length).toBe(700);
    expect(st.traffic.load.length).toBe(st.map.width * st.map.height);
  });

  test('re-serialising the old save is lossless', () => {
    const a = parseState(txt);
    const b = parseState(serializeState(a));
    expect(b.tick).toBe(a.tick);
    expect(b.traffic.cars).toEqual(a.traffic.cars);
    expect(b.traffic.load).toEqual(a.traffic.load);
    expect(b.traffic.jam).toEqual(a.traffic.jam);
    expect(b.traffic.acc.samples).toEqual(a.traffic.acc.samples);
    expect(b.map.tiles).toEqual(a.map.tiles);
  });

  test('a game restored from the old save keeps running', () => {
    const g = new Game(parseState(txt));
    g.stepDays(1);
    expect(g.state.tick).toBeGreaterThan(289);
  });
});
