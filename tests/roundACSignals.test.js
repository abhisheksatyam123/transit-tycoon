// OpenTTD pf.reverse_at_signals (pathfinding_settings.ini:55, def true) -> settings.reverseAtSignals.
// TT already turned trains held at red signals round after BLOCK_TIMEOUT_TICKS (movement.js hold); default true keeps that.
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { BLOCK_TIMEOUT_TICKS } from '../js/simulation/blocking.js';

/** Train A runs east into a block signal at (28,24); a stopped train B sits in the block beyond it. */
function signalJam(mode) {
  const g = flatGame(29);
  const L = coalLine(g);
  if (mode !== undefined) setSetting(g.state, 'reverseAtSignals', mode);
  expect(g.buildSignal(28, 24, { type: 'block' }).ok).toBe(true);
  const v = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.b.id }]).ok).toBe(true);
  expect(g.startVehicle(v.id).ok).toBe(true);
  const b = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
  Object.assign(b, { state: 'stopped', tx: 33, ty: 24, path: [], pathIndex: 0, progress: 0, speed: 0, history: [{ x: 33, y: 24 }] });
  return { g, v };
}

/**
 * Run until the train has been held for a full timeout plus two days (counted from its first blocked tick).
 * turned: v.path was replaced during that window (turnAround re-plans the train). waited: blockedTicks ran past
 * the timeout without a reset, so the train is still held at the signal.
 */
function runPastTimeout(g, v) {
  let heldPath = null, heldAt = -1, waited = false;
  for (let i = 0; i < 12 * 96; i++) {
    g.step();
    if (heldPath === null && v.blockedTicks) { heldPath = v.path; heldAt = i; }
    if (heldPath !== null && (v.blockedTicks || 0) > BLOCK_TIMEOUT_TICKS) waited = true;
    if (heldPath !== null && i - heldAt >= BLOCK_TIMEOUT_TICKS + 2 * 96) break;
  }
  return { turned: heldPath !== null && v.path !== heldPath, waited };
}

describe('pf.reverse_at_signals (reverseAtSignals)', () => {
  test('default is true (TT current behaviour) and has exactly one SETTING_META entry in difficulty', () => {
    expect(DEFAULT_SETTINGS.reverseAtSignals).toBe(true);
    const metas = SETTING_META.filter((m) => m.key === 'reverseAtSignals');
    expect(metas.length).toBe(1);
    expect(metas[0].group).toBe('difficulty');
    expect(metas[0].type).toBe('check');
  });

  test('false: a train held at a red block signal beyond the timeout does not turn round', () => {
    const { g, v } = signalJam(false);
    expect(getSetting(g.state, 'reverseAtSignals')).toBe(false);
    const { turned, waited } = runPastTimeout(g, v);
    expect(turned).toBe(false);
    expect(waited).toBe(true); // it was held past the timeout
  });

  test('true (default): the same train turns round after the timeout', () => {
    const { g, v } = signalJam(undefined);
    expect(getSetting(g.state, 'reverseAtSignals')).toBe(true);
    const { turned } = runPastTimeout(g, v);
    expect(turned).toBe(true);
  });

  test('path (SIGNAL_HOLD) hold: a one-way signal facing against the train also honours the setting', () => {
    const run = (mode) => {
      const g = flatGame(29);
      const L = coalLine(g);
      if (mode !== undefined) setSetting(g.state, 'reverseAtSignals', mode);
      expect(g.buildSignal(28, 24, { type: 'oneway', dir: 8 }).ok).toBe(true); // faces west: eastbound train is refused
      const v = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
      expect(g.setOrders(v.id, [{ stationId: L.b.id }]).ok).toBe(true);
      expect(g.startVehicle(v.id).ok).toBe(true);
      return runPastTimeout(g, v).turned;
    };
    expect(run(false)).toBe(false);
    expect(run(undefined)).toBe(true);
  });
});
