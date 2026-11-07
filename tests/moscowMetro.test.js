import '../js/simulation/scenarios/moscowData.js'; // registers the Moscow data (Node: no dynamic import)
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { MOSCOW } from '../js/config/maps/moscow.js';
import { decodeRLE } from '../js/config/maps/rle.js';

const real = MOSCOW && MOSCOW.width > 0 && (MOSCOW.roadClass || '').length > 0;

describe('Moscow metro (T29)', () => {
  let g = null;
  const world = () => (g ??= Game.create({ scenario: 'moscow', seed: 1, startYear: 1950 }));

  test.skipIf(!real)('tunnel tiles exist and all carry rail', () => {
    const { tiles } = world().state.map;
    const tun = tiles.filter((t) => t.tunnel);
    expect(tun.length).toBeGreaterThan(50);
    expect(tun.every((t) => t.rail > 0)).toBe(true);
    expect(tun.every((t) => Number.isInteger(t.metroColor))).toBe(true);
  }, 60000);

  test.skipIf(!real)('metro station buildings carry metro flag and colour', () => {
    const s = world().state;
    const metroTiles = s.map.tiles.filter((t) => t.building && t.building.type === 'station' && t.building.metro);
    expect(metroTiles.length).toBeGreaterThan(0);
    for (const t of metroTiles) expect(t.building.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  }, 60000);

  test.skipIf(!real)('metro trains carry metroLine and livery; state.metro lists built lines', () => {
    const s = world().state;
    expect(s.metro.lines.length).toBe(s.scenarioMeta.metro.length);
    expect(s.metro.lines.length).toBeGreaterThanOrEqual(5);
    const trains = s.vehicles.filter((v) => v.metroLine);
    expect(trains.length).toBeGreaterThan(0);
    for (const v of trains) expect(v.livery).toMatch(/^#[0-9a-fA-F]{6}$/);
    for (const l of s.metro.lines) expect(l.stationIds.length).toBeGreaterThan(0);
  }, 60000);

  test.skipIf(!real)('save/load round-trip keeps tunnel and metro fields', () => {
    const g1 = world();
    const g2 = Game.deserialize(g1.serialize());
    const s1 = g1.state, s2 = g2.state;
    const i = s1.map.tiles.findIndex((t) => t.tunnel);
    expect(s2.map.tiles[i].tunnel).toBe(1);
    expect(s2.map.tiles[i].metroColor).toBe(s1.map.tiles[i].metroColor);
    expect(s2.metro).toEqual(s1.metro);
    const st = s1.map.tiles.find((t) => t.building && t.building.metro);
    const st2 = s2.map.tiles[s1.map.tiles.indexOf(st)];
    expect(st2.building.metro).toBe(true);
    expect(st2.building.color).toBe(st.building.color);
    const v = s1.vehicles.find((q) => q.metroLine);
    expect(s2.vehicles.find((q) => q.id === v.id).livery).toBe(v.livery);
  }, 120000);
});

describe('Moscow metro follows baked geometry (T41)', () => {
  let g = null;
  const world = () => (g ??= Game.create({ scenario: 'moscow', seed: 1, startYear: 1950 }));

  test.skipIf(!real || !MOSCOW.metro)('>= 80% of tunnel tiles lie on or next to baked metro track', () => {
    const { map } = world().state;
    const W = map.width, H = map.height, bakedM = decodeRLE(MOSCOW.metro, W * H);
    const tun = map.tiles.map((t, i) => (t.tunnel ? i : -1)).filter((i) => i >= 0);
    expect(tun.length).toBeGreaterThan(0);
    let near = 0;
    for (const i of tun) {
      const x = i % W, y = (i - x) / W;
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < W && Y < H && bakedM[Y * W + X] !== '0') hit = true;
      }
      if (hit) near++;
    }
    expect(near / tun.length).toBeGreaterThanOrEqual(0.8);
  }, 60000);

  test.skipIf(!real || !MOSCOW.metro)('at least 14 of the baked metro lines are built', () => {
    const s = world().state;
    expect(s.metro.lines.length).toBeGreaterThanOrEqual(14);
  }, 60000);
});

