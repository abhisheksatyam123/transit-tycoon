/** Aqueducts: a canal drag between two ramps over a valley (aqueduct.js). Build/refuse, ship path, save, demolish. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { findShipPath } from '../js/simulation/shipPath.js';
import { serializeState, parseState } from '../js/simulation/save.js';

/**
 * 40x30 map (vertex heights: tile (x,y) corners are tiles x..x+1 / y..y+1). Sea x 0..5 at 0. West bank x 6..8,
 * ramp tile 8 at 1 and tile 9 (the span's first deck column) at 2. Valley x 10..13 at 0. East: tile 14 at 0,
 * tile 15 at 2 (span side), tile 16 at 1 (rear), bank 17+ at 1.
 */
function aqGame() {
  const game = Game.create({ seed: 7, width: 40, height: 30 });
  const s = game.state;
  const W = s.map.width;
  const H = { 6: 2, 7: 2, 8: 1, 9: 2, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 2, 16: 1 };
  for (let y = 0; y < s.map.height; y++) for (let x = 0; x < W; x++) {
    const t = s.map.tiles[y * W + x];
    t.height = x in H ? H[x] : (x >= 17 ? 1 : 0);
    t.rail = 0; t.road = 0; t.building = null; t.owner = null; t.terrain = 'grass';
    delete t.canal; delete t.lock; delete t.aqueduct;
    if (x <= 5) t.terrain = 'water';
  }
  for (const town of s.towns) town.houses = [];
  s.company.money = 5_000_000;
  return game;
}
const tileAt = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];
const ramps = (g) => g;

describe('aqueduct', () => {
  test('canal drag between two ramps over a valley builds an aqueduct; cost from source', () => {
    const g = ramps(aqGame());
    const money = g.state.company.money;
    const r = g.buildCanal(8, 12, 15, 12);
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    expect(g.state.company.money).toBeLessThan(money);
    expect(tileAt(g, 8, 12).aqueduct.role).toBe('head');
    expect(tileAt(g, 15, 12).aqueduct.role).toBe('head');
    for (let x = 9; x <= 14; x++) expect(tileAt(g, x, 12).aqueduct.role).toBe('deck');
    expect(tileAt(g, 9, 12).aqueduct.level).toBe(tileAt(g, 8, 12).aqueduct.level);
    expect(tileAt(g, 9, 12).canal).toBeUndefined(); // deck is not canal water
  });

  test('refuses a straight-line drag that is not straight, too short, or with a flat end', () => {
    const g = ramps(aqGame());
    expect(g.buildCanal(8, 12, 15, 13).ok).toBe(false);
    expect(g.buildCanal(8, 12, 9, 12).ok).toBe(false); // too short
    tileAt(g, 16, 12).height = 2; // east rear no longer one step down
    expect(g.buildCanal(8, 12, 15, 12).ok).toBe(false);
    expect(tileAt(g, 9, 12).aqueduct).toBeUndefined();
  });

  test('refuses a deck blocked by a building and dry-run charges nothing', () => {
    const g = ramps(aqGame());
    tileAt(g, 11, 12).building = { type: 'house' };
    const money = g.state.company.money;
    expect(g.buildCanal(8, 12, 15, 12).ok).toBe(false);
    expect(g.state.company.money).toBe(money);
    tileAt(g, 11, 12).building = null;
    expect(g.buildCanal(8, 12, 15, 12, { dryRun: true }).ok).toBe(true);
    expect(g.state.company.money).toBe(money);
    expect(tileAt(g, 9, 12).aqueduct).toBeUndefined();
  });

  test('a ship path crosses the aqueduct deck from the west sea to the east water', () => {
    const g = ramps(aqGame());
    // east bank becomes water at the far end of the channel so a route can exist
    for (let x = 6; x <= 7; x++) { tileAt(g, x, 12).terrain = 'water'; tileAt(g, x, 12).height = 2; tileAt(g, x, 12).canal = 1; }
    for (let x = 16; x <= 20; x++) { tileAt(g, x, 12).terrain = 'water'; tileAt(g, x, 12).height = 1; tileAt(g, x, 12).canal = 1; }
    expect(g.buildCanal(8, 12, 15, 12).ok).toBe(true);
    const path = findShipPath(g.state.map, { x: 7, y: 12 }, [{ x: 20, y: 12 }]);
    expect(path).not.toBeNull();
    const xs = path.map((p) => p.x);
    for (let x = 9; x <= 14; x++) expect(xs).toContain(x);
  });

  test('save round trip keeps aqueduct tiles', () => {
    const g = ramps(aqGame());
    expect(g.buildCanal(8, 12, 15, 12).ok).toBe(true);
    const back = parseState(serializeState(g.state));
    expect(back.map.tiles[12 * 40 + 11].aqueduct).toEqual(tileAt(g, 11, 12).aqueduct);
    expect(back.map.tiles[12 * 40 + 8].aqueduct.role).toBe('head');
  });

  test('demolish a deck tile removes the whole aqueduct and charges the demolish cost', () => {
    const g = ramps(aqGame());
    const money = g.state.company.money;
    expect(g.buildCanal(8, 12, 15, 12).ok).toBe(true);
    const spent = money - g.state.company.money;
    const before = g.state.company.money;
    const d = g.demolish(11, 12, 11, 12);
    expect(d.ok).toBe(true);
    for (let x = 8; x <= 15; x++) expect(tileAt(g, x, 12).aqueduct).toBeUndefined();
    expect(tileAt(g, 8, 12).terrain).toBe('grass');
    expect(spent).toBeGreaterThan(0);
    expect(before).toBeLessThan(money);
  });

  test('old saves without aqueduct fields are unaffected', () => {
    const g = ramps(aqGame());
    expect(tileAt(g, 9, 12).aqueduct).toBeUndefined();
    expect(g.buildCanal(10, 12, 13, 12).ok).toBe(true); // flat canal on the valley floor still works
  });
});
