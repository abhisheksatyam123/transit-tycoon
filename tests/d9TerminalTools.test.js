/**
 * D9 Bus/Truck Terminal tools: toolbar visibility gated by terminalRoadStops, and the command wiring.
 */
import { describe, expect, test } from 'bun:test';
import { flatGame } from './helpers.js';
import { setSetting, getSetting } from '../js/simulation/settings.js';
import { TOOL_BUTTONS, TOOL_GROUPS, TOP_TOOLS, terminalToolShown } from '../js/ui/toolbar.js';
import { terminalToolSpec } from '../js/ui/tools/terminal.js';

const IDS = ['busTerminal', 'truckTerminal'];

/** Flyout entries visible for `state` (what the toolbar would show after its editor/terminal gate). */
function visibleFlyoutIds(state, groupId) {
  const group = TOOL_GROUPS.find((g) => g[0] === groupId);
  return group[3].filter((id) => terminalToolShown(state, id));
}

describe('D9 terminal tools: toolbar', () => {
  test('setting off: busTerminal/truckTerminal are not shown in Road+ or anywhere', () => {
    const g = flatGame();
    expect(getSetting(g.state, 'terminalRoadStops')).toBe(false);
    const road = visibleFlyoutIds(g.state, 'road');
    for (const id of IDS) expect(road.includes(id)).toBe(false);
    for (const id of IDS) expect(terminalToolShown(g.state, id)).toBe(false);
    expect(terminalToolShown(undefined, 'busTerminal')).toBe(false);
  });

  test('setting on: both are shown in Road+ and not in the top row', () => {
    const g = flatGame();
    setSetting(g.state, 'terminalRoadStops', true);
    const road = visibleFlyoutIds(g.state, 'road');
    for (const id of IDS) {
      expect(TOOL_GROUPS.find((x) => x[0] === 'road')[3].includes(id)).toBe(true);
      expect(road.includes(id)).toBe(true);
      expect(TOP_TOOLS.includes(id)).toBe(false);
      expect(TOOL_BUTTONS.some((b) => b[0] === id)).toBe(true);
    }
    expect(TOP_TOOLS.some((id) => IDS.includes(id))).toBe(false);
  });

  test('non-terminal tools are unaffected by the setting', () => {
    const g = flatGame();
    expect(terminalToolShown(g.state, 'busStop')).toBe(true);
    expect(terminalToolShown(g.state, 'oneWay')).toBe(true);
  });
});

describe('D9 terminal tools: command', () => {
  for (const [kind, id] of [['bus', 'busTerminal'], ['truck', 'truckTerminal']]) {
    test(`${kind}: spec id, joinKind, catchment, one-tile footprint`, () => {
      const spec = terminalToolSpec(kind);
      expect(spec.id).toBe(id);
      expect(spec.joinKind).toBe(kind);
      expect(spec.catchment).toBe(3);
      expect(spec.footprint(4, 5)).toEqual([{ x: 4, y: 5 }]);
      expect(spec.hint()).toMatch(/R rotates/);
      expect(spec.hint()).toMatch(/Ctrl\+click/);
    });

    test(`${kind}: command passes terminal:true, player:true and the rotated dir`, () => {
      const spec = terminalToolSpec(kind);
      const calls = [];
      const stub = { buildRoadStop: (x, y, k, opts) => { calls.push({ x, y, k, opts }); return { ok: true }; } };
      spec.command(stub, 7, 8, { dryRun: true });
      expect(calls[0]).toEqual({ x: 7, y: 8, k: kind, opts: { dryRun: true, player: true, terminal: true, dir: 1 } });
      expect(spec.key({ key: 'r' })).toBe(true);
      expect(spec.key({ key: 'R' })).toBe(true);
      expect(spec.key({ key: 'x' })).toBe(false);
      spec.command(stub, 7, 8, undefined);
      expect(calls[1].opts.dir).toBe(4); // 1 -> 2 -> 4
      expect(calls[1].opts.terminal).toBe(true);
    });
  }
});
