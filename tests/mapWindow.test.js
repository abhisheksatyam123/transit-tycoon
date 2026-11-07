/** Map window pure helpers: layout, pixel -> tile, tile colours per mode, industry legend, viewport. */
import { test, expect, describe } from 'bun:test';
import { mapLayout, pixelToTile, tileRgb, industryLegend, viewportTiles, contourFactor, MAP_MODES, VEHICLE_COLORS, BASE_TTL_MS } from '../js/ui/windows/map.js';
import { MINIMAP } from '../js/renderer/palette.js';

describe('map window helpers', () => {
  test('layout fits the whole map and centres it', () => {
    const l = mapLayout(600, 400, 457, 663);
    expect(l.s * 663).toBeLessThanOrEqual(400 + 1e-6);
    expect(l.s * 457).toBeLessThanOrEqual(600 + 1e-6);
    expect(l.ox).toBeGreaterThan(0);
    expect(l.oy).toBeCloseTo(0, 6);
  });

  test('pixel to tile round-trips and rejects outside the map', () => {
    const l = mapLayout(300, 300, 100, 100);
    expect(pixelToTile(l.ox + 0.5 * l.s, l.oy + 0.5 * l.s, l, 100, 100)).toEqual({ x: 0, y: 0 });
    expect(pixelToTile(l.ox + 99.5 * l.s, l.oy + 50.5 * l.s, l, 100, 100)).toEqual({ x: 99, y: 50 });
    expect(pixelToTile(-5, -5, l, 100, 100)).toBe(null);
    expect(pixelToTile(l.ox + 100.5 * l.s, 1, l, 100, 100)).toBe(null);
  });

  test('tile colours per mode', () => {
    const tile = { terrain: 'grass', height: 0, rail: 0, road: 0, building: null };
    expect(tileRgb(tile, 'terrain')).toEqual(tileRgb(tile, 'terrain'));
    const ind = new Map([[7, '#123456']]);
    const mine = { terrain: 'grass', building: { type: 'industry', industryId: 7 } };
    expect(tileRgb(mine, 'industries', ind)).toEqual([0x12, 0x34, 0x56]);
    const rail = { terrain: 'grass', rail: 1 };
    expect(tileRgb(rail, 'routes')).toEqual([0xc9, 0xa4, 0x6a]);
    expect(tileRgb({ terrain: 'water', building: null }, 'towns')[2]).toBeGreaterThan(0);
    expect(contourFactor(-100)).toBe(0.6);
    expect(contourFactor(100)).toBe(1.35);
  });

  test('industry legend lists only present types, in config order', () => {
    const leg = industryLegend([{ typeId: 'forest' }, { typeId: 'coal_mine' }, { typeId: 'coal_mine' }]);
    expect(leg.map((l) => l.id)).toEqual(['coal_mine', 'forest']);
    expect(leg[0].name).toBe('Coal Mine');
    expect(industryLegend([])).toEqual([]);
  });

  test('viewport maps to four tile-space corners', () => {
    const pts = viewportTiles({ x0: -64, y0: -32, x1: 64, y1: 32 });
    expect(pts.length).toBe(4);
    expect(pts[0].x).toBeCloseTo(-2, 6);
  });

  test('modes, vehicle colours and cache TTL are defined', () => {
    expect(MAP_MODES.map(([k]) => k)).toEqual(['terrain', 'industries', 'routes', 'vehicles', 'towns', 'owners', 'vegetation']);
    expect(VEHICLE_COLORS.train).toBeTruthy();
    expect(MINIMAP.viewport).toBeTruthy();
    expect(BASE_TTL_MS).toBeGreaterThan(0);
  });
});
