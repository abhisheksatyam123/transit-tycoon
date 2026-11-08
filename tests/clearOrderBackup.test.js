/** clearOrderBackup (OTTD Clone/ClearOrderBackup): clears depot order backup; idempotent; save/load compat. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';

const BUY = { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' };

function setup() {
  const g = flatGame(21);
  const L = coalLine(g);
  const v = g.buyVehicle(L.depotId, BUY).vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
  return { g, L, v };
}

const sellBackup = (g, id) => g.sellVehicle(id, { backupOrders: true });

describe('clearOrderBackup', () => {
  test('clears backup for vehicle depot', () => {
    const { g, L, v } = setup();
    sellBackup(g, v.id);
    expect(g.state.orderBackups[L.depotId]).toBeDefined();
    // rebuy so we have a vehicle in depot to call from
    const n = g.buyVehicle(L.depotId, BUY, { noRestore: true }).vehicle;
    // put backup back (buy consumed it)
    sellBackup(g, n.id);
    expect(g.state.orderBackups[L.depotId]).toBeDefined();
    const m = g.buyVehicle(L.depotId, BUY, { noRestore: true }).vehicle;
    const r = g.clearOrderBackup(m.id);
    expect(r.ok).toBe(true);
    expect(r.cleared).toBe(true);
    expect(g.state.orderBackups).toBeUndefined();
  });

  test('idempotent/no-op when absent', () => {
    const { g, v } = setup();
    expect(g.state.orderBackups).toBeUndefined();
    const r = g.clearOrderBackup(v.id);
    expect(r.ok).toBe(true);
    expect(r.cleared).toBe(false);
    expect(g.state.orderBackups).toBeUndefined();
    // call again
    const r2 = g.clearOrderBackup(v.id);
    expect(r2.ok).toBe(true);
    expect(r2.cleared).toBe(false);
  });

  test('dryRun does not mutate', () => {
    const { g, L, v } = setup();
    sellBackup(g, v.id);
    const n = g.buyVehicle(L.depotId, BUY, { noRestore: true }).vehicle;
    sellBackup(g, n.id);
    const m = g.buyVehicle(L.depotId, BUY, { noRestore: true }).vehicle;
    expect(g.state.orderBackups[L.depotId]).toBeDefined();
    const r = g.clearOrderBackup(m.id, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.cleared).toBe(true);
    expect(g.state.orderBackups[L.depotId]).toBeDefined();
  });

  test('unknown vehicle returns error', () => {
    const { g } = setup();
    const r = g.clearOrderBackup(999999);
    expect(r.ok).toBe(false);
  });

  test('save/load old save without backup still loads', () => {
    const { g } = setup();
    // ensure no backups
    delete g.state.orderBackups;
    const snap = serializeState(g.state);
    const parsed = JSON.parse(snap);
    // simulate old save: no orderBackups key
    expect(parsed.orderBackups).toBeUndefined();
    const loaded = parseState(snap);
    expect(loaded).toBeTruthy();
    expect(loaded.orderBackups).toBeUndefined();
    // clearOrderBackup works (no-op) on loaded state context via game-like flow:
    // just verify state is intact
    expect(Array.isArray(loaded.vehicles)).toBe(true);
  });
});
