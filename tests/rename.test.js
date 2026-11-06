/** Rename commands (cmdRename.js): validation, uniqueness, persistence through save/load, lookups. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { validateName, MAX_NAME_LENGTH } from '../js/simulation/cmdRename.js';

function setup() {
  const g = flatGame(23);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  expect(g.setOrders(r.vehicle.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('validateName', () => {
  test('trims and accepts 1..32 characters', () => {
    expect(validateName('  Central  ')).toEqual({ ok: true, name: 'Central' });
    expect(validateName('x'.repeat(MAX_NAME_LENGTH)).ok).toBe(true);
    expect(validateName('x'.repeat(MAX_NAME_LENGTH + 1)).ok).toBe(false);
  });
  test('rejects empty, whitespace-only, non-string and control characters', () => {
    expect(validateName('').ok).toBe(false);
    expect(validateName('   ').ok).toBe(false);
    expect(validateName(42).ok).toBe(false);
    expect(validateName('a\nb').ok).toBe(false);
  });
});

describe('rename commands', () => {
  test('station: valid rename stores the name; dryRun does not', () => {
    const { g, L } = setup();
    expect(g.renameStation(L.a.id, 'Coal Yard', { dryRun: true }).ok).toBe(true);
    expect(L.a.name).not.toBe('Coal Yard');
    expect(g.renameStation(L.a.id, '  Coal Yard ').ok).toBe(true);
    expect(g.state.stations.find((s) => s.id === L.a.id).name).toBe('Coal Yard');
  });

  test('station: unknown id and invalid / duplicate names are rejected', () => {
    const { g, L } = setup();
    expect(g.renameStation(999999, 'Nope').ok).toBe(false);
    expect(g.renameStation(L.a.id, '').ok).toBe(false);
    const before = L.a.name;
    const dup = g.renameStation(L.a.id, L.b.name.toUpperCase());
    expect(dup.ok).toBe(false);
    expect(dup.error).toMatch(/already exists/);
    expect(L.a.name).toBe(before);
  });

  test('station: keeping its own name (case change) is allowed', () => {
    const { g, L } = setup();
    expect(g.renameStation(L.a.id, L.a.name.toLowerCase()).ok).toBe(true);
  });

  test('vehicle: unique among vehicles; duplicate rejected', () => {
    const { g, v } = setup();
    expect(g.renameVehicle(v.id, 'Express 1').ok).toBe(true);
    expect(v.name).toBe('Express 1');
    const r = g.buyVehicle(g.state.depots[g.state.depots.length - 1].id, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(g.renameVehicle(r.vehicle.id, 'express 1').ok).toBe(false);
    expect(g.renameVehicle(r.vehicle.id, 'Express 2').ok).toBe(true);
    expect(g.renameVehicle(12345678, 'X').ok).toBe(false);
  });

  test('town: unique among towns; unknown town rejected', () => {
    const { g } = setup();
    const [t1, t2] = g.state.towns;
    expect(g.renameTown(t1.id, 'Brightwater').ok).toBe(true);
    expect(t1.name).toBe('Brightwater');
    expect(g.renameTown(t2.id, 'brightwater').ok).toBe(false);
    expect(g.renameTown(-5, 'Q').ok).toBe(false);
    expect(g.renameTown(t1.id, 'x'.repeat(33)).ok).toBe(false);
  });

  test('company: renamed, validated, no uniqueness rule', () => {
    const { g } = setup();
    expect(g.renameCompany('').ok).toBe(false);
    expect(g.renameCompany(' Iron Rail Ltd ').ok).toBe(true);
    expect(g.state.company.name).toBe('Iron Rail Ltd');
  });

  test('persistence: names survive save/load; renamed station still found by orders', () => {
    const { g, L, v } = setup();
    g.renameStation(L.a.id, 'Coal Yard');
    g.renameVehicle(v.id, 'Freight A');
    g.renameCompany('Iron Rail');
    const s2 = parseState(serializeState(g.state));
    expect(s2.stations.find((s) => s.id === L.a.id).name).toBe('Coal Yard');
    expect(s2.vehicles.find((x) => x.id === v.id).name).toBe('Freight A');
    expect(s2.company.name).toBe('Iron Rail');
    const vv = s2.vehicles.find((x) => x.id === v.id);
    expect(vv.orders[0].stationId).toBe(L.a.id);
  });

  test('renamed station is still found by the orders and by a rename-proof lookup', () => {
    const { g, L, v } = setup();
    g.renameStation(L.a.id, 'Renamed Mine');
    expect(v.orders[0].stationId).toBe(L.a.id);
    expect(g.setOrders(v.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
    expect(g.state.stations.find((s) => s.name === 'Renamed Mine').id).toBe(L.a.id);
  });
});
