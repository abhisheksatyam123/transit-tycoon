/**
 * D9 terminal road stops (opt-in, setting terminalRoadStops default off).
 * Spec: scratchpad research d9-terminal-road-stops-spec.md sections 4.1 and 7.2.
 */
import { describe, expect, test } from 'bun:test';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { buildRoadStop } from '../js/simulation/cmdStation.js';
import { getTile } from '../js/simulation/map.js';
import { AXIS_BITS } from '../js/simulation/constants.js';

/** Stub road tile at (40,24) whose only bit (E) points at the clear tile (41,24). */
function stub(g) {
  const r = getTile(g.state.map, 40, 24);
  r.road = 2;
  r.owner = 'company';
  return r;
}

describe('terminalRoadStops setting (D9)', () => {
  test('default is false and has exactly one SETTING_META entry (check, construction)', () => {
    expect(DEFAULT_SETTINGS.terminalRoadStops).toBe(false);
    const metas = SETTING_META.filter((m) => m.key === 'terminalRoadStops');
    expect(metas.length).toBe(1);
    expect(metas[0].group).toBe('construction');
    expect(metas[0].type).toBe('check');
  });

  test('off (default): terminal option is ignored and clear land gets a through road', () => {
    const g = flatGame();
    stub(g);
    const r = buildRoadStop(g.ctx, 41, 24, 'bus', { terminal: true, dir: 8 });
    expect(r.ok).toBe(true);
    expect(getTile(g.state.map, 41, 24).road).toBe(AXIS_BITS.x);
  });

  test('on: clear land beside a connecting road gets one entrance bit, no through road', () => {
    const g = flatGame();
    setSetting(g.state, 'terminalRoadStops', true);
    stub(g);
    const r = buildRoadStop(g.ctx, 41, 24, 'bus', { terminal: true, dir: 8 });
    expect(r.ok).toBe(true);
    const t = getTile(g.state.map, 41, 24);
    expect(t.road).toBe(8);
    expect(t.building.type).toBe('station');
    expect(t.building.kind).toBe('bus');
    expect(t.building.axis).toBe('x');
    expect(getTile(g.state.map, 40, 24).road).toBe(2);
  });

  test('on: clear land with no connecting road is refused', () => {
    const g = flatGame();
    setSetting(g.state, 'terminalRoadStops', true);
    const r = buildRoadStop(g.ctx, 41, 24, 'bus', { terminal: true, dir: 8 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('connecting road');
    expect(getTile(g.state.map, 41, 24).building).toBeFalsy();
  });

  test('on: clear land without a valid dir is refused', () => {
    const g = flatGame();
    setSetting(g.state, 'terminalRoadStops', true);
    stub(g);
    expect(buildRoadStop(g.ctx, 41, 24, 'bus', { terminal: true }).ok).toBe(false);
    expect(buildRoadStop(g.ctx, 41, 24, 'bus', { terminal: true, dir: 3 }).ok).toBe(false);
  });

  test('on: a through road tile is refused (no silent severing)', () => {
    const g = flatGame();
    setSetting(g.state, 'terminalRoadStops', true);
    getTile(g.state.map, 30, 24).road = AXIS_BITS.x;
    const r = buildRoadStop(g.ctx, 30, 24, 'bus', { terminal: true });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('road end');
  });

  test('on: a curve (two non-opposite bits) is refused', () => {
    const g = flatGame();
    setSetting(g.state, 'terminalRoadStops', true);
    getTile(g.state.map, 30, 24).road = 1 | 2;
    expect(buildRoadStop(g.ctx, 30, 24, 'truck', { terminal: true }).ok).toBe(false);
  });

  test('on: an existing dead-end road tile keeps its single bit', () => {
    const g = flatGame();
    setSetting(g.state, 'terminalRoadStops', true);
    const r0 = stub(g);
    const r = buildRoadStop(g.ctx, 40, 24, 'truck', { terminal: true });
    expect(r.ok).toBe(true);
    expect(r0.road).toBe(2);
    expect(r0.building.axis).toBe('x');
  });

  test('on: tram stops cannot be terminal', () => {
    const g = flatGame();
    setSetting(g.state, 'terminalRoadStops', true);
    stub(g);
    expect(buildRoadStop(g.ctx, 41, 24, 'tram', { terminal: true, dir: 8 }).ok).toBe(false);
  });

  test('on without opts.terminal: ordinary drive-through behaviour unchanged', () => {
    const g = flatGame();
    setSetting(g.state, 'terminalRoadStops', true);
    stub(g);
    expect(buildRoadStop(g.ctx, 41, 24, 'bus', { dir: 8 }).ok).toBe(true);
    expect(getTile(g.state.map, 41, 24).road).toBe(AXIS_BITS.x);
  });
});
