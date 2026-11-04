// OpenGFX vehicle sprite lookup (js/renderer/pack/vehicles.js). Ported from OpenTTD (GPL-2.0).
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  vehicleSpriteId, dirFromBit, dirFromAng, dirFromVec, railSpriteId, roadSpriteId, RAIL_IMG, ROAD_IMG, AIR_IMG,
} from '../js/renderer/pack/vehicles.js';

const manifest = JSON.parse(readFileSync(new URL('../assets/opengfx/manifest.json', import.meta.url), 'utf8'));
const ids = (kind, model, opt) => [0, 1, 2, 3, 4, 5, 6, 7].map((d) => vehicleSpriteId(kind, model, d, opt));

test('every vehicle sprite exists in the OpenGFX manifest for all 8 directions', () => {
  const cases = [
    ['loco', 'eng_puffer'], ['loco', 'eng_comet'], ['loco', 'eng_thunder'], ['loco', 'eng_arrow'], ['loco', 'eng_bolt'],
    ['wagon', 'wag_coach'], ['wagon', 'wag_mail'], ['wagon', 'wag_hopper'], ['wagon', 'wag_tanker'],
    ['wagon', 'wag_flat'], ['wagon', 'wag_box'], ['wagon', 'wag_cattle'],
    ['bus', 'bus_city'], ['bus', 'bus_express'], ['bus', 'bus_modern'],
    ['truck', 'trk_mail'], ['truck', 'trk_bulk'], ['truck', 'trk_tanker'], ['truck', 'trk_log'],
    ['truck', 'trk_goods'], ['truck', 'trk_steel'], ['truck', 'trk_cattle'], ['truck', 'trk_heavy'],
    ['car', ''], ['air', 'ac_li2'], ['air', 'ac_il14'], ['air', 'ac_tu104'], ['air', 'ac_tu134'],
    ['air', 'ac_il86'], ['air', 'ac_b777'], ['air', 'ac_a320'], ['air', 'ac_ssj100'],
  ];
  for (const [kind, model] of cases) {
    for (const loaded of [false, true]) {
      for (const id of ids(kind, model, { loaded, id: 3, cargo: 'COAL' })) {
        expect(id, `${kind} ${model}`).toBeDefined();
        expect(manifest.sprites[id], `${kind} ${model} sprite ${id}`).toBeDefined();
      }
    }
  }
});

test('the eight directions give eight distinct sprites for each model', () => {
  for (const [kind, model] of [['loco', 'eng_comet'], ['bus', 'bus_city'], ['air', 'ac_a320']]) {
    expect(new Set(ids(kind, model)).size).toBe(8);
  }
});

test('axis headings map to the OpenTTD compass like the lead spec (N=NE, E=SE, S=SW, W=NW)', () => {
  // our travel bit: N=1 (y-1), E=2 (x+1), S=4 (y+1), W=8 (x-1)
  expect(dirFromBit(1)).toBe(1);
  expect(dirFromBit(2)).toBe(3);
  expect(dirFromBit(4)).toBe(5);
  expect(dirFromBit(8)).toBe(7);
  // vectors and angles agree with the bit mapping
  expect(dirFromVec(0, -1)).toBe(1);
  expect(dirFromVec(1, 0)).toBe(3);
  expect(dirFromVec(0, 1)).toBe(5);
  expect(dirFromVec(-1, 0)).toBe(7);
  expect(dirFromAng(-Math.PI / 2)).toBe(1);
  expect(dirFromAng(0)).toBe(3);
  expect(dirFromAng(Math.PI / 2)).toBe(5);
  expect(dirFromAng(Math.PI)).toBe(7);
});

test('rail and road sprite formulas follow OpenTTD (direction add/and, full adder)', () => {
  // Chaney 'Jubilee' (image 0): _engine_sprite_base 0x0B59 + ((dir + add) & and), add 0 & and 7 for dir 0
  expect(railSpriteId(0, 0, false)).toBe(0x0b59);
  expect(railSpriteId(0, 3, false)).toBe(0x0b59 + 3);
  // road: _roadveh_images[0] = 0xCD4 with dir offset, loaded adds _roadveh_full_adder[0] = 0
  expect(roadSpriteId(0, 2, false)).toBe(0xcd4 + 2);
  expect(roadSpriteId(17, 0, false)).toBe(0xc14);
});

test('models resolve to OpenTTD image indices (engines.h)', () => {
  expect(RAIL_IMG.eng_puffer).toBe(2); // Ploddyphut Choo-Choo
  expect(RAIL_IMG.eng_comet).toBe(0); // Chaney 'Jubilee'
  expect(ROAD_IMG.bus_city).toBe(17); // Foster Bus
  expect(AIR_IMG.ac_li2).toBe(0); // Coleman Count
});
