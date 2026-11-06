import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { COSTS } from '../js/config/costs.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { estimateTerraform, terraform, MAX_HEIGHT } from '../js/simulation/cmdTerraform.js';

const R = (x0, y0, x1 = x0, y1 = y0) => ({ x0, y0, x1, y1 });
const h = (g, x, y) => g.tile(x, y).height;
const setH = (g, x, y, v) => { g.tile(x, y).height = v; };

/** Every 8-adjacent pair inside the flattened test box (x 4..60, y 14..34) differs by <= 1. */
function slopeOk(g) {
  for (let y = 14; y <= 34; y++) for (let x = 4; x <= 60; x++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 4 || ny < 14 || nx > 60 || ny > 34) continue;
    if (Math.abs(h(g, x, y) - h(g, nx, ny)) > 1) return false;
  }
  return true;
}

describe('terraform', () => {
  test('raise a single tile moves it one level and keeps neighbours within 1', () => {
    const g = flatGame();
    expect(h(g, 20, 20)).toBe(1);
    const r = g.terraform('raise', R(20, 20));
    expect(r.ok).toBe(true);
    expect(h(g, 20, 20)).toBe(2);
    expect(slopeOk(g)).toBe(true);
  });

  test('raising a tile next to a low neighbour pulls the neighbour up (cascade)', () => {
    const g = flatGame();
    setH(g, 20, 20, 4); // neighbours at 1 would violate the rule
    expect(slopeOk(g)).toBe(false);
    setH(g, 20, 20, 1);
    setH(g, 21, 20, 2);
    const r = g.terraform('raise', R(21, 20));
    expect(r.ok).toBe(true);
    expect(h(g, 21, 20)).toBe(3);
    expect(h(g, 20, 20)).toBe(2); // pulled up to 3-1
    expect(slopeOk(g)).toBe(true);
  });

  test('lower a flat tile to 0: neighbours at 1 stay (already within 1)', () => {
    const g = flatGame();
    const r = g.terraform('lower', R(30, 25));
    expect(r.ok).toBe(true);
    expect(h(g, 30, 25)).toBe(0);
    expect(h(g, 31, 25)).toBe(1);
    expect(slopeOk(g)).toBe(true);
  });

  test('lower a tile under a higher neighbour pulls that neighbour down to h+1', () => {
    const g = flatGame();
    setH(g, 31, 25, 2);
    const r = g.terraform('lower', R(30, 25)); // 1 -> 0, so (31,25) at 2 must come down to 1
    expect(r.ok).toBe(true);
    expect(h(g, 31, 25)).toBe(1);
    expect(slopeOk(g)).toBe(true);
  });

  test('refuses to lower below 0 and raise above MAX_HEIGHT', () => {
    const g = flatGame();
    setH(g, 40, 30, 0);
    expect(g.terraform('lower', R(40, 30)).ok).toBe(false);
    setH(g, 42, 30, MAX_HEIGHT);
    expect(g.terraform('raise', R(42, 30)).ok).toBe(false);
  });

  test('refuses to change a track tile; a tile beside track is allowed when the track is not affected', () => {
    const g = flatGame();
    expect(g.buildRail(20, 30, 24, 30).ok).toBe(true);
    const before = JSON.stringify(g.state.map.tiles), money = g.state.company.money;
    expect(g.terraform('raise', R(22, 30)).ok).toBe(false); // on the rail
    expect(JSON.stringify(g.state.map.tiles)).toBe(before);
    expect(g.state.company.money).toBe(money);
    expect(g.terraform('raise', R(22, 27)).ok).toBe(true); // two tiles away: fine
  });

  test('refuses to change a tile next to water', () => {
    const g = flatGame();
    g.state.map.tiles[30 * 96 + 30].terrain = 'water';
    expect(g.terraform('raise', R(31, 30)).ok).toBe(false);
    expect(g.terraform('raise', R(33, 30)).ok).toBe(true);
  });

  test('refusal leaves the map and money untouched when the cascade reaches a fixed tile', () => {
    const g = flatGame();
    expect(g.buildRail(20, 30, 24, 30).ok).toBe(true);
    // (21,31) raised to 4 forces its 8-neighbours up to >= 3, including the rail tiles at y=30: refused
    setH(g, 21, 31, 3);
    const before = JSON.stringify(g.state.map.tiles), money = g.state.company.money;
    const r = g.terraform('raise', R(21, 31));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(g.state.map.tiles)).toBe(before);
    expect(g.state.company.money).toBe(money);
  });

  test('level sets a rectangle to the start tile height', () => {
    const g = flatGame();
    setH(g, 10, 20, 5);
    setH(g, 11, 20, 2);
    setH(g, 11, 21, 4);
    const r = g.terraform('level', R(10, 20, 13, 22));
    expect(r.ok).toBe(true);
    for (let y = 20; y <= 22; y++) for (let x = 10; x <= 13; x++) expect(h(g, x, y)).toBe(5);
    expect(slopeOk(g)).toBe(true);
  });

  test('level with nothing to change is refused', () => {
    const g = flatGame();
    expect(g.terraform('level', R(10, 20, 12, 22)).ok).toBe(false);
  });

  test('plant trees turns grass into forest; demolish clears it', () => {
    const g = flatGame();
    const r = g.terraform('plant', R(10, 20, 12, 22));
    expect(r.ok).toBe(true);
    expect(r.tiles).toBe(9);
    expect(g.tile(11, 21).terrain).toBe('forest');
    expect(r.cost).toBe(9 * COSTS.plantTree);
    const d = g.demolish(10, 20, 12, 22);
    expect(d.ok).toBe(true);
    expect(g.tile(11, 21).terrain).toBe('grass');
  });

  test('cost equals the estimate and the money is deducted', () => {
    const g = flatGame();
    const est = estimateTerraform(g.state, 'raise', R(20, 20, 22, 21));
    expect(est.ok).toBe(true);
    const money = g.state.company.money;
    const r = g.terraform('raise', R(20, 20, 22, 21));
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(est.cost);
    expect(g.state.company.money).toBe(money - est.cost);
    expect(est.tiles).toBe(r.tiles);
  });

  test('estimate reports unaffordable as not ok with the cost', () => {
    const g = flatGame();
    g.state.company.money = 1;
    const est = estimateTerraform(g.state, 'raise', R(20, 20));
    expect(est.ok).toBe(false);
    expect(est.error).toBeTruthy();
    expect(est.cost).toBeGreaterThan(0);
  });

  test('dry run does not mutate', () => {
    const g = flatGame();
    const before = JSON.stringify(g.state.map.tiles), money = g.state.company.money;
    const r = terraform({ state: g.state }, 'raise', R(20, 20, 23, 23), { dryRun: true });
    expect(r.ok).toBe(true);
    expect(JSON.stringify(g.state.map.tiles)).toBe(before);
    expect(g.state.company.money).toBe(money);
  });

  test('changed heights survive a save round-trip', () => {
    const g = flatGame();
    g.terraform('raise', R(25, 25, 27, 27));
    g.terraform('plant', R(30, 30, 31, 31));
    const s2 = parseState(serializeState(g.state));
    for (let y = 24; y <= 28; y++) for (let x = 24; x <= 28; x++) {
      expect(s2.map.tiles[y * s2.map.width + x].height).toBe(g.state.map.tiles[y * s2.map.width + x].height);
    }
    expect(s2.map.tiles[30 * s2.map.width + 30].terrain).toBe('forest');
  });

  test('keeps the coal line intact when terraforming around it', () => {
    const g = flatGame();
    coalLine(g);
    const r = g.terraform('raise', R(20, 27, 22, 28));
    expect(r.ok).toBe(true);
    expect(slopeOk(g)).toBe(true);
    expect(g.tile(20, 24).rail).toBeTruthy(); // the station/line is still there
  });
});
