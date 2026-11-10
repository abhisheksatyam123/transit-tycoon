// OpenTTD vehicle.smoke_amount (def 2) -> VehicleFx.smokeAmount (render-only): 0 none, 1 half, 2 normal.
import { test, expect, describe } from 'bun:test';
import { VehicleFx } from '../js/renderer/vehicleFx.js';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';

/** Fake smoke emitter: rnd() replays a fixed sequence; add() records particles. */
function fakeSmoke(values) {
  let i = 0;
  const added = [];
  return {
    added,
    rnd: () => values[i++ % values.length],
    add: (x, y, size, kind, life) => { added.push({ x, y, size, kind, life }); return true; },
  };
}
const diesel = Object.keys(MODEL_BY_ID).find((id) => MODEL_BY_ID[id].kind === 'engine' && MODEL_BY_ID[id].traction !== 'electric' && /Diesel/.test(MODEL_BY_ID[id].name));
const seg = (id) => ({ part: 'loco', _run: true, _info: { id: 1, state: 'running', speed: 1, modelId: id, kind: 'train' } });

function run(amount, rnd) {
  const fx = new VehicleFx();
  fx.begin(null, 1, 1000);
  fx.smokeAmount = amount;
  const smoke = fakeSmoke([rnd]);
  fx.segment(smoke, seg(diesel), 5, 5, true);
  return smoke.added.length;
}

describe('vehicle smoke amount', () => {
  test('defaults to 2 (normal) and is a Vehicles select with 0/1/2', () => {
    expect(DEFAULT_SETTINGS.smokeAmount).toBe(2);
    const meta = SETTING_META.find((m) => m.key === 'smokeAmount');
    expect(meta.options.map((o) => o[0])).toEqual(['0', '1', '2']);
  });

  test('a diesel model exists for the test', () => {
    expect(diesel).toBeDefined();
  });

  test('0 emits no vehicle smoke at all', () => {
    expect(run(0, 0.0)).toBe(0);
    expect(run(0, 0.3)).toBe(0);
  });

  test('2 (normal) emits where the diesel chance (r < 0.5) allows', () => {
    expect(run(2, 0.3)).toBeGreaterThan(0);
    expect(run(2, 0.6)).toBe(0);
  });

  test('1 (low) emits roughly half: a draw that passes at 2 but not at 1 is dropped', () => {
    expect(run(2, 0.3)).toBeGreaterThan(0); // 0.3 < 0.5
    expect(run(1, 0.3)).toBe(0); // 0.3 * 2 = 0.6, not < 0.5
    expect(run(1, 0.2)).toBeGreaterThan(0); // 0.4 < 0.5
  });
});
