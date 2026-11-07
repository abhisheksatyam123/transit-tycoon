/** Drag signals (signalRun.js + ui/tools/signal.js drag geometry): spacing, junction stop, remove, command path. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { planSignalRun, clampSignalSpacing } from '../js/simulation/signalRun.js';
import { signalDragTiles } from '../js/ui/tools/signal.js';

const run = (x0, x1, y = 24) => { const r = []; for (let x = x0; x <= x1; x++) r.push({ x, y }); return r; };

describe('signal spacing helper', () => {
  test('clamp: default 4, range 1..16, junk gives 4', () => {
    expect(clampSignalSpacing(undefined)).toBe(4);
    expect(clampSignalSpacing('x')).toBe(4);
    expect(clampSignalSpacing(0)).toBe(1);
    expect(clampSignalSpacing(99)).toBe(16);
    expect(clampSignalSpacing('6')).toBe(6);
  });

  test('12-tile straight run with spacing 4: signals at offsets 0, 4, 8', () => {
    const g = flatGame(7);
    expect(g.buildRail(20, 24, 40, 24).ok).toBe(true);
    const plan = planSignalRun(g.state, run(20, 31), 4);
    expect(plan.stopped).toBeNull();
    expect(plan.positions.map((p) => p.x)).toEqual([20, 24, 28]);
  });

  test('spacing 1 signals every tile; spacing 3 restarts from the first tile', () => {
    const g = flatGame(7);
    expect(g.buildRail(20, 24, 40, 24).ok).toBe(true);
    expect(planSignalRun(g.state, run(20, 23), 1).positions.length).toBe(4);
    expect(planSignalRun(g.state, run(20, 26), 3).positions.map((p) => p.x)).toEqual([20, 23, 26]);
  });

  test('stops at a junction (OTTD autofill never signals past one)', () => {
    const g = flatGame(7);
    expect(g.buildRail(20, 24, 40, 24).ok).toBe(true);
    expect(g.buildRail(26, 22, 26, 23).ok).toBe(true); // branch north at x=26 makes (26,24) a junction
    const plan = planSignalRun(g.state, run(20, 31), 4);
    expect(plan.stopped).not.toBeNull();
    expect(plan.stopped.x).toBe(26);
    expect(plan.positions.map((p) => p.x)).toEqual([20, 24]);
  });

  test('an existing signal anchors the spacing', () => {
    const g = flatGame(7);
    expect(g.buildRail(20, 24, 40, 24).ok).toBe(true);
    expect(g.buildSignal(22, 24).ok).toBe(true);
    const plan = planSignalRun(g.state, run(20, 27), 4);
    expect(plan.positions.map((p) => p.x)).toEqual([20, 26]); // 4 tiles after the existing signal at 22
  });

  test('drag geometry: straight, diagonal staircase, L otherwise', () => {
    expect(signalDragTiles(20, 24, 23, 24).map((p) => p.x)).toEqual([20, 21, 22, 23]);
    const d = signalDragTiles(20, 24, 22, 26);
    expect(d[d.length - 1]).toEqual({ x: 22, y: 26 });
    expect(d.length).toBe(5);
    const l = signalDragTiles(20, 24, 23, 27);
    expect(l[l.length - 1]).toEqual({ x: 23, y: 27 });
  });
});

describe('signal run command path', () => {
  test('build run: places per plan, cost is the sum, dryRun changes nothing', () => {
    const g = flatGame(7);
    expect(g.buildRail(20, 24, 40, 24).ok).toBe(true);
    const s = g.state;
    const before = s.company.money;
    const dry = g.buildSignalRun(run(20, 31), { spacing: 4, dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.tiles).toBe(3);
    expect(s.map.tiles[24 * s.map.width + 20].signal).toBeUndefined();
    expect(s.company.money).toBe(before);
    const r = g.buildSignalRun(run(20, 31), { spacing: 4 });
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(dry.cost);
    expect(s.company.money).toBe(before - dry.cost);
    for (const x of [20, 24, 28]) expect(s.map.tiles[24 * s.map.width + x].signal).toBe(1);
    expect(s.map.tiles[24 * s.map.width + 21].signal).toBeUndefined();
  });

  test('remove run deletes every signal on the run and refunds', () => {
    const g = flatGame(7);
    expect(g.buildRail(20, 24, 40, 24).ok).toBe(true);
    expect(g.buildSignalRun(run(20, 31), { spacing: 4 }).ok).toBe(true);
    const r = g.buildSignalRun(run(20, 31), { remove: true });
    expect(r.ok).toBe(true);
    expect(r.tiles).toBe(3);
    expect(g.state.map.tiles[24 * g.state.map.width + 24].signal).toBeUndefined();
    expect(g.buildSignalRun(run(20, 31), { remove: true }).ok).toBe(false);
  });

  test('unaffordable whole run is refused without partial placement', () => {
    const g = flatGame(7);
    expect(g.buildRail(20, 24, 40, 24).ok).toBe(true);
    g.state.company.money = 1;
    const r = g.buildSignalRun(run(20, 31), { spacing: 4 });
    expect(r.ok).toBe(false);
    expect(g.state.map.tiles[24 * g.state.map.width + 20].signal).toBeUndefined();
  });
});
