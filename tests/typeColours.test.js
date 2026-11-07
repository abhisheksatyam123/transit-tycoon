/** Per-vehicle-type colour scheme: lazy company.typeColours, validation, save/load, renderer precedence (group > type > company). */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { COMPANY_COLOURS } from '../js/simulation/companyColour.js';
import { typeColourMap, groupColourMap, vehicleColourOverride, typeOfVehicle } from '../js/renderer/groupLivery.js';

function setup() {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const gr = g.createGroup('Coal');
  expect(gr.ok).toBe(true);
  return { g, v: r.vehicle, gid: gr.group.id };
}

describe('type colour scheme', () => {
  test('default: no typeColours key, no rev, no map (lazy)', () => {
    const { g } = setup();
    expect(g.state.company.typeColours).toBeUndefined();
    expect(g.state.company.typeColourRev).toBeUndefined();
    expect(typeColourMap(g.state)).toBeNull();
  });

  test('set and clear; the map is deleted when empty', () => {
    const { g } = setup();
    expect(g.setTypeColour('road', '#ff69b4').ok).toBe(true);
    expect(g.state.company.typeColours).toEqual({ road: '#ff69b4' });
    expect(g.setTypeColour('rail', '#ABCDEF').ok).toBe(true);
    expect(g.state.company.typeColours.rail).toBe('#abcdef');
    expect(g.setTypeColour('road', null).ok).toBe(true);
    expect(g.setTypeColour('rail', '').ok).toBe(true);
    expect(g.state.company.typeColours).toBeUndefined();
    expect(typeColourMap(g.state)).toBeNull();
  });

  test('validation: unknown type, bad hex and rival owner are refused; state unchanged', () => {
    const { g } = setup();
    expect(g.setTypeColour('boat', '#ff0000').ok).toBe(false);
    expect(g.setTypeColour('rail', 'red').ok).toBe(false);
    expect(g.setTypeColour('rail', '#fff').ok).toBe(false);
    expect(g.setTypeColour('rail', '#12345g').ok).toBe(false);
    expect(g.setTypeColour('rail', '#ff0000', { owner: 3 }).ok).toBe(false);
    expect(g.setTypeColour('rail', '#ff0000', { dryRun: true }).ok).toBe(true);
    expect(g.state.company.typeColours).toBeUndefined();
  });

  test('save/load round-trip keeps the scheme; old saves (no key) load with no map', () => {
    const { g } = setup();
    g.setTypeColour('air', '#00aa55');
    const s2 = parseState(serializeState(g.state));
    expect(s2.company.typeColours).toEqual({ air: '#00aa55' });
    expect(typeColourMap(s2).air).toBe('#00aa55');
    const s3 = parseState(serializeState(flatGame(33).state));
    expect(s3.company.typeColours).toBeUndefined();
    expect(typeColourMap(s3)).toBeNull();
  });

  test('type of vehicle: train->rail, tram->tram, bus/truck->road, aircraft->air, ship->ship', () => {
    expect(typeOfVehicle({ kind: 'train' })).toBe('rail');
    expect(typeOfVehicle({ kind: 'road', roadType: 'tram' })).toBe('tram');
    expect(typeOfVehicle({ kind: 'road', roadType: 'road' })).toBe('road');
    expect(typeOfVehicle({ kind: 'road' })).toBe('road');
    expect(typeOfVehicle({ kind: 'aircraft' })).toBe('air');
    expect(typeOfVehicle({ kind: 'ship' })).toBe('ship');
  });

  test('precedence: group colour beats type colour, type beats company (undefined); rivals never take it', () => {
    const { g, v, gid } = setup();
    g.setTypeColour('rail', '#ff0000');
    const tm = typeColourMap(g.state);
    expect(vehicleColourOverride(v, null, tm)).toBe('#ff0000');
    expect(g.setGroupColour(gid, COMPANY_COLOURS[7].hex).ok).toBe(true);
    const gm = groupColourMap(g.state);
    v.groupId = gid;
    expect(vehicleColourOverride(v, gm, tm)).toBe(gm.get(gid)); // group wins
    v.groupId = undefined;
    expect(vehicleColourOverride(v, gm, tm)).toBe('#ff0000');
    const rival = { ...v, ownerId: 2, groupId: gid };
    expect(vehicleColourOverride(rival, gm, tm)).toBeUndefined();
    expect(vehicleColourOverride({ kind: 'road', roadType: 'road' }, gm, tm)).toBeUndefined();
  });

  test('map is cached: same object until the scheme changes', () => {
    const { g } = setup();
    g.setTypeColour('ship', '#112233');
    const m1 = typeColourMap(g.state);
    expect(typeColourMap(g.state)).toBe(m1);
    g.setTypeColour('ship', '#445566');
    expect(typeColourMap(g.state).ship).toBe('#445566');
    g.setTypeColour('ship', null);
    expect(typeColourMap(g.state)).toBeNull();
  });
});
