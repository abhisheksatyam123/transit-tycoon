/**
 * K4 rename polish (OL P2 #18/#37): audit coverage for station/vehicle/town/industry/depot.
 * - station/vehicle/town/depot: rename works, uniqueness case-insensitive, invalid/blank,
 *   save/load round-trip.
 * - industry: "rename" in the UI sense is setIndustryText (a free-text note, lazy `ind.text`,
 *   max 320, no uniqueness) — NOT an entity-name rename. There is no renameIndustry API;
 *   industry names are type-derived/display labels in the window. Tests cover setIndustryText
 *   semantics as the industry rename-equivalent, plus save/load + old-save drop.
 * - old-save drop: saves without renamed/name-note fields load cleanly (fields absent/lazy).
 */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { setIndustryText, MAX_INDUSTRY_TEXT_LENGTH, MAX_NAME_LENGTH } from '../js/simulation/cmdRename.js';

function setupLine() {
  const g = flatGame(23);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle, depot: g.state.depots.find((d) => d.id === L.depotId) };
}

describe('K4 rename kinds: station', () => {
  test('rename works', () => {
    const { g, L } = setupLine();
    expect(g.renameStation(L.a.id, 'Coal Yard').ok).toBe(true);
    expect(g.state.stations.find((s) => s.id === L.a.id).name).toBe('Coal Yard');
  });
  test('uniqueness case-insensitive', () => {
    const { g, L } = setupLine();
    const dup = g.renameStation(L.a.id, L.b.name.toUpperCase());
    expect(dup.ok).toBe(false);
    expect(dup.error).toMatch(/already exists/i);
  });
  test('invalid blank rejected', () => {
    const { g, L } = setupLine();
    expect(g.renameStation(L.a.id, '').ok).toBe(false);
    expect(g.renameStation(L.a.id, '   ').ok).toBe(false);
    expect(g.renameStation(L.a.id, 'x'.repeat(MAX_NAME_LENGTH + 1)).ok).toBe(false);
  });
  test('save/load round-trip', () => {
    const { g, L } = setupLine();
    g.renameStation(L.a.id, 'Saved Station');
    const s2 = parseState(serializeState(g.state));
    expect(s2.stations.find((s) => s.id === L.a.id).name).toBe('Saved Station');
  });
});

describe('K4 rename kinds: vehicle', () => {
  test('rename works', () => {
    const { g, v } = setupLine();
    expect(g.renameVehicle(v.id, 'Freight 1').ok).toBe(true);
    expect(v.name).toBe('Freight 1');
  });
  test('uniqueness case-insensitive', () => {
    const { g, v, L } = setupLine();
    g.renameVehicle(v.id, 'Express');
    const r2 = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL' });
    expect(g.renameVehicle(r2.vehicle.id, 'EXPRESS').ok).toBe(false);
  });
  test('invalid blank rejected', () => {
    const { g, v } = setupLine();
    expect(g.renameVehicle(v.id, '').ok).toBe(false);
    expect(g.renameVehicle(v.id, '   ').ok).toBe(false);
  });
  test('save/load round-trip', () => {
    const { g, v } = setupLine();
    g.renameVehicle(v.id, 'Saved Loco');
    const s2 = parseState(serializeState(g.state));
    expect(s2.vehicles.find((x) => x.id === v.id).name).toBe('Saved Loco');
  });
});

describe('K4 rename kinds: town', () => {
  test('rename works', () => {
    const { g } = setupLine();
    const t = g.state.towns[0];
    expect(g.renameTown(t.id, 'Brightwater').ok).toBe(true);
    expect(t.name).toBe('Brightwater');
  });
  test('uniqueness case-insensitive', () => {
    const { g } = setupLine();
    const [t1, t2] = g.state.towns;
    g.renameTown(t1.id, 'Brightwater');
    expect(g.renameTown(t2.id, 'brightwater').ok).toBe(false);
  });
  test('invalid blank rejected', () => {
    const { g } = setupLine();
    expect(g.renameTown(g.state.towns[0].id, '').ok).toBe(false);
    expect(g.renameTown(g.state.towns[0].id, '   ').ok).toBe(false);
  });
  test('save/load round-trip', () => {
    const { g } = setupLine();
    const t = g.state.towns[0];
    g.renameTown(t.id, 'Saved Town');
    const s2 = parseState(serializeState(g.state));
    expect(s2.towns.find((x) => x.id === t.id).name).toBe('Saved Town');
  });
});

