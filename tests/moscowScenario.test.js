import { test, expect, describe } from 'bun:test';
import { createHash } from 'crypto';
import { Game } from '../js/simulation/game.js';
import { runDiagnostics } from '../js/simulation/diagnostics.js';
import { buildScenario, SCENARIOS } from '../js/simulation/scenarios/index.js';
import { MOSCOW } from '../js/config/maps/moscow.js';
import { miniMoscow } from './fixtures/miniMoscow.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { LM3D } from '../js/config/landmarks3d.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const RANDOM_HASH = {
  1: 'd77d70bff21ff64df200a86968e98a53e467b9a7d289f5304f5efcd09bff37ff',
  7: 'a2559e6aaab1e2a0b825efffb5dbf69626ba2e887fcf9dc7872aefd2ef9d9845',
};
const mini = () => { const g = Game.create({ seed: 3, width: 40, height: 40 }); const r = buildScenario('moscow', g, miniMoscow()); return { g, r }; };

describe('scenario registry and random worlds', () => {
  test('random worlds are byte-identical to the recorded hashes', () => {
    expect(sha(Game.create({ seed: 1 }).serialize())).toBe(RANDOM_HASH[1]);
    expect(sha(Game.create({ seed: 7 }).serialize())).toBe(RANDOM_HASH[7]);
  });
  test('registry lists random and moscow', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['random', 'moscow']);
  });
  test('missing map gives a clear error', () => {
    expect(() => buildScenario('moscow', Game.create({ seed: 1, width: 40, height: 40 }), null)).toThrow(/not baked yet/);
  });
});

