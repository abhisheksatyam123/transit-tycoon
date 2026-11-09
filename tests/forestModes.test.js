import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { PLANT_MODES, FOREST_GROUP, forestCandidates } from '../js/simulation/cmdTerraform.js';
import { plantOptions, setPlantOptions } from '../js/ui/tools/plantOptions.js';

const R = (x0, y0, x1=x0, y1=y0) => ({ x0, y0, x1, y1 });

describe('forest modes audit', () => {
  test('PLANT_MODES is normal/forestSmall/forestLarge with OTTD params', () => {
    expect(PLANT_MODES).toEqual(['normal','forestSmall','forestLarge']);
    expect(FOREST_GROUP.forestSmall).toEqual({radius:5,count:5});
    expect(FOREST_GROUP.forestLarge).toEqual({radius:12,count:12});
  });
  test('forestSmall places at most count trees, clustered within radius', () => {
    const g = flatGame();
    const map = g.state.map;
    const c = forestCandidates(map, 30, 30, 'forestSmall');
    expect(c.length).toBeLessThanOrEqual(FOREST_GROUP.forestSmall.count);
    for (const {x,y} of c) {
      expect(Math.abs(x-30)).toBeLessThanOrEqual(5);
      expect(Math.abs(y-30)).toBeLessThanOrEqual(5);
    }
  });
  test('forestLarge larger reach and count than small', () => {
    const g = flatGame();
    const c = forestCandidates(g.state.map, 50, 50, 'forestLarge');
    expect(c.length).toBeLessThanOrEqual(12);
    for (const {x,y} of c) {
      expect(Math.abs(x-50)).toBeLessThanOrEqual(12);
      expect(Math.abs(y-50)).toBeLessThanOrEqual(12);
    }
  });
  test('deterministic candidates: same call same result (estimate==commit)', () => {
    const g = flatGame();
    const a = JSON.stringify(forestCandidates(g.state.map, 40, 40, 'forestSmall'));
    const b = JSON.stringify(forestCandidates(g.state.map, 40, 40, 'forestSmall'));
    expect(a).toBe(b);
  });
  test('invalid mode rejected, normal drag plants full area', () => {
    const g = flatGame();
    expect(g.terraform('plant', R(10,10), {mode:'bogus'}).ok).toBe(false);
    const r = g.terraform('plant', R(10,20,12,22), {mode:'normal'});
    expect(r.ok).toBe(true);
    expect(r.tiles).toBeGreaterThanOrEqual(9);
  });
  test('plantOptions defaults normal and accepts valid modes', () => {
    const app = {};
    expect(plantOptions(app).mode).toBe('normal');
    setPlantOptions(app, {mode:'forestLarge'});
    expect(plantOptions(app).mode).toBe('forestLarge');
  });
  test('forest plant saves/loads: tiles stay forest after serialize round-trip', async () => {
    const g = flatGame();
    const r = g.terraform('plant', R(30,30), {mode:'forestSmall', tree:2});
    expect(r.ok).toBe(true);
    const json = JSON.stringify(g.state.map.tiles);
    const revived = JSON.parse(json);
    const n = revived.filter(t=>t.terrain==='forest').length;
    expect(n).toBeGreaterThan(0);
    const t = revived.find(t=>t.tree===2);
    expect(t).toBeDefined();
  });
});
