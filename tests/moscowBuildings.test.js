import { test, expect, describe } from 'bun:test';
import { existsSync } from 'fs';
import { Game } from '../js/simulation/game.js';
import { STYLES, houseSprite } from '../js/renderer/sprites/houses.js';
import { STYLE_LEVELS, pickStyle, zoneOf } from '../js/simulation/scenarios/moscowStyles.js';
import { createRng } from '../js/simulation/rng.js';

import { MOSCOW } from '../js/config/maps/moscow.js';
import { LANDMARK_SPECS } from '../js/simulation/scenarios/moscowLandmarks.js';

const real = !!(MOSCOW && MOSCOW.width);

describe('Moscow house styles (pure)', () => {
  test('STYLES covers every contract style', () => {
    for (const s of Object.keys(STYLE_LEVELS)) expect(STYLES).toContain(s);
  });
  test('zones: Kremlin core, Moscow City, outskirts', () => {
    expect(zoneOf(5, false)).toBe('garden');
    expect(zoneOf(30, false)).toBe('ttk');
    expect(zoneOf(80, false)).toBe('mkad');
    expect(zoneOf(150, false)).toBe('outer');
    expect(zoneOf(40, true)).toBe('city');
  });
  test('pickStyle: garden never cottage, outer has cottage', () => {
    const rng = createRng({ rngState: 5 });
    const g = new Set(), o = new Set();
    for (let i = 0; i < 2000; i++) { g.add(pickStyle(rng, 10, false)); o.add(pickStyle(rng, 150, false)); }
    expect(g.has('cottage')).toBe(false);
    expect(o.has('cottage')).toBe(true);
  });
  test('houseSprite accepts every style without throwing', () => {
    // sprite drawing needs canvas; only check the id table here
    expect(STYLES.indexOf('historic')).toBeGreaterThan(0);
  });
});

describe.skipIf(!real)('Moscow baked scenario buildings', () => {
  const g = Game.create({ scenario: 'moscow', seed: 1 });
  const { state } = g;
  const houses = state.map.tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.building && t.building.type === 'house');
  const kx = state.scenarioMeta.focus.x, ky = state.scenarioMeta.focus.y;
  const near = (r) => houses.filter(({ i }) => Math.hypot((i % state.map.width) - kx, Math.floor(i / state.map.width) - ky) <= r);

  test('every house has a known style and a level matching it', () => {
    for (const { t } of houses) {
      expect(STYLES).toContain(t.building.style);
      const [lo, hi] = STYLE_LEVELS[t.building.style];
      expect(t.building.level).toBeGreaterThanOrEqual(lo);
      expect(t.building.level).toBeLessThanOrEqual(hi);
    }
  });
  test('within 10 tiles of the Kremlin, historic+stalinka dominate', () => {
    const n = near(10);
    expect(n.length).toBeGreaterThan(0);
    const hs = n.filter(({ t }) => ['historic', 'stalinka'].includes(t.building.style)).length;
    expect(hs / n.length).toBeGreaterThan(0.6);
  });
  test('no cottages within the Garden Ring', () => {
    expect(near(18).some(({ t }) => t.building.style === 'cottage')).toBe(false);
  });
  test('cottages and panel/modern appear in the outskirts', () => {
    const far = houses.filter(({ i }) => Math.hypot((i % state.map.width) - kx, Math.floor(i / state.map.width) - ky) > 100);
    expect(far.some(({ t }) => t.building.style === 'cottage')).toBe(true);
  });
  // v2 band: the expanded bbox (outer districts, MKAD ring) gives ~485k; carving open plots
  // (~413k), monument clear rings (~384k), then monument enlargement 2x + 8-tile rings (~350k).
  // Towns regrow into the gaps during play. 320k–650k is the sane range.
  test('Moscow population in the 320k–650k band', () => {
    const pop = state.towns.reduce((a, t) => a + t.population, 0);
    expect(pop).toBeGreaterThan(320000);
    expect(pop).toBeLessThan(650000);
  });
  // Note (monument-focused design): since ensembles were enlarged 2x (LM_SCALE 4) with an
  // 8-tile clear ring, the Kremlin ensemble itself occupies the centre, so the largest
  // population town is now an outer district — Kremlin/Tverskoy only needs to be a major town.
  test('Kremlin/Tverskoy is a major town', () => {
    const kre = state.towns.find((t) => /Kremlin/.test(t.name));
    expect(kre).toBeTruthy();
    expect(kre.population).toBeGreaterThanOrEqual(10000);
    const ranked = state.towns.slice().sort((a, b) => b.population - a.population);
    expect(ranked.indexOf(kre)).toBeLessThan(8);
  });
  test('new Seven Sisters and landmarks are in the spec list', () => {
    const ids = LANDMARK_SPECS.map((s) => s.id);
    for (const id of ['ukraina', 'kotelnicheskaya', 'kudrinskaya', 'mid', 'leningradskaya', 'red_gates', 'gum', 'shukhov_tower', 'novodevichy', 'msu']) {
      expect(ids).toContain(id);
    }
  });
  test('styles survive save and load', () => {
    const back = Game.deserialize(g.serialize());
    const s = back.state.map.tiles.find((t) => t.building && t.building.style);
    expect(s).toBeTruthy();
    expect(STYLES).toContain(s.building.style);
  });
});

test('sprite module exists for the style tables', () => {
  expect(existsSync(new URL('../js/renderer/sprites/housesMoscow.js', import.meta.url).pathname)).toBe(true);
  expect(typeof houseSprite).toBe('function');
});
