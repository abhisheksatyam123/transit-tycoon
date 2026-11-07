/** Per-vehicle paint (OpenLoco kPaintBrush): lazy v.colour, owner check, clear, precedence vehicle > group > type > company, save/load. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { COMPANY_COLOURS } from '../js/simulation/companyColour.js';
import { groupColourMap, typeColourMap, vehicleColourOverride } from '../js/renderer/groupLivery.js';

function setup() {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, v: r.vehicle };
}

describe('vehicle paint', () => {
  test('default: no colour key on the vehicle (lazy)', () => {
    const { v } = setup();
    expect(v.colour).toBeUndefined();
  });

  test('set, normalise case, clear deletes the key', () => {
    const { g, v } = setup();
    expect(g.setVehicleColour(v.id, '#FF8800').ok).toBe(true);
    expect(v.colour).toBe('#ff8800');
    expect(g.setVehicleColour(v.id, null).ok).toBe(true);
    expect(v.colour).toBeUndefined();
    g.setVehicleColour(v.id, '#00ff00');
    expect(g.setVehicleColour(v.id, '').ok).toBe(true);
    expect(v.colour).toBeUndefined();
  });

  test('validation: unknown vehicle, bad hex refused; dryRun does not change state', () => {
    const { g, v } = setup();
    expect(g.setVehicleColour(999999, '#ff0000').ok).toBe(false);
    expect(g.setVehicleColour(v.id, 'red').ok).toBe(false);
    expect(g.setVehicleColour(v.id, '#fff').ok).toBe(false);
    expect(g.setVehicleColour(v.id, '#ff0000', { dryRun: true }).ok).toBe(true);
    expect(v.colour).toBeUndefined();
  });

  test('rival vehicle is refused (owner check on the vehicle and on the opts)', () => {
    const { g, v } = setup();
    expect(g.setVehicleColour(v.id, '#ff0000', { owner: 3 }).ok).toBe(false);
    v.ownerId = 3;
    expect(g.setVehicleColour(v.id, '#ff0000').ok).toBe(false);
    expect(v.colour).toBeUndefined();
  });

  test('precedence: vehicle paint beats group and type; group beats type; type beats company', () => {
    const { g, v } = setup();
    const gr = g.createGroup('Coal');
    expect(gr.ok).toBe(true);
    g.addVehicleToGroup(v.id, gr.group.id);
    const GC = COMPANY_COLOURS[0].hex, GC2 = COMPANY_COLOURS[1].hex;
    expect(g.setGroupColour(gr.group.id, GC).ok).toBe(true);
    g.setTypeColour('rail', '#2ecc71');
    const gmap = groupColourMap(g.state);
    const tmap = typeColourMap(g.state);
    expect(vehicleColourOverride(v, gmap, tmap)).toBe(GC);
    g.setVehicleColour(v.id, '#0000ff');
    expect(v.colour).toBe('#0000ff');
    // renderer rule (renderer.js): paint first, else the group/type lookup
    const paint = (vv) => (vv.colour && vv.ownerId == null ? vv.colour : vehicleColourOverride(vv, gmap, tmap));
    expect(paint(v)).toBe('#0000ff');
    g.setVehicleColour(v.id, null);
    expect(paint(v)).toBe(GC);
    g.addVehicleToGroup(v.id, null);
    expect(paint(v)).toBe('#2ecc71');
    expect(GC2).not.toBe(GC);
  });

  test('save/load round-trip keeps the paint; old saves have no key', () => {
    const { g, v } = setup();
    g.setVehicleColour(v.id, '#123456');
    const s2 = parseState(serializeState(g.state));
    const v2 = s2.vehicles.find((x) => x.id === v.id);
    expect(v2.colour).toBe('#123456');
    const s3 = parseState(serializeState(flatGame(33).state));
    expect(s3.vehicles.every((x) => x.colour === undefined)).toBe(true);
  });
});
