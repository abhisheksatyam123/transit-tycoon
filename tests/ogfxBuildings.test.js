// OpenGFX houses and industries: every mapped sprite exists in the manifest; mapping is deterministic.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { HOUSE_TABLE, INDUSTRY_LAYOUTS, INDUSTRY_GFX } from '../js/renderer/pack/ottd_tables.js';
import { houseSprites, HOUSE_POOLS } from '../js/renderer/pack/houses.js';
import { industryLayout, INDUSTRY_OTTD } from '../js/renderer/pack/industries.js';

const dir = new URL('../assets/opengfx/', import.meta.url).pathname;
const man = JSON.parse(readFileSync(dir + 'manifest.json', 'utf8'));
const has = (id) => !!man.sprites[id];

test('every house pool sprite (ground and building, all hashes) exists in the manifest', () => {
  for (const pool of Object.values(HOUSE_POOLS)) {
    for (const id of pool) {
      const h = HOUSE_TABLE[id];
      expect(h).toBeDefined();
      for (const [g, b] of h.pairs) {
        if (g) expect(has(g)).toBe(true);
        if (b) expect(has(b)).toBe(true);
      }
    }
  }
});

test('every industry layout gfx and its sprites exist in the manifest', () => {
  for (const variants of Object.values(INDUSTRY_LAYOUTS)) {
    for (const v of variants) for (const [, , g] of v) {
      expect(INDUSTRY_GFX[g]).toBeDefined();
      const [ground, bld] = INDUSTRY_GFX[g];
      if (ground) expect(has(ground)).toBe(true);
      if (bld) expect(has(bld)).toBe(true);
    }
  }
});

test('house selection is deterministic and returns manifest sprites', () => {
  const styles = [undefined, 'cottage', 'historic', 'panel', 'stalinka', 'modern', 'mall', 'warehouse'];
  for (const style of styles) {
    for (let lv = 1; lv <= 4; lv++) {
      for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) {
        const b = { level: lv, style };
        const a = houseSprites(b, x, y, 2000);
        const c = houseSprites(b, x, y, 2000);
        expect(a).toEqual(c);
        expect(a).not.toBeNull();
        expect(has(a[1])).toBe(true);
      }
    }
  }
});

test('industry layouts cover the footprint and are deterministic', () => {
  for (const [typeId, fam] of Object.entries(INDUSTRY_OTTD)) {
    const sizes = [[3, 3], [4, 3], [3, 2], [4, 4]];
    for (const [w, h] of sizes) {
      const a = industryLayout(typeId, w, h, 7);
      const b = industryLayout(typeId, w, h, 7);
      expect(a === null ? null : [...a.entries()]).toEqual(b === null ? null : [...b.entries()]);
      if (a === null) continue; // no same-size OpenTTD layout: drawn procedurally
      expect(a.size).toBe(w * h);
      for (const [key, g] of a) {
        const [dx, dy] = key.split(',').map(Number);
        expect(dx).toBeLessThan(w);
        expect(dy).toBeLessThan(h);
        expect(INDUSTRY_GFX[g]).toBeDefined();
      }
    }
  }
});
