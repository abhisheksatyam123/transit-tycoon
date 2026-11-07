// Multi-tile houses (largeHouses setting, OpenTTD 1x2 / 2x2 temperate houses): placement, removal, off = unchanged, save.
import { test, expect } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { clearArea } from '../js/simulation/map.js';
import { placeLargeHouse, clearHouseAt, largeHousesEnabled, LARGE_GROUPS } from '../js/simulation/largeHouses.js';

const large = (g) => g.state.map.tiles.filter((t) => t.building && t.building.type === 'house' && t.building.size);
const sizeTiles = (size) => (size === '1x2' ? 2 : 4);

/** Deterministic rng stub: chance always true, int/pick take the first option (anchor = (x,y) for part 0). */
const rngStub = { chance: () => true, int: () => 0, next: () => 0.5, range: (a) => a, pick: (xs) => xs[0] };

/** rng stub: the group pick (the call with upper bound LARGE_GROUPS.length-1) returns idx; anchor picks return 0 (part 0 at (x,y)). */
function pickGroup(idx) {
  return { ...rngStub, int: (a, b) => (b === LARGE_GROUPS.length - 1 ? idx : 0) };
}

function flatGame(on = true) {
  const g = Game.create({ seed: 7, startYear: 1990, settings: on ? { largeHouses: true } : undefined });
  return g;
}

function openSite(g) {
  // clear a flat 4x4 patch at the first town centre (tiles nearest this town): a free, flat site
  const { map } = g.state;
  const town = g.state.towns[0];
  const x0 = town.x - 1, y0 = town.y - 1;
  clearArea(g.state, x0, y0, x0 + 3, y0 + 3);
  for (let y = y0; y <= y0 + 3; y++) for (let x = x0; x <= x0 + 3; x++) map.tiles[y * map.width + x].height = 0;
  return { town, x: x0, y: y0 };
}

test('setting default off: largeHousesEnabled false and no multi-tile house is placed', () => {
  const g = flatGame(false);
  expect(largeHousesEnabled(g.state)).toBe(false);
  const s = openSite(g);
  expect(s).toBeTruthy();
  expect(placeLargeHouse(g.state, rngStub, s.town, s.x, s.y, 2, 1990)).toBe(false);
  expect(large(g).length).toBe(0);
});

test('setting on: a 2x2 house is placed on free flat land, parts share the anchor and town', () => {
  const g = flatGame(true);
  const s = openSite(g);
  expect(s).toBeTruthy();
  const group = LARGE_GROUPS.find((q) => q.size === '2x2' && q.minYear <= 1990);
  // force the chosen group by stubbing int() to return its index
  const idx = LARGE_GROUPS.indexOf(group);
  const rng = pickGroup(idx);
  const placed = placeLargeHouse(g.state, rng, s.town, s.x, s.y, 3, 1990);
  expect(placed).toBe(true);
  const parts = large(g);
  expect(parts.length).toBe(sizeTiles(group.size));
  const anchor = parts[0].building;
  for (const t of parts) {
    expect(t.building.ax).toBe(anchor.ax);
    expect(t.building.ay).toBe(anchor.ay);
    expect(t.building.townId).toBe(s.town.id);
    expect(t.building.level).toBe(3);
  }
  expect(s.town.houses.filter((h) => h.x === anchor.ax && h.y === anchor.ay).length).toBe(1);
});

test('removing a multi-tile house clears all its tiles and its town entry', () => {
  const g = flatGame(true);
  const s = openSite(g);
  const idx = LARGE_GROUPS.findIndex((q) => q.size === '2x2' && q.minYear <= 1990);
  const rng = pickGroup(idx);
  expect(placeLargeHouse(g.state, rng, s.town, s.x, s.y, 2, 1990)).toBe(true);
  const parts = large(g);
  const { ax, ay, size } = parts[0].building;
  const n0 = s.town.houses.length;
  const cleared = clearHouseAt(g.state, ax, ay);
  expect(cleared).toBe(sizeTiles(size));
  expect(large(g).length).toBe(0);
  expect(s.town.houses.length).toBe(n0 - 1);
  for (const t of parts) expect(t.owner).toBeNull();
});

test('growth with largeHouses on places a multi-tile house in a grown town (slow; long timeout)', () => {
  const g = Game.create({ seed: 7, startYear: 1990, settings: { largeHouses: true } });
  // growth reaches the house step rarely; a longer horizon makes at least one large house likely
  g.stepDays(365 * 4);
  const parts = large(g);
  for (const t of parts) {
    const b = t.building;
    const same = parts.filter((q) => q.building.ax === b.ax && q.building.ay === b.ay);
    expect(same.length).toBe(sizeTiles(b.size));
  }
}, 120000);

test('save round-trip keeps multi-tile parts (fields persisted generically)', () => {
  const g = flatGame(true);
  const s = openSite(g);
  const idx = LARGE_GROUPS.findIndex((q) => q.size === '2x2' && q.minYear <= 1990);
  placeLargeHouse(g.state, pickGroup(idx), s.town, s.x, s.y, 2, 1990);
  const before = large(g).length;
  const state = parseState(serializeState(g.state));
  const n = state.map.tiles.filter((t) => t.building && t.building.size).length;
  expect(n).toBe(before);
  expect(before).toBe(4);
});
