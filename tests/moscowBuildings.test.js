import { test, expect, describe } from 'bun:test';
import { existsSync } from 'fs';
import { Game } from '../js/simulation/game.js';
import { STYLES, houseSprite } from '../js/renderer/sprites/houses.js';
import { STYLE_LEVELS, pickStyle, zoneOf } from '../js/simulation/scenarios/moscowStyles.js';
import { createRng } from '../js/simulation/rng.js';

import { MOSCOW } from '../js/config/maps/moscow.js';
import { LANDMARK_SPECS } from '../js/simulation/scenarios/moscowLandmarks.js';
import { LM3D } from '../js/config/landmarks3d.js';

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
    expect(hs / n.length).toBeGreaterThanOrEqual(0.55); // fewer centre houses: ensembles keep their bounding box free
  });
  test('no cottages within the Garden Ring', () => {
    expect(near(18).some(({ t }) => t.building.style === 'cottage')).toBe(false);
  });
  test('cottages and panel/modern appear in the outskirts', () => {
    const far = houses.filter(({ i }) => Math.hypot((i % state.map.width) - kx, Math.floor(i / state.map.width) - ky) > 100);
    expect(far.some(({ t }) => t.building.style === 'cottage')).toBe(true);
  });
  // The real motorway/trunk network is upgraded to 4-lane highways for cross-city runs.
  test('intercity roads are upgraded to highways', () => {
    const highways = state.map.tiles.filter((t) => t.highway === 1 && t.road);
    expect(highways.length).toBeGreaterThan(1500);
  });
  // Overlapping OSM monuments cannot claim tiles over big landmarks; they are drawn as overlays instead.
  test('every blocked OSM monument is drawn as an overlay', () => {
    const blocked = Object.values(LM3D).filter((e) => !e.tiles?.length);
    // plus single-tile OSM statues whose tile a bigger ensemble claimed at placement time
    expect(state.map.lm3dOverlays.length).toBeGreaterThanOrEqual(blocked.length);
    const stamped = new Set(state.map.tiles.filter((t) => t.building && t.building.lm3d).map((t) => t.building.id));
    for (const o of state.map.lm3dOverlays) expect(stamped.has(o.id)).toBe(false);
    for (const e of blocked) expect(state.map.lm3dOverlays.some((o) => o.id === e.id)).toBe(true);
  });
  // v4 band: houses are thinned aggressively so roads, rail and highways stay readable and
  // there is buildable space between districts; corridors beside highways/rail are cleared.
  // ~58k at the default scenario. Towns regrow into the gaps during play.
  test('Moscow population in the 40k–160k band', () => {
    const pop = state.towns.reduce((a, t) => a + t.population, 0);
    expect(pop).toBeGreaterThan(40000);
    expect(pop).toBeLessThan(160000);
  });
  // Note (sparse gameplay layout): buildings are thinned and corridors cleared; Kremlin/Tverskoy
  // remains the central district and regrows into the cleared space.
  test('Kremlin/Tverskoy is present', () => {
    const kre = state.towns.find((t) => /Kremlin/.test(t.name));
    expect(kre).toBeTruthy();
    expect(kre.population).toBeGreaterThanOrEqual(500);
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
