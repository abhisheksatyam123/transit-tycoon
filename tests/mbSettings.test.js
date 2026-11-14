/** MB: maxBridgeLength / maxTunnelLength, townCouncilTolerance, feederPaymentShare as game settings. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { refusalAt, refuseBelow } from '../js/simulation/townAuthority.js';
import { transferCredit } from '../js/simulation/orders.js';
import { serializeState, parseState } from '../js/simulation/save.js';

/** Flat map with a valley on row 20 whose heads are at x=29 and x=29+span-1 (span tiles, heads included). */
function valley(span) {
  const g = flatGame();
  for (let x = 0; x < g.state.map.width; x++) for (let y = 0; y < g.state.map.height; y++) g.tile(x, y).height = 3;
  for (let x = 30; x < 29 + span - 1; x++) g.tile(x, 20).height = 1;
  return g;
}

describe('MB settings', () => {
  test('defaults keep current behaviour', () => {
    expect(DEFAULT_SETTINGS.maxBridgeLength).toBe(64);
    expect(DEFAULT_SETTINGS.maxTunnelLength).toBe(64);
    expect(DEFAULT_SETTINGS.townCouncilTolerance).toBe(0);
    expect(DEFAULT_SETTINGS.feederPaymentShare).toBe(75);
  });

  test('every new setting has window metadata', () => {
    for (const k of ['maxBridgeLength', 'maxTunnelLength', 'townCouncilTolerance', 'feederPaymentShare']) {
      expect(SETTING_META.some((m) => m.key === k && m.type === 'select')).toBe(true);
    }
  });

  test('bridge of 20 tiles refused at 12, allowed with maxBridgeLength 32', () => {
    const g = valley(20);
    setSetting(g.state, 'maxBridgeLength', 12);
    expect(g.buildLandBridge(29, 20, 48, 20).ok).toBe(false);
    setSetting(g.state, 'maxBridgeLength', 32);
    expect(g.buildLandBridge(29, 20, 48, 20).ok).toBe(true);
  });

  test('tunnel length is read from maxTunnelLength', () => {
    const hill = (x0, x1, y, h = 4) => { const g = flatGame(); for (let x = x0; x <= x1; x++) g.tile(x, y).height = h; return g; };
    const g = hill(30, 50, 24);
    for (const x of [30, 46]) g.tile(x, 24).height = 1; // 17-tile tunnel: portals low, interior high
    setSetting(g.state, 'maxTunnelLength', 16);
    expect(g.buildTunnel(30, 24, 46, 24).ok).toBe(false);
    setSetting(g.state, 'maxTunnelLength', 32);
    expect(g.buildTunnel(30, 24, 46, 24).ok).toBe(true);
  });

  test('tolerance changes the local authority threshold', () => {
    const g = flatGame();
    const s = g.state;
    const town = s.towns[0];
    town.x = 30; town.y = 20; town.companyRating = 100;
    expect(refuseBelow(s)).toBe(0);
    expect(refusalAt(s, 30, 20)).toBe(null); // lenient: rating 100 is fine
    town.companyRating = -100;
    expect(refusalAt(s, 30, 20)).not.toBe(null); // normal: below 0 refuses
    setSetting(s, 'townCouncilTolerance', 3);
    town.companyRating = -900;
    expect(refusalAt(s, 30, 20)).toBe(null); // permissive: never refuses
  });

  test('feeder share 50 gives a smaller transfer credit than 75', () => {
    const g = flatGame(11);
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    const v = r.vehicle;
    v.cargoId = 'COAL';
    v.load.amount = 20; v.load.sourceX = L.a.x; v.load.sourceY = L.a.y; v.load.sinceTick = 0; v.load.fromStationId = L.a.id;
    const c75 = transferCredit(g.state, v, L.b, 20, 0);
    setSetting(g.state, 'feederPaymentShare', 50);
    const c50 = transferCredit(g.state, v, L.b, 20, 0);
    expect(c50).toBeGreaterThan(0);
    expect(c50).toBeLessThan(c75);
    expect(Math.abs(c50 - Math.round((c75 * 50) / 75))).toBeLessThanOrEqual(1);
  });

  test('save/load keeps the new settings', () => {
    const g = flatGame();
    setSetting(g.state, 'maxBridgeLength', 40);
    setSetting(g.state, 'maxTunnelLength', 48);
    setSetting(g.state, 'townCouncilTolerance', 3);
    setSetting(g.state, 'feederPaymentShare', 25);
    const loaded = parseState(serializeState(g.state));
    expect(getSetting(loaded, 'maxBridgeLength')).toBe(40);
    expect(getSetting(loaded, 'maxTunnelLength')).toBe(48);
    expect(getSetting(loaded, 'townCouncilTolerance')).toBe(3);
    expect(getSetting(loaded, 'feederPaymentShare')).toBe(25);
  });

  test('old save without the keys falls back to defaults', () => {
    const g = flatGame();
    const loaded = parseState(serializeState(g.state));
    expect(getSetting(loaded, 'maxBridgeLength')).toBe(64);
    expect(getSetting(loaded, 'feederPaymentShare')).toBe(75);
  });
});
