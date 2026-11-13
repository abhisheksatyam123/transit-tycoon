/**
 * D9 UI wiring: bus/truck stop tools pass terminal:true only when terminalRoadStops is on.
 */
import { describe, expect, test } from 'bun:test';
import { flatGame } from './helpers.js';
import { setSetting } from '../js/simulation/settings.js';
import { busStopCommand } from '../js/ui/tools/busStop.js';
import { truckStopCommand } from '../js/ui/tools/truckStop.js';

function recordingGame(g) {
  const calls = [];
  const fake = { state: g.state, buildRoadStop: (x, y, kind, opts) => { calls.push({ x, y, kind, opts }); return { ok: true }; } };
  return { fake, calls };
}

describe('D9 terminal UI wiring', () => {
  for (const [name, make, kind] of [['bus', busStopCommand, 'bus'], ['truck', truckStopCommand, 'truck']]) {
    test(`${name} stop: terminal flag absent when setting off`, () => {
      const g = flatGame();
      const { fake, calls } = recordingGame(g);
      make(fake, 5, 6, undefined);
      expect(calls[0].kind).toBe(kind);
      expect('terminal' in calls[0].opts).toBe(false);
      expect(calls[0].opts.player).toBe(true);
    });

    test(`${name} stop: terminal:true when setting on`, () => {
      const g = flatGame();
      setSetting(g.state, 'terminalRoadStops', true);
      const { fake, calls } = recordingGame(g);
      make(fake, 5, 6, { dir: 8 });
      expect(calls[0].opts.terminal).toBe(true);
      expect(calls[0].opts.dir).toBe(8);
      expect(calls[0].opts.player).toBe(true);
    });
  }
});
