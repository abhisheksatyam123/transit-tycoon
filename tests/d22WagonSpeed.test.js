// D22 wagon speed limits (OpenTTD vehicle.wagon_speed_limits): mechanism only, off by default.
// A train's target speed is min(engine speed, slowest wagon speed) where a wagon speed > 0; 0/absent = unlimited.
import { test, expect, describe } from 'bun:test';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { consistMaxSpeedTiles } from '../js/simulation/consist.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
import { tick } from '../js/simulation/loco/vehicleManager.js';

const KMH = (k) => k * KMH_TO_TILES_PER_TICK;
const st = (settings = {}) => ({ settings });

/** Temporary synthetic wagon model (no real wagon gets speed data in this change). */
function withWagonSpeed(id, speed, fn) {
  MODEL_BY_ID[id] = { id, name: id, kind: 'wagon', speed, capacity: 0, cost: 0, running: 0, reliability: 1, cargos: ['PASS'] };
  try { return fn(id); } finally { delete MODEL_BY_ID[id]; }
}

/** Plain train on an engine with 100 km/h and two wagons of `wagonModelId`. */
function trainV(over = {}) {
  return { id: 1, kind: 'train', modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, maxSpeed: KMH(100), speed: 0, ...over };
}

describe('wagonSpeedLimits: setting', () => {
  test('default is false', () => {
    expect(DEFAULT_SETTINGS.wagonSpeedLimits).toBe(false);
  });

  test('exactly one SETTING_META entry, group vehicles, check, with the documented help', () => {
    const metas = SETTING_META.filter((m) => m.key === 'wagonSpeedLimits');
    expect(metas.length).toBe(1);
    expect(metas[0].group).toBe('vehicles');
    expect(metas[0].type).toBe('check');
    expect(metas[0].label).toBeTruthy();
    expect(metas[0].help).toContain('Off by default (TT behaviour)');
    expect(metas[0].help).toContain('OpenTTD vehicle.wagon_speed_limits');
  });

  test('setSetting toggles it live', () => {
    const s = st();
    setSetting(s, 'wagonSpeedLimits', true);
    expect(s.settings.wagonSpeedLimits).toBe(true);
  });
});

describe('consistMaxSpeedTiles: pure helper', () => {
  test('off: a slow wagon does not change the engine speed', () => {
    withWagonSpeed('wag_test_40', 40, (id) => {
      const v = trainV({ wagonModelId: id });
      expect(consistMaxSpeedTiles(st(), v)).toBe(KMH(100));
      expect(consistMaxSpeedTiles(st({ wagonSpeedLimits: false }), v)).toBe(KMH(100));
    });
  });

  test('on with the real all-zero wagon data: unchanged', () => {
    const v = trainV(); // wag_hopper, speed 0 in config/vehicles.js
    expect(MODEL_BY_ID.wag_hopper.speed).toBe(0);
    expect(consistMaxSpeedTiles(st({ wagonSpeedLimits: true }), v)).toBe(KMH(100));
  });

  test('on: the slowest wagon caps the train', () => {
    withWagonSpeed('wag_test_40', 40, (id) => {
      const v = trainV({ wagonModelId: id });
      expect(consistMaxSpeedTiles(st({ wagonSpeedLimits: true }), v)).toBe(KMH(40));
    });
  });

  test('engine slower than the wagon stays at engine speed', () => {
    withWagonSpeed('wag_test_40', 40, (id) => {
      const v = trainV({ wagonModelId: id, maxSpeed: KMH(30) });
      expect(consistMaxSpeedTiles(st({ wagonSpeedLimits: true }), v)).toBe(KMH(30));
    });
  });

  test('mixed consist: the slowest of all wagon models wins', () => {
    withWagonSpeed('wag_test_30', 30, (slow) => {
      withWagonSpeed('wag_test_60', 60, (fast) => {
        const v = trainV({ wagons: 3, consist: [{ modelId: fast }, { modelId: slow }, { modelId: 'wag_coach' }] });
        expect(consistMaxSpeedTiles(st({ wagonSpeedLimits: true }), v)).toBe(KMH(30));
      });
    });
  });

  test('a plain train with no wagon model falls back to the coach like wagonList', () => {
    withWagonSpeed('wag_test_40', 40, () => {
      MODEL_BY_ID.wag_coach.speed = 40;
      try {
        const v = trainV({ wagonModelId: null });
        expect(consistMaxSpeedTiles(st({ wagonSpeedLimits: true }), v)).toBe(KMH(40));
      } finally { MODEL_BY_ID.wag_coach.speed = 0; }
    });
  });

  test('non-train vehicles are never affected', () => {
    withWagonSpeed('wag_test_40', 40, (id) => {
      const v = { kind: 'road', maxSpeed: KMH(100), wagonModelId: id, wagons: 2 };
      expect(consistMaxSpeedTiles(st({ wagonSpeedLimits: true }), v)).toBe(KMH(100));
    });
  });
});

