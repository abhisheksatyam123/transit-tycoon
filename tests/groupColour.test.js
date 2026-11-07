/** Group livery (OpenTTD CmdSetGroupLivery, primary colour): owner-checked command, palette validation, lazy storage, save round-trip, renderer lookup cache. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { COMPANY_COLOURS } from '../js/simulation/companyColour.js';
import { groupColourMap } from '../js/renderer/groupLivery.js';

function setup() {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const gr = g.createGroup('Coal');
  expect(gr.ok).toBe(true);
  return { g, L, v: r.vehicle, gid: gr.group.id };
}

describe('group colour', () => {
  test('default: group has no colour key, no rev, no map (lazy)', () => {
    const { g, gid } = setup();
    expect(g.state.company.groups[0].colour).toBeUndefined();
    expect(g.state.company.groupColourRev).toBeUndefined();
    expect(groupColourMap(g.state)).toBeNull();
    expect(gid).toBeGreaterThan(0);
  });

  test('set a palette colour; unknown colour, unknown group and rival owner are refused', () => {
    const { g, gid } = setup();
    const hex = COMPANY_COLOURS[5].hex;
    expect(g.setGroupColour(gid, hex).ok).toBe(true);
    expect(g.state.company.groups[0].colour).toBe(hex);
    expect(g.setGroupColour(gid, '#123456').ok).toBe(false);
    expect(g.setGroupColour(999, hex).ok).toBe(false);
    expect(g.setGroupColour(gid, hex.toUpperCase(), { owner: 3 }).ok).toBe(false);
    expect(g.setGroupColour(gid, null, { owner: 3 }).ok).toBe(false);
    expect(g.state.company.groups[0].colour).toBe(hex);
  });

  test('null resets to company colour (key removed); dryRun changes nothing', () => {
    const { g, gid } = setup();
    expect(g.setGroupColour(gid, COMPANY_COLOURS[0].hex, { dryRun: true }).ok).toBe(true);
    expect(g.state.company.groups[0].colour).toBeUndefined();
    g.setGroupColour(gid, COMPANY_COLOURS[0].hex);
    expect(g.setGroupColour(gid, null).ok).toBe(true);
    expect('colour' in g.state.company.groups[0]).toBe(false);
  });

  test('colour survives save/load and the renderer map follows the group', () => {
    const { g, gid } = setup();
    const hex = COMPANY_COLOURS[3].hex;
    g.setGroupColour(gid, hex);
    const s2 = parseState(serializeState(g.state));
    expect(s2.company.groups[0].colour).toBe(hex);
    const m = groupColourMap(s2);
    expect(m.get(gid)).toBe(hex);
  });

  test('map is rebuilt when colour changes or group is deleted (not per frame)', () => {
    const { g, gid } = setup();
    const m1 = groupColourMap(g.state);
    expect(m1).toBeNull();
    g.setGroupColour(gid, COMPANY_COLOURS[2].hex);
    const m2 = groupColourMap(g.state);
    expect(m2.get(gid)).toBe(COMPANY_COLOURS[2].hex);
    expect(groupColourMap(g.state)).toBe(m2); // unchanged: same object, no rebuild
    g.setGroupColour(gid, COMPANY_COLOURS[4].hex);
    expect(groupColourMap(g.state).get(gid)).toBe(COMPANY_COLOURS[4].hex);
    g.deleteGroup(gid);
    expect(groupColourMap(g.state)).toBeNull();
  });
});