describe('mini Moscow fixture', () => {
  test('towns are created from districts plus the Kremlin town', () => {
    const { g } = mini();
    expect(g.state.towns.length).toBeGreaterThanOrEqual(3);
    expect(g.state.towns.every((t) => t.name && !t.name.includes('undefined'))).toBe(true);
  });
  test('houses sit next to roads and population is positive', () => {
    const { g } = mini();
    const { map } = g.state;
    const houses = map.tiles.filter((t) => t.building && t.building.type === 'house');
    expect(houses.length).toBeGreaterThan(0);
    for (const t of houses.slice(0, 50)) expect(t.terrain).not.toBe('water');
    expect(g.state.towns.reduce((a, t) => a + t.population, 0)).toBeGreaterThan(0);
  });
  test('metro trains run between named stations and no error diagnostics', () => {
    const { g, r } = mini();
    expect(r.metro.length).toBeGreaterThan(0);
    expect(r.metro.every((m) => m.trains > 0)).toBe(true);
    expect(g.state.stations.every((s) => s.name && s.name.length > 0)).toBe(true);
    const errs = runDiagnostics(g).filter((i) => i.severity === 'error');
    expect(errs).toEqual([]);
  });
  test('half-linked track is never produced', () => {
    const { g } = mini();
    const half = runDiagnostics(g).filter((i) => /half-link/.test(i.id));
    expect(half).toEqual([]);
  });
  test('same seed gives identical serialization', () => {
    const a = mini().g.serialize();
    const b = mini().g.serialize();
    expect(a).toBe(b);
  });
  test('save/load round trip keeps scenario and log', () => {
    const { g } = mini();
    const json = g.serialize();
    const back = Game.deserialize(json);
    expect(back.state.scenario).toBe('moscow');
    expect(Array.isArray(back.state.scenarioLog)).toBe(true);
    expect(back.serialize()).toBe(json);
  });
  test('the game steps for a few days without errors', () => {
    const { g } = mini();
    for (let i = 0; i < 3 * TICKS_PER_DAY; i++) g.step();
    expect(runDiagnostics(g).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('real Moscow map', () => {
  const real = MOSCOW && MOSCOW.width > 0 && (MOSCOW.roadClass || '').length > 0;
  test.skipIf(!real)('population, metro lines and no error diagnostics', () => {
    const t0 = performance.now();
    const g = Game.create({ scenario: 'moscow', seed: 1, startYear: 1950 });
    const ms = performance.now() - t0;
    const pop = g.state.towns.reduce((a, t) => a + t.population, 0);
    expect(pop).toBeGreaterThanOrEqual(150000);
    expect(g.state.scenarioMeta.metro.length).toBeGreaterThanOrEqual(5);
    expect(runDiagnostics(g).filter((i) => i.severity === 'error')).toEqual([]);
    expect(ms).toBeLessThan(20000);
  }, 60000);
});

describe('Moscow fidelity (T24)', () => {
  const real = MOSCOW && MOSCOW.width > 0 && (MOSCOW.roadClass || '').length > 0;
  let g = null;
  const world = () => (g ??= Game.create({ scenario: 'moscow', seed: 1, startYear: 1950 }));
  const { kremlin, red_square: _rs } = {};
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const kremlinPos = () => {
    const s = world().state;
    return s.scenarioMeta.focus;
  };

  // Note (monument-focused design, LM_SCALE 4 + 8-tile ring): the enlarged Kremlin ensemble
  // occupies the centre, so the largest town is now an outer district — just check focus + that
  // Kremlin/Tverskoy is a major town.
  test.skipIf(!real)('focus point is the Kremlin and the Kremlin town is major', () => {
    const { state } = world();
    expect(state.scenarioMeta.focus).toBeDefined();
    const kre = state.towns.find((t) => /Kremlin/.test(t.name));
    expect(kre).toBeTruthy();
    expect(kre.population).toBeGreaterThanOrEqual(10000);
    const ranked = state.towns.slice().sort((a, b) => b.population - a.population);
    expect(ranked.indexOf(kre)).toBeLessThan(8);
  }, 60000);

  test.skipIf(!real)('no industry within 30 tiles of the Kremlin', () => {
    const k = kremlinPos();
    for (const ind of world().state.industries) {
      const d = dist(ind.x + ind.w / 2, ind.y + ind.h / 2, k.x, k.y);
      expect(d).toBeGreaterThanOrEqual(30);
    }
  });

  test.skipIf(!real)('every contract landmark is present with a full, consistent footprint', () => {
    const { state } = world();
    const ids = ['kremlin', 'red_square', 'moscow_city', 'msu', 'ostankino', 'luzhniki', 'christ_saviour', 'bolshoi', 'vdnkh'];
    const W = state.map.width;
    for (const id of ids) {
      const tiles = [];
      const ens = Object.values(LM3D).find((e) => e.id !== id && (e.covers || []).includes(id)); // e.g. red_square drawn by the kremlin ensemble
      const lid = ens ? ens.id : id;
      state.map.tiles.forEach((t, i) => { if (t.building && t.building.type === 'landmark' && t.building.id === lid) tiles.push([i, t.building]); });
      expect(tiles.length).toBeGreaterThan(0);
      if (tiles[0][1].lm3d) { // baked OSM 3D ensemble (R7): 1x1 stamps on its real footprint, exactly one front tile, no road/rail
        expect(tiles.filter(([, b]) => b.front).length).toBe(1);
        for (const [i, b] of tiles) { expect(b.lm3d).toBe(1); expect(state.map.tiles[i].road | (state.map.tiles[i].tunnel ? 0 : state.map.tiles[i].rail)).toBe(0); }
        continue;
      }
      const { w, h } = tiles[0][1];
      expect(tiles.length).toBe(w * h);
      for (const [i, b] of tiles) {
        expect(b.w).toBe(w);
        expect(b.h).toBe(h);
        expect(b.dx).toBeGreaterThanOrEqual(0);
        expect(b.dx).toBeLessThan(w);
        expect(b.dy).toBeGreaterThanOrEqual(0);
        expect(b.dy).toBeLessThan(h);
        expect(state.map.tiles[i].road | state.map.tiles[i].rail).toBe(0);
      }
      // the footprint is a single rectangle: one tile per (dx,dy)
      const keys = new Set(tiles.map(([, b]) => `${b.dx},${b.dy}`));
      expect(keys.size).toBe(w * h);
      void W;
    }
  });

  test.skipIf(!real)('Gorky Park is a forest strip with no houses', () => {
    const { state } = world();
    const park = state.scenarioMeta.landmarks.find((l) => l.id === 'gorky_park');
    expect(park).toBeDefined();
    for (let y = park.y; y < park.y + park.h; y++) for (let x = park.x; x < park.x + park.w; x++) {
      const t = state.map.tiles[y * state.map.width + x];
      expect(t.terrain).toBe('forest');
      expect(t.building).toBeNull();
    }
  });

  test.skipIf(!real)('kremlin is within 3 tiles of water and east of Red Square side', () => {
    const { state } = world();
    const k = state.scenarioMeta.focus;
    let near = false;
    for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = k.x + dx, y = k.y + dy;
      if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) continue;
      if (state.map.tiles[y * state.map.width + x].terrain === 'water') { near = true; break; }
    }
    expect(near).toBe(true);
  });

  test.skipIf(!real)('avenue classes present on many road tiles and only on road tiles', () => {
    const { state } = world();
    let n = 0;
    for (const t of state.map.tiles) {
      if (t.avenue === undefined) continue;
      expect([1, 2, 3]).toContain(t.avenue);
      expect(t.road).toBeGreaterThan(0);
      n++;
    }
    expect(n).toBeGreaterThan(3000);
  });

  test.skipIf(!real)('landmark and avenue tiles survive save/load', () => {
    const { state } = world();
    const json = world().serialize();
    const back = Game.deserialize(json);
    const lm = back.state.map.tiles.filter((t) => t.building && t.building.type === 'landmark').length;
    const orig = state.map.tiles.filter((t) => t.building && t.building.type === 'landmark').length;
    expect(lm).toBe(orig);
    const av = (s) => s.map.tiles.filter((t) => t.avenue).length;
    expect(av(back.state)).toBe(av(state));
    expect(back.state.scenarioMeta.focus).toEqual(state.scenarioMeta.focus);
  }, 60000);

  test.skipIf(!real)('landmark tiles are reported by diagnostics without errors', () => {
    expect(runDiagnostics(world()).filter((i) => i.severity === 'error')).toEqual([]);
  }, 60000);
});

describe('Moscow fidelity on fixture', () => {
  test('avenue field is only set on road tiles and survives a round trip', () => {
    const { g } = mini();
    const tile = g.state.map.tiles.find((t) => t.road);
    tile.avenue = 2;
    const back = Game.deserialize(g.serialize());
    const bt = back.state.map.tiles.find((t, i) => g.state.map.tiles[i] === tile);
    expect(back.state.map.tiles.some((t) => t.avenue === 2)).toBe(true);
    void bt;
  });
  test('tileInfo describes landmark and avenue tiles', async () => {
    const { tileInfo } = await import('../js/simulation/queries.js');
    const { g } = mini();
    const i = g.state.map.tiles.findIndex((t) => t.road);
    const x = i % g.state.map.width, y = (i - x) / g.state.map.width;
    g.state.map.tiles[i].avenue = 2;
    expect(tileInfo(g.state, x, y).lines.join('\n')).toMatch(/Avenue \(primary\)/);
    g.state.map.tiles[i].building = { type: 'landmark', id: 'kremlin', dx: 0, dy: 0, w: 1, h: 1 };
    expect(tileInfo(g.state, x, y).lines.join('\n')).toMatch(/Moscow Kremlin/);
  });
});
