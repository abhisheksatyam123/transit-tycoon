import { describe, test, expect } from 'bun:test';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { Game } from '../js/simulation/game.js';
import { vehicleDaily } from '../js/simulation/loco/vehicle.js';
import { defaultWagonCount } from '../js/ui/buyFilter.js';

const makeVehicle = () => ({
  state: 'running', age: 1, maxAge: 100000, reliability: 1, serviceIntervalDays: 1,
  lastServiceDay: 0, tx: 0, ty: 0, timeoutToBreakdown: null, kind: 'road', modelId: 'bus_city',
});

describe('OpenTTD order.no_servicing_if_no_breakdowns', () => {
  test('defaults to true', () => {
    expect(DEFAULT_SETTINGS.noServicingIfNoBreakdowns).toBe(true);
  });

  test('breakdowns off + setting on: no service trip is due', () => {
    const g = Game.create({ seed: 1 });
    g.state.date = { year: 1960, month: 2, day: 20 };
    setSetting(g.state, 'breakdowns', 'none');
    setSetting(g.state, 'noServicingIfNoBreakdowns', true);
    const v = makeVehicle();
    vehicleDaily({ state: g.state }, v, g.rng, 1960);
    expect(v.serviceDue).toBeUndefined();
  });

  test('breakdowns off + setting off: a service trip is still due', () => {
    const g = Game.create({ seed: 1 });
    g.state.date = { year: 1960, month: 2, day: 20 };
    setSetting(g.state, 'breakdowns', 'none');
    setSetting(g.state, 'noServicingIfNoBreakdowns', false);
    const v = makeVehicle();
    vehicleDaily({ state: g.state }, v, g.rng, 1960);
    expect(v.serviceDue).toBe(true);
  });

  test('breakdowns normal: servicing is due regardless of the setting', () => {
    const g = Game.create({ seed: 1 });
    g.state.date = { year: 1960, month: 2, day: 20 };
    setSetting(g.state, 'breakdowns', 'normal');
    setSetting(g.state, 'noServicingIfNoBreakdowns', true);
    const v = makeVehicle();
    vehicleDaily({ state: g.state }, v, g.rng, 1960);
    expect(v.serviceDue).toBe(true);
  });
});

describe('OpenTTD vehicle.freight_trains', () => {
  const g = () => Game.create({ seed: 1 });
  test('defaults to 0 = automatic (4 wagons)', () => {
    expect(DEFAULT_SETTINGS.freightTrainWagons).toBe(0);
    expect(defaultWagonCount(g().state, 12, getSetting)).toBe(4);
  });

  test('a positive value pre-fills that many wagons', () => {
    const s = g().state;
    setSetting(s, 'freightTrainWagons', 7);
    expect(defaultWagonCount(s, 12, getSetting)).toBe(7);
  });

  test('clamped to the current wagon limit and at least 1', () => {
    const s = g().state;
    setSetting(s, 'freightTrainWagons', 30);
    expect(defaultWagonCount(s, 12, getSetting)).toBe(12);
    expect(defaultWagonCount(s, 0, getSetting)).toBe(1);
  });
});