describe('K4 rename kinds: industry (setIndustryText note, not entity rename)', () => {
  // Distinction: industries have no renameIndustry/name-rename API. The "rename"/text affordance
  // is setIndustryText — a lazy free-text note (ind.text, max 320 chars, cleared by blank),
  // with no uniqueness rule. The industry window title shows ind.name (type-derived).
  test('setIndustryText works (note)', () => {
    const g = flatGame(23); placeIndustry(g.state, 'coal_mine', 10, 20);
    const id = g.state.industries[0].id;
    const r = g.setIndustryText(id, '  Mine note  ');
    expect(r.ok).toBe(true);
    expect(r.text).toBe('Mine note');
    expect(g.state.industries[0].text).toBe('Mine note');
  });
  test('no uniqueness rule for industry notes (distinct from name rename)', () => {
    const g = flatGame(23); placeIndustry(g.state, 'coal_mine', 10, 20); placeIndustry(g.state, 'coal_mine', 20, 20);
    const [a, b] = g.state.industries;
    expect(g.setIndustryText(a.id, 'Same note').ok).toBe(true);
    expect(g.setIndustryText(b.id, 'Same note').ok).toBe(true);
  });
  test('blank clears note (lazy field deleted)', () => {
    const g = flatGame(23); placeIndustry(g.state, 'coal_mine', 10, 20);
    const id = g.state.industries[0].id;
    g.setIndustryText(id, 'note');
    expect(g.setIndustryText(id, '   ').ok).toBe(true);
    expect(g.state.industries[0].text).toBeUndefined();
    expect('text' in g.state.industries[0]).toBe(false);
  });
  test('invalid: control chars rejected, length truncated to 320', () => {
    const g = flatGame(23); placeIndustry(g.state, 'coal_mine', 10, 20);
    const id = g.state.industries[0].id;
    expect(g.setIndustryText(id, 'a\u0001b').ok).toBe(false);
    const r = g.setIndustryText(id, 'x'.repeat(500));
    expect(r.ok).toBe(true);
    expect([...r.text].length).toBe(MAX_INDUSTRY_TEXT_LENGTH);
  });
  test('save/load round-trip preserves note', () => {
    const g = flatGame(23); placeIndustry(g.state, 'coal_mine', 10, 20);
    const id = g.state.industries[0].id;
    g.setIndustryText(id, 'persisted');
    const s2 = parseState(serializeState(g.state));
    expect(s2.industries.find((i) => i.id === id).text).toBe('persisted');
  });
});

describe('K4 rename kinds: depot', () => {
  test('rename works', () => {
    const { g, depot } = setupLine();
    expect(g.renameDepot(depot.id, 'North Yard').ok).toBe(true);
    expect(depot.name).toBe('North Yard');
  });
  test('blank resets to default (lazy name deleted)', () => {
    const { g, depot } = setupLine();
    g.renameDepot(depot.id, 'Named');
    const r = g.renameDepot(depot.id, '   ');
    expect(r.ok).toBe(true);
    expect(depot.name).toBeUndefined();
    expect(r.name).toMatch(/Depot at/);
  });
  test('save/load round-trip', () => {
    const { g, depot } = setupLine();
    g.renameDepot(depot.id, 'Saved Depot');
    const s2 = parseState(serializeState(g.state));
    expect(s2.depots.find((d) => d.id === depot.id).name).toBe('Saved Depot');
  });
});

describe('K4 old-save drop (lazy rename fields absent)', () => {
  test('old saves without name overrides/notes load cleanly', () => {
    const { g } = setupLine();
    // ensure no lazy rename/note fields set
    for (const d of g.state.depots) delete d.name;
    for (const ind of g.state.industries) delete ind.text;
    for (const t of g.state.towns) delete t.text;
    const s2 = parseState(serializeState(g.state));
    expect(s2).toBeTruthy();
    expect(s2.stations.length).toBeGreaterThan(0);
    expect(s2.vehicles.length).toBeGreaterThan(0);
    expect(s2.towns.length).toBeGreaterThan(0);
    // lazy fields remain absent
    for (const d of s2.depots) expect(d.name).toBeUndefined();
  });
  test('stripped/legacy payload with no text fields round-trips', () => {
    const g = flatGame(23); placeIndustry(g.state, 'coal_mine', 10, 20);
    const raw = JSON.parse(serializeState(g.state));
    // simulate old save: no industry/town text, no depot name
    for (const ind of raw.industries || []) delete ind.text;
    for (const t of raw.towns || []) delete t.text;
    for (const d of raw.depots || []) delete d.name;
    const s2 = parseState(JSON.stringify(raw));
    expect(s2.industries[0].text).toBeUndefined();
    expect(s2.towns[0].text).toBeUndefined();
  });
});
