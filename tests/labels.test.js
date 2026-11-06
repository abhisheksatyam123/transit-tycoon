import { test, expect, describe, beforeEach } from 'bun:test';
import { townSignText, signRect, rectInView, pointInRect, stationSignsVisible, stationSignStyle, loadLabelPrefs, setLabelPref, resetLabelPrefsCache, LABEL_KEY, STATION_SIGN_MIN_ZOOM, SIGN_GAP } from '../js/renderer/labels.js';
import { labelAt } from '../js/renderer/layers/labels.js';

describe('map name signs (labels)', () => {
  beforeEach(() => { resetLabelPrefsCache(); globalThis.localStorage = undefined; });

  test('town text adds population from zoom 1 only', () => {
    expect(townSignText('Oakford', 1234.4, 0.5)).toBe('Oakford');
    expect(townSignText('Oakford', 1234.4, 1)).toBe('Oakford (1234)');
    expect(townSignText('Oakford', undefined, 2)).toBe('Oakford (0)');
  });

  test('sign sits centred above the anchor with a gap', () => {
    const r = signRect(100, 50, 40, 18);
    expect(r).toEqual({ x: 80, y: 50 - SIGN_GAP - 18, w: 40, h: 18 });
    expect(pointInRect(100, 30, r)).toBe(true);
    expect(pointInRect(10, 30, r)).toBe(false);
  });

  test('culling: boxes fully outside the viewport (with margin) are dropped', () => {
    expect(rectInView({ x: -50, y: 10, w: 40, h: 10 }, 800, 600)).toBe(false);
    expect(rectInView({ x: -50, y: 10, w: 40, h: 10 }, 800, 600, 20)).toBe(true);
    expect(rectInView({ x: 790, y: 590, w: 40, h: 40 }, 800, 600)).toBe(true);
    expect(rectInView({ x: 900, y: 0, w: 10, h: 10 }, 800, 600)).toBe(false);
  });

  test('station signs hidden far out, shown from the threshold', () => {
    expect(stationSignsVisible(STATION_SIGN_MIN_ZOOM - 0.01)).toBe(false);
    expect(stationSignsVisible(STATION_SIGN_MIN_ZOOM)).toBe(true);
  });

  test('station colour: player vs rival', () => {
    const rival = { id: 7, colour: '#2b7fd9' };
    const state = { company: { name: 'me' }, rivals: [rival] };
    expect(stationSignStyle(state, { id: 1 }).rival).toBe(false);
    const rs = stationSignStyle(state, { id: 2, ownerId: 7 });
    expect(rs.rival).toBe(true);
    expect(rs.fill).toBe('#2b7fd9');
  });

  test('labelAt returns the topmost sign under the point', () => {
    const hits = [{ kind: 'town', id: 1, x: 0, y: 0, w: 100, h: 20 }, { kind: 'station', id: 2, x: 50, y: 5, w: 40, h: 10 }];
    expect(labelAt(hits, 60, 10)).toEqual({ kind: 'station', id: 2 });
    expect(labelAt(hits, 10, 10)).toEqual({ kind: 'town', id: 1 });
    expect(labelAt(hits, 300, 300)).toBe(null);
    expect(labelAt(undefined, 1, 1)).toBe(null);
  });

  test('prefs default ON and persist per toggle', () => {
    expect(loadLabelPrefs()).toEqual({ towns: true, stations: true });
    setLabelPref('stations', false);
    expect(loadLabelPrefs()).toEqual({ towns: true, stations: false });
    resetLabelPrefsCache();
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    setLabelPref('towns', false);
    expect(JSON.parse(store.get(LABEL_KEY))).toEqual({ towns: false, stations: true });
    resetLabelPrefsCache();
    expect(loadLabelPrefs()).toEqual({ towns: false, stations: true });
    globalThis.localStorage = undefined;
  });
});
