import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { RIVAL_OWNED } from '../js/simulation/owner.js';
import { ISSUE_COMMANDS } from '../js/ui/app.js';
import { findStation } from '../js/simulation/state.js';

describe('moveStationSign', () => {
  test('move sign to tile in st.tiles', () => {
    const g = flatGame(23); const L = coalLine(g);
    const t = L.a.tiles.find((t) => !(t.x === L.a.x && t.y === L.a.y));
    const r = g.moveStationSign(L.a.id, t.x, t.y);
    expect(r.ok).toBe(true);
    const st = findStation(g.state, L.a.id);
    expect(st.signTile).toEqual({ x: t.x, y: t.y });
  });
  test('move back to st.x,st.y deletes lazy signTile', () => {
    const g = flatGame(23); const L = coalLine(g);
    const t = L.a.tiles.find((t) => !(t.x === L.a.x && t.y === L.a.y));
    g.moveStationSign(L.a.id, t.x, t.y);
    expect(g.moveStationSign(L.a.id, L.a.x, L.a.y).ok).toBe(true);
    expect('signTile' in findStation(g.state, L.a.id)).toBe(false);
  });
  test('reject tile outside st.tiles', () => {
    const g = flatGame(23); const L = coalLine(g);
    const r = g.moveStationSign(L.a.id, L.a.x + 50, L.a.y + 50);
    expect(r.ok).toBe(false); expect(r.error).toBe('Tile is not part of this station');
    expect(g.moveStationSign(99999, L.a.x, L.a.y).ok).toBe(false);
  });
  test('rival owned rejected', () => {
    const g = flatGame(23); const L = coalLine(g); L.a.ownerId = 'rival1';
    const t = L.a.tiles.find((t) => !(t.x === L.a.x && t.y === L.a.y));
    const r = g.moveStationSign(L.a.id, t.x, t.y, { companyId: 'rival' });
    expect(r.ok).toBe(false); expect(r.error).toBe(RIVAL_OWNED);
  });
  test('game method and ISSUE_COMMANDS', () => {
    expect(typeof flatGame(23).moveStationSign).toBe('function');
    expect(ISSUE_COMMANDS).toContain('moveStationSign');
  });
  test('save/load round-trip preserves signTile', () => {
    const g = flatGame(23); const L = coalLine(g);
    const t = L.a.tiles.find((t) => !(t.x === L.a.x && t.y === L.a.y));
    g.moveStationSign(L.a.id, t.x, t.y);
    const s2 = parseState(serializeState(g.state));
    expect(s2.stations.find((s) => s.id === L.a.id).signTile).toEqual({ x: t.x, y: t.y });
  });
});
