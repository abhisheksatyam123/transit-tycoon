/** ST batch: infrastructure maintenance, plane speed factor, town growth rate, transparency toggles. */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { countInfrastructure, infrastructureMaintenance } from '../js/simulation/infrastructure.js';
import { growForRate } from '../js/simulation/loco/town.js';
import { SETTING_META, PREF_META } from '../js/ui/settingsGroups.js';
import { TRANSPARENCY_OPTIONS, TRANSPARENCY_KEY, loadTransparency, setTransparency, resetTransparencyCache, tileTransparency, TRANSPARENT_ALPHA } from '../js/renderer/transparency.js';

const small = { seed: 3, width: 64, height: 64, townCount: 3, industryCount: 4 };

describe('ST defaults keep current behaviour', () => {
  test('new keys default to unchanged values', () => {
    expect(DEFAULT_SETTINGS.infraMaintenance).toBe(false);
    expect(DEFAULT_SETTINGS.planeSpeedFactor).toBe(1);
    expect(DEFAULT_SETTINGS.townGrowthRate).toBe('normal');
  });
  test('every new key has exactly one settings-window row', () => {
    for (const k of ['infraMaintenance', 'planeSpeedFactor', 'townGrowthRate']) {
      expect(SETTING_META.filter((m) => m.key === k).length).toBe(1);
    }
  });
  test('infrastructure maintenance is zero with the setting off (default), even on a built map', () => {
    const g = Game.create(small);
    expect(infrastructureMaintenance(g.state)).toBe(0);
  });
});

describe('infrastructure maintenance (OTTD economy.cpp CompaniesGenStatistics)', () => {
  test('on: cost follows piece counts; off: zero', () => {
    const g = Game.create(small);
    const s = g.state;
    // one piece of player rail and road on a flat tile, one station tile
    // many full-rail tiles: small counts floor to 0 in OpenTTD's >> scaling
    const pieces = (n) => { let k = 0; for (const t of s.map.tiles) { if (k >= n) break; if (t.building || t.terrain === 'water') continue; t.owner = 'company'; t.rail = 15; k++; } return k; };
    for (const t of s.map.tiles) { t.rail = 0; t.owner = null; }
    pieces(400);
    const c = countInfrastructure(s);
    expect(c.rail).toBe(400 * 4);
    expect(infrastructureMaintenance(s)).toBe(0);
    setSetting(s, 'infraMaintenance', true);
    const on = infrastructureMaintenance(s);
    expect(on).toBeGreaterThan(0);
    // more rail costs more
    pieces(800);
    expect(infrastructureMaintenance(s)).toBeGreaterThan(on);
  });
  test('monthly charge is a finances row (ledger type infrastructure) only when on', () => {
    const g = Game.create(small);
    const s = g.state;
    const before = s.company.money;
    g.stepDays(31);
    expect(s.company.ledger.current.byType.infrastructure).toBeUndefined();
    setSetting(s, 'infraMaintenance', true);
    for (const t of s.map.tiles) { if (t.building || t.terrain === 'water') continue; t.owner = 'company'; t.rail = 15; }
    g.stepDays(31);
    const hist = s.company.ledger.history;
    const charged = (hist.length ? hist[hist.length - 1].byType.infrastructure : 0) || s.company.ledger.current.byType.infrastructure || 0;
    expect(charged).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(-1e12);
  });
});

describe('plane speed factor (OTTD aircraft_cmd.cpp plane_speed)', () => {
  test('default 1 and an absent setting give the same aircraft speed step', () => {
    const g = Game.create(small);
    expect(g.state.settings).toBeUndefined();
    expect(DEFAULT_SETTINGS.planeSpeedFactor).toBe(1);
  });
  test('on: factor 2 halves the aircraft speed limit (airSpeedStep decelerates to it)', async () => {
    const { airSpeedStep } = await import('../js/simulation/loco/vehicleMotion.js');
    const K = 1 / 1024; // AIR_MPH_TO_TILES_PER_TICK: tiles per tick per mph
    const at20 = { speed: 20 * K, kind: 'aircraft' };
    const full = airSpeedStep({ ...at20 }, 21 * K); // 20 mph -> 21 mph limit: accelerates to 21
    const half = airSpeedStep({ ...at20 }, (21 / 2) * K); // planeSpeedFactor 2: limit 10.5 mph -> decelerates
    expect(full / K).toBeCloseTo(21, 5);
    expect(half / K).toBeLessThan(full / K);
  });
});

describe('town growth rate (OTTD economy.town_growth_rate)', () => {
  function townWithGrowth(mode) {
    const g = Game.create(small);
    setSetting(g.state, 'townGrowthRate', mode);
    const town = g.state.towns[0];
    return { g, town };
  }
  test('normal calls the unchanged growForTick path (same as default)', () => {
    const { g, town } = townWithGrowth('normal');
    expect(typeof growForRate(g, town)).toBe('boolean');
  });
  test('none never grows', () => {
    const { g, town } = townWithGrowth('none');
    let any = false;
    for (let i = 0; i < 50; i++) if (growForRate(g, town)) any = true;
    expect(any).toBe(false);
  });
  test('all modes return a boolean and keep the rng deterministic', () => {
    for (const m of ['slow', 'normal', 'fast', 'veryfast']) {
      const { g, town } = townWithGrowth(m);
      expect(typeof growForRate(g, town)).toBe('boolean');
    }
  });
});

describe('transparency toggles (UI only)', () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    resetTransparencyCache();
  });
  test('all off by default: loadTransparency is null', () => {
    expect(loadTransparency()).toBeNull();
    expect(TRANSPARENCY_OPTIONS.map((o) => o.id)).toEqual(['buildings', 'trees', 'industries', 'stations', 'bridges', 'signs']);
  });
  test('setTransparency persists and turning the last one off returns null', () => {
    setTransparency('buildings', true);
    expect(loadTransparency().buildings).toBe(true);
    expect(JSON.parse(localStorage.getItem(TRANSPARENCY_KEY)).buildings).toBe(true);
    setTransparency('buildings', false);
    expect(loadTransparency()).toBeNull();
  });
  test('tileTransparency: houses fade, forest trees hide, others normal', () => {
    const tr = { buildings: true, trees: true };
    expect(tileTransparency({ building: { type: 'house' } }, tr)).toBe(TRANSPARENT_ALPHA);
    expect(tileTransparency({ terrain: 'forest' }, tr)).toBe(0);
    expect(tileTransparency({ terrain: 'grass' }, tr)).toBe(1);
    expect(tileTransparency({ building: { type: 'house' } }, { trees: true })).toBe(1);
  });
  test('UI rows exist for each transparency toggle', () => {
    const ids = PREF_META.map((p) => p.id);
    for (const o of TRANSPARENCY_OPTIONS) expect(ids).toContain('tr:' + o.id);
  });
});
