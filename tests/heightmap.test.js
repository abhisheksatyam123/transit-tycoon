// Heightmap import: OpenTTD greyscale, stretch to map size, height levels, generator integration.
import { test, expect, describe } from 'bun:test';
import { rgbToGrey, greyscaleFromPixels, resampleGrey, greyToHeight, greyToHeights, heightsForMap, HEIGHTMAP_LEVELS } from '../js/simulation/heightmap.js';
import { createMap, generateTerrainFromHeights, limitSlopes } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { Game } from '../js/simulation/game.js';

/** Radial gradient: white at the centre, black at the edge (a mountain). */
function radial(w, h) {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x + 0.5) / w - 0.5, dy = (y + 0.5) / h - 0.5;
    g[y * w + x] = Math.round(255 * Math.max(0, 1 - Math.hypot(dx, dy) * 2.2));
  }
  return g;
}

describe('greyscale (OpenTTD RGBToGreyscale)', () => {
  test('weights and integer division', () => {
    expect(rgbToGrey(0, 0, 0)).toBe(0);
    expect(rgbToGrey(255, 255, 255)).toBe(255);
    expect(rgbToGrey(255, 0, 0)).toBe(Math.floor(255 * 19595 / 65536));
    expect(rgbToGrey(0, 255, 0)).toBe(Math.floor(255 * 38470 / 65536));
    expect(rgbToGrey(0, 0, 255)).toBe(Math.floor(255 * 7471 / 65536));
  });
  test('RGBA pixels convert per pixel', () => {
    const px = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(Array.from(greyscaleFromPixels(px, 2, 1, 4))).toEqual([0, 255]);
  });
});

describe('heights', () => {
  test('0 stays sea, 1..255 scale onto 1..levels', () => {
    expect(greyToHeight(0)).toBe(0);
    expect(greyToHeight(1)).toBe(1);
    expect(greyToHeight(255)).toBe(HEIGHTMAP_LEVELS);
    let prev = 0;
    for (let g = 0; g <= 255; g++) {
      const h = greyToHeight(g);
      expect(h).toBeGreaterThanOrEqual(prev);
      expect(h).toBeLessThanOrEqual(HEIGHTMAP_LEVELS);
      prev = h;
    }
  });
  test('gradient image -> monotone heights (brighter = higher, never sea)', () => {
    const w = 64, grey = new Uint8Array(w);
    for (let x = 0; x < w; x++) grey[x] = Math.round(x * 255 / (w - 1));
    const hs = greyToHeights(grey);
    for (let x = 1; x < w; x++) expect(hs[x]).toBeGreaterThanOrEqual(hs[x - 1]);
    expect(hs[w - 1]).toBe(HEIGHTMAP_LEVELS);
    expect(hs[0]).toBe(0);
  });
  test('all black -> all water', () => {
    const hs = heightsForMap(new Uint8Array(20 * 20), 20, 20, 32, 32);
    expect(hs.every((h) => h === 0)).toBe(true);
  });
});

describe('resampling', () => {
  test('stretches to the map size (nearest sample)', () => {
    const grey = new Uint8Array([10, 20, 30, 40]); // 2x2
    const out = resampleGrey(grey, 2, 2, 4, 4);
    expect(out.length).toBe(16);
    expect(out[0]).toBe(10); expect(out[3]).toBe(20);
    expect(out[12]).toBe(30); expect(out[15]).toBe(40);
  });
  test('downsampling keeps corners', () => {
    const img = radial(200, 100);
    const out = resampleGrey(img, 200, 100, 16, 16);
    expect(out.length).toBe(256);
    expect(out[0]).toBe(img[0]);
    expect(out[255]).toBe(img[99 * 200 + 199]);
  });
  test('size mismatch throws', () => {
    expect(() => resampleGrey(new Uint8Array(3), 2, 2, 4, 4)).toThrow();
  });
});

describe('generator integration', () => {
  const W = 48;
  const mountain = () => heightsForMap(radial(128, 128), 128, 128, W, W);

  test('mountain image -> peak in the middle, water at the corners, slopes limited', () => {
    const m = createMap(W, W);
    generateTerrainFromHeights(m, makeRng(3), mountain());
    const c = m.tiles[(W >> 1) * W + (W >> 1)];
    expect(c.height).toBeGreaterThanOrEqual(5);
    expect(m.tiles[0].terrain).toBe('water');
    expect(m.tiles[0].height).toBe(0);
    let worst = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const t = m.tiles[y * W + x];
      if (t.terrain === 'water') continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const n = m.tiles[(y + dy) * W + x + dx];
        if (n) worst = Math.max(worst, Math.abs(t.height - n.height));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  test('deterministic for the same image and seed', () => {
    const sig = (seed) => {
      const m = createMap(W, W);
      generateTerrainFromHeights(m, makeRng(seed), mountain());
      return m.tiles.map((t) => t.height + t.terrain).join(',');
    };
    expect(sig(5)).toBe(sig(5));
  });

  test('Game.create with a heightmap builds a world; state keeps no heightmap field', () => {
    const hm = heightsForMap(radial(64, 64), 64, 64, 64, 64);
    const game = Game.create({ seed: 9, width: 64, height: 64, townCount: 3, industryCount: 4, startYear: 1950, heightmap: hm });
    expect(game.state.map.tiles.length).toBe(64 * 64);
    expect(game.state.map.tiles[0].terrain).toBe('water');
    expect(Object.keys(game.state).includes('heightmap')).toBe(false);
  });

  test('size mismatch falls back to the generated map (no crash)', () => {
    const game = Game.create({ seed: 9, width: 64, height: 64, townCount: 1, industryCount: 1, startYear: 1950, heightmap: new Uint8Array(10) });
    expect(game.state.map.tiles.length).toBe(64 * 64);
  });

  test('limitSlopes is reused: an uneven input is flattened to within 1 level', () => {
    const m = createMap(4, 1);
    m.tiles[0].height = 7; m.tiles[1].height = 1; m.tiles[2].height = 1; m.tiles[3].height = 1;
    limitSlopes(m, 1);
    expect(m.tiles[0].height).toBeLessThanOrEqual(m.tiles[1].height + 1);
  });
});