// --- movement integration: the helper feeds the existing cap chain (order / broken still apply) ---

const W = 12;
function fakeState(settings) {
  const tiles = [];
  for (let i = 0; i < W * W; i++) tiles.push({ height: 0 });
  for (let x = 0; x < W; x++) tiles[5 * W + x].rail = 5;
  return { map: { width: W, height: W, tiles }, settings, vehicles: [], stations: [], tick: 0, news: [], date: { day: 1, month: 0, year: 1950 } };
}
function fakeTrain(over = {}) {
  const path = [];
  for (let i = -2; i <= 3; i++) path.push({ x: 5 + i, y: 5 });
  return {
    id: 1, kind: 'train', modelId: 'eng_puffer', state: 'running', speed: KMH(40), maxSpeed: KMH(100),
    wagons: 2, wagonModelId: 'wag_hopper', progress: 0.5, tx: 5, ty: 5, path, pathIndex: 2,
    history: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], orders: [], orderIndex: 0,
    cargoId: 'PASS', load: { amount: 0 }, ...over,
  };
}
function runTick(s) {
  const game = { state: s, ctx: { state: s, emit: () => {}, rng: null }, rng: { next: () => 0.5 } };
  tick(game);
}

describe('wagonSpeedLimits: movement cap', () => {
  test('on, all-zero wagons: behaviour is unchanged (train keeps accelerating past 40)', () => {
    const s = fakeState({ wagonSpeedLimits: true });
    const v = fakeTrain({ speed: KMH(40) });
    s.vehicles = [v];
    runTick(s);
    expect(v.speed).toBeGreaterThan(KMH(40));
  });

  test('on with a 40 km/h wagon: the target is capped at 40 (speed held, not accelerated)', () => {
    withWagonSpeed('wag_test_40', 40, (id) => {
      const s = fakeState({ wagonSpeedLimits: true });
      const v = fakeTrain({ speed: KMH(40), wagonModelId: id });
      s.vehicles = [v];
      runTick(s);
      expect(v.speed).toBe(KMH(40));
    });
  });

  test('off with the same 40 km/h wagon: unchanged engine-speed behaviour', () => {
    withWagonSpeed('wag_test_40', 40, (id) => {
      const s = fakeState({ wagonSpeedLimits: false });
      const v = fakeTrain({ speed: KMH(40), wagonModelId: id });
      s.vehicles = [v];
      runTick(s);
      expect(v.speed).toBeGreaterThan(KMH(40));
    });
  });

  test('order max speed still caps a wagon-limited train', () => {
    withWagonSpeed('wag_test_60', 60, (id) => {
      const s = fakeState({ wagonSpeedLimits: true });
      const v = fakeTrain({ speed: KMH(10), wagonModelId: id, orders: [{ maxSpeed: 10 }] });
      s.vehicles = [v];
      runTick(s);
      expect(v.speed).toBe(KMH(10));
    });
  });

  test('broken cap (maxSpeed/4) still wins over a slower wagon', () => {
    withWagonSpeed('wag_test_40', 40, (id) => {
      const s = fakeState({ wagonSpeedLimits: true });
      const v = fakeTrain({ state: 'broken', breakdownTicks: 100, speed: KMH(25), wagonModelId: id });
      s.vehicles = [v];
      runTick(s);
      expect(v.speed).toBe(KMH(25));
    });
  });
});
