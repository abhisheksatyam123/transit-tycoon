/** Scenario editor town / industry edits: expand, delete, demolish industry (editor-only, OpenLoco/OpenTTD). */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { createTown } from '../js/simulation/towns.js';
import { expandTown, deleteTown, demolishIndustry } from '../js/simulation/cmdTownEdit.js';
import { manyRandomIndustries } from '../js/simulation/editorGen.js';

const editor = (extra = {}) => Game.create({ editor: true, seed: 11, width: 96, height: 96, startYear: 1960, emptyFlat: true, ...extra });
const normal = () => Game.create({ seed: 11, width: 96, height: 96, startYear: 1960, emptyFlat: true });
const houseCount = (s, town) => s.map.tiles.filter((t) => t.building && t.building.type === 'house' && t.building.townId === town.id).length;

describe('scenario editor town edits', () => {
  test('expand town grows the town in the editor (houses and/or roads)', () => {
    const g = editor();
    const town = createTown(g.state, g.rng, 40, 40, undefined, 1);
    const roads = () => g.state.map.tiles.filter((t) => t.road).length;
    const before = town.houses.length, rb = roads();
    const r = expandTown(g, town.id);
    expect(r.ok).toBe(true);
    expect(r.grew).toBe(true);
    expect(town.houses.length - before).toBe(r.houses);
    // a dense town grows mostly roads (the growth step extends streets), a sparse one adds houses too
    expect(r.houses > 0 || roads() > rb).toBe(true);
    expect(town.population).toBeGreaterThan(0);
    expect(houseCount(g.state, town)).toBe(town.houses.length);
  });

  test('expand and delete are refused outside the editor', () => {
    const g = normal();
    const town = createTown(g.state, g.rng, 40, 40, undefined, 2);
    const hs = town.houses.length;
    expect(expandTown(g, town.id).ok).toBe(false);
    expect(town.houses.length).toBe(hs);
    expect(deleteTown(g, town.id).ok).toBe(false);
    expect(g.state.towns).toContain(town);
    expect(g.expandTown(town.id).ok).toBe(false);
  });

  test('delete town removes its houses and the town record', () => {
    const g = editor();
    const town = createTown(g.state, g.rng, 40, 40, undefined, 2);
    const other = createTown(g.state, g.rng, 10, 10, undefined, 1);
    const n = houseCount(g.state, town);
    expect(n).toBeGreaterThan(0);
    const W = g.state.map.width;
    const otherRoads = () => g.state.map.tiles.filter((t, i) => t.road && t.owner === 'town' && Math.abs(i % W - 10) + Math.abs(Math.floor(i / W) - 10) < 8).length;
    const or0 = otherRoads();
    expect(or0).toBeGreaterThan(0);
    const r = deleteTown(g, town.id);
    expect(otherRoads()).toBe(or0); // the other town keeps its roads
    expect(r.ok).toBe(true);
    expect(r.houses).toBe(n);
    expect(houseCount(g.state, town)).toBe(0);
    expect(g.state.towns.find((t) => t.id === town.id)).toBeUndefined();
    expect(g.state.towns.find((t) => t.id === other.id)).toBeDefined();
    expect(deleteTown(g, town.id).ok).toBe(false); // gone
  });

  test('delete town is refused when a station references it', () => {
    const g = editor();
    const town = createTown(g.state, g.rng, 40, 40, undefined, 2);
    const st = { id: 99, x: 41, y: 41, townId: town.id, name: 'S', tiles: [] };
    g.state.stations.push(st);
    const hs = houseCount(g.state, town);
    const r = deleteTown(g, town.id);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Stations/);
    expect(g.state.towns).toContain(town);
    expect(houseCount(g.state, town)).toBe(hs);
  });

  test('industry demolish works in the editor and is refused outside it', () => {
    const g = editor();
    expect(manyRandomIndustries(g).ok).toBe(true);
    const ind = g.state.industries[0];
    expect(ind).toBeDefined();
    expect(demolishIndustry(g, ind.id).ok).toBe(true);
    expect(g.state.industries.find((i) => i.id === ind.id)).toBeUndefined();
    expect(demolishIndustry(normal(), 1).ok).toBe(false);
  });
});
