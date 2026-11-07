// TY5: toyland vehicles (OpenTTD toyland engines). Toyland games list toyland models per class and cargo; temperate
// games list none of them; every toyland model's image index resolves to packed sprites in the toyland view.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Game } from '../js/simulation/game.js';
import { listModels } from '../js/simulation/queries.js';
import { ALL_VEHICLE_MODELS, MODEL_BY_ID } from '../js/config/vehicles.js';
import { TOYLAND_VEH_ART, toylandVehicleSpriteId, toylandVehicleSprites, TOYLAND_VEH_KEY } from '../js/renderer/pack/toyland_vehicles.js';
import { TOYLAND_OVERRIDE_MAP, buildToylandView } from '../js/renderer/pack/toyland.js';

const manifest = JSON.parse(readFileSync(new URL('../assets/opengfx/toyland/manifest.json', import.meta.url), 'utf8'));
const TOY_TRUCK_CARGOS = ['SWEETS', 'SUGAR', 'TOYS', 'BATTERIES', 'CANDYFLOSS', 'TOFFEE', 'COLA', 'BUBBLES', 'PLASTIC', 'FIZZY_DRINKS'];
const TOY_MODEL_IDS = ALL_VEHICLE_MODELS.filter((m) => m.optIn === 'toyland').map((m) => m.id);
const BUS_LOCO_IDS = ['bus_ploddy1', 'bus_ploddy2', 'bus_ploddy3', 'eng_ploddy_choo', 'eng_powernaut_choo', 'eng_mighty_choo', 'eng_powernaut_diesel', 'eng_ploddy_diesel'];

function game(climate, year) {
  const g = Game.create({ seed: 4, width: 64, height: 64, townCount: 4, mapgen: { climate } });
  g.state.date.year = year;
  return g;
}

describe('toyland vehicles', () => {
  test('toyland game lists toyland buses and locos, and every truck and wagon cargo has a toyland model', () => {
    const g = game('toyland', 1980); // MkI (to 1982), MkII, Powernaut Diesel 1977: all purchasable
    const bus = listModels(g.state, 'bus').map((m) => m.id);
    expect(bus).toEqual(expect.arrayContaining(['bus_ploddy1', 'bus_ploddy2']));
    expect(bus).not.toContain('bus_city');
    expect(bus).not.toContain('bus_express');
    expect(bus).not.toContain('bus_ploddy3'); // not until 2010
    const eng = listModels(g.state, 'engine').map((m) => m.id);
    expect(eng).toEqual(expect.arrayContaining(['eng_ploddy_choo', 'eng_powernaut_choo', 'eng_mighty_choo', 'eng_powernaut_diesel', 'eng_ploddy_diesel']));
    const trucks = listModels(g.state, 'truck');
    for (const c of TOY_TRUCK_CARGOS) expect(trucks.some((m) => m.cargos && m.cargos.includes(c) && m.optIn === 'toyland')).toBe(true);
    const wagons = listModels(g.state, 'wagon');
    for (const c of TOY_TRUCK_CARGOS) expect(wagons.some((m) => m.cargos && m.cargos.includes(c))).toBe(true);
  });

  test('temperate, arctic and tropic games list no toyland model, and keep the temperate buses and locos', () => {
    for (const climate of ['temperate', 'arctic', 'tropic']) {
      const g = game(climate, 2000);
      const ids = ['bus', 'engine', 'truck', 'wagon', 'aircraft', 'ship'].flatMap((k) => listModels(g.state, k).map((m) => m.id));
      for (const id of TOY_MODEL_IDS) expect(ids).not.toContain(id);
      expect(listModels(g.state, 'bus').map((m) => m.id)).toContain('bus_modern');
      expect(listModels(g.state, 'engine').map((m) => m.id)).toContain('eng_arrow');
    }
  });

  test('toyland hides temperate buses and locos once toyland models are purchasable', () => {
    const early = game('toyland', 1930);
    expect(listModels(early.state, 'bus').map((m) => m.id)).toContain('bus_city'); // no toyland bus yet: fallback
    const mid = game('toyland', 1960); // Ploddyphut Choo-Choo (1946): temperate Comet hidden
    expect(listModels(mid.state, 'engine').map((m) => m.id)).not.toContain('eng_comet');
    expect(listModels(mid.state, 'engine').map((m) => m.id)).toContain('eng_ploddy_choo');
    const late = game('toyland', 2000);
    expect(listModels(late.state, 'bus').map((m) => m.id)).not.toContain('bus_modern');
    expect(listModels(late.state, 'engine').map((m) => m.id)).not.toContain('eng_arrow');
    // every class/cargo stays buyable (wagons keep the temperate coach/mail/hopper set)
    expect(listModels(late.state, 'wagon').map((m) => m.id)).toEqual(expect.arrayContaining(['wag_coach', 'wag_mail', 'wag_hopper']));
  });

  test('every toyland model has OpenTTD-style stats and an intro year', () => {
    for (const id of TOY_MODEL_IDS) {
      const m = MODEL_BY_ID[id];
      if (m.kind === 'wagon') continue; // wagons have no speed
      expect(m.name.length).toBeGreaterThan(3);
      expect(m.speed).toBeGreaterThan(0);
      expect(m.cost).toBeGreaterThan(0);
      expect(m.introYear).toBeGreaterThanOrEqual(1900);
    }
  });

  test('every toyland vehicle model resolves to packed sprites in the toyland view', () => {
    const have = new Set(Object.keys(manifest.sprites));
    for (const id of Object.keys(TOYLAND_VEH_ART)) {
      for (const dir of [0, 1, 2, 3, 4, 5, 6, 7]) for (const loaded of [false, true]) {
        const k = toylandVehicleSpriteId(id, dir, loaded);
        expect(k).toBeGreaterThanOrEqual(TOYLAND_VEH_KEY);
        expect(have.has(String(k))).toBe(true);
      }
    }
    for (const t of toylandVehicleSprites()) expect(have.has(String(TOYLAND_VEH_KEY + t))).toBe(true);
  });

  test('toyland view points the vehicle keys at toyland atlases only (base pack untouched)', () => {
    const base = { sprites: { 1: [0, 0, 0, 1, 1, 0, 0, 0] }, groups: {}, atlases: [{}], masks: [], tint: new Map() };
    const toy = { sprites: manifest.sprites, atlases: [{}, {}], masks: [] };
    const view = buildToylandView(base, toy);
    const k = String(toylandVehicleSpriteId('trk_sugar', 0, false));
    expect(view.sprites[k]).toBeDefined();
    expect(view.sprites[k][0]).toBeGreaterThanOrEqual(base.atlases.length);
    expect(base.sprites[k]).toBeUndefined();
    expect(TOYLAND_OVERRIDE_MAP.size).toBeGreaterThan(0);
  });
});
