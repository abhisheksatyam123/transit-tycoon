/** UI1: depot sell-all helper, cargo payment rate series, station rating breakdown (UI-only helpers). */
import { test, expect, describe } from 'bun:test';
import { sellAllDepotVehicles } from '../js/ui/windows/depot.js';
import { cargoPaymentRateSeries, RATE_UNITS, RATE_DISTANCE, RATE_MAX_DAYS } from '../js/ui/windows/graphs.js';
import { calculateDeliveredCargoPayment, PAYMENT_CARGO_IDS } from '../js/simulation/loco/economy.js';
import { calculateCargoRating, cargoRatingBreakdown } from '../js/simulation/loco/station.js';
import { ratingTooltip } from '../js/ui/windows/station.js';

describe('depot sell-all (UI1)', () => {
  test('sells each vehicle via the sell command and sums refunds; failures are counted', () => {
    const calls = [];
    const game = {
      sellVehicle(id) {
        calls.push(id);
        if (id === 3) return { ok: false, error: 'Vehicle must be stopped in a depot' };
        return { ok: true, cost: -(id * 100) };
      },
    };
    const r = sellAllDepotVehicles(game, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(calls).toEqual([1, 2, 3]);
    expect(r).toEqual({ sold: 2, refund: 300, failed: 1 });
  });

  test('empty list does nothing', () => {
    expect(sellAllDepotVehicles({ sellVehicle: () => { throw new Error('no'); } }, [])).toEqual({ sold: 0, refund: 0, failed: 0 });
  });
});

describe('cargo payment rates graph (UI1)', () => {
  const state = { settings: { cargoPaymentPercent: 100 }, company: {}, inflation: false };

  test('one series per cargo, 1..200 days, values equal calculateDeliveredCargoPayment', () => {
    const { days, series } = cargoPaymentRateSeries(state);
    expect(days[0]).toBe(1);
    expect(days[days.length - 1]).toBe(RATE_MAX_DAYS);
    expect(series.length).toBe(PAYMENT_CARGO_IDS.length);
    for (const s of series) {
      expect(s.values.length).toBe(RATE_MAX_DAYS);
      for (const d of [1, 10, 50, 200]) {
        expect(s.values[d - 1]).toBe(calculateDeliveredCargoPayment(state, s.id, RATE_UNITS, RATE_DISTANCE, d));
      }
    }
  });

  test('payment never rises with transit time and is non-negative', () => {
    const { series } = cargoPaymentRateSeries(state);
    for (const s of series) {
      for (let i = 1; i < s.values.length; i++) expect(s.values[i]).toBeLessThanOrEqual(s.values[i - 1]);
      expect(Math.min(...s.values)).toBeGreaterThanOrEqual(0);
    }
  });

  test('cargoPaymentPercent scales the series', () => {
    const half = cargoPaymentRateSeries({ ...state, settings: { cargoPaymentPercent: 50 } });
    const full = cargoPaymentRateSeries(state);
    const p = full.series[0].values[4], h = half.series[0].values[4];
    expect(h).toBe(Math.trunc((p * 50) / 100));
  });
});

describe('station rating breakdown (UI1)', () => {
  test('breakdown total equals calculateCargoRating over a grid of inputs', () => {
    for (const age of [0, 7, 8, 15, 16, 30, 31, 45, 46, 255])
      for (const quantity of [0, 100, 101, 200, 300, 500, 1000, 1001])
        for (const npc of [false, true])
          for (const vehicleSpeed of [0, 30, 36, 100, 250, 400])
            for (const vehicleAge of [0, 1, 2, 3, 4, 9]) {
              const c = { age, quantity, vehicleSpeed, vehicleAge, npc };
              expect(cargoRatingBreakdown(c).total).toBe(calculateCargoRating(c));
            }
  });

  test('steps are labelled and the running sum ends at the unclamped total', () => {
    const bd = cargoRatingBreakdown({ age: 5, quantity: 50, vehicleSpeed: 100, vehicleAge: 0, npc: false });
    expect(bd.steps.map((s) => s.key)).toEqual(['age', 'base', 'waiting', 'speed', 'vehicleAge']);
    expect(bd.steps[0]).toMatchObject({ delta: 165, running: 165 });
    expect(bd.steps[bd.steps.length - 1].running).toBe(165 - 130 + 130 + 16 + 33);
    expect(bd.steps[0].label).toContain('5');
  });

  test('npc forces 120 after quantity terms', () => {
    const bd = cargoRatingBreakdown({ age: 0, quantity: 0, vehicleSpeed: 0, vehicleAge: 0, npc: true });
    expect(bd.steps.find((s) => s.key === 'npc')).toBeTruthy();
    expect(bd.total).toBe(120 + 33);
  });

  test('tooltip lists every component and the final value', () => {
    const d = { ...cargoRatingBreakdown({ age: 5, quantity: 50, vehicleSpeed: 0, vehicleAge: 9, npc: false }), current: 60 };
    const t = ratingTooltip(d, 'Coal');
    expect(t.split('\n')[0]).toContain('Coal');
    expect(t).toContain(`= ${d.total}/200`);
    expect(t).toContain('Waiting cargo: 50');
  });
});
