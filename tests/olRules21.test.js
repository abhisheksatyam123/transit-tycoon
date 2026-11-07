// OpenLoco audit r21 findings 5-8 (RX3). Pins the verified current behaviour; no hash-changing rule was ported.
import { test, expect } from 'bun:test';
import { refundValue } from '../js/simulation/vehicles.js';
import { vehicleMonthly, monthlyRunningCost } from '../js/simulation/loco/vehicle.js';

// Finding 6: refund decay is trunc(value/128) per month on the single per-head value (OL decays per car).
test('refund decays by trunc(value/128) once per month', () => {
  const v = { value: 1000, profitThisYear: 0, profit: [] };
  vehicleMonthly({}, v);
  expect(v.value).toBe(1000 - Math.trunc(1000 / 128));
});

test('purchase refund is 7/8 of the price (OL CreateVehicle.cpp:163-165)', () => {
  expect(refundValue(800)).toBe(700);
  expect(refundValue(9)).toBe(8);
});

// Finding 7: OL charges trunc(runCostFactor * normalisedMultiplier / 2^10) per car (VehicleHead.cpp:7119-7130).
// TT: one integer step, trunc(yearly * normalisedFactor / (12 * 1024)); no rounding before inflation.
test('monthly running cost without state is trunc(yearly/12) (no rounding)', () => {
  expect(monthlyRunningCost({ runningCost: 1200 }, null)).toBe(100);
  expect(monthlyRunningCost({ runningCost: 1210 }, null)).toBe(100);
});

test('monthly running cost at game start equals trunc(yearly/12) (factor 1024)', () => {
  const state = { date: { year: 1950 } };
  expect(monthlyRunningCost({ runningCost: 1210 }, state)).toBe(100);
});

test('monthly running cost inflates once, truncating last (factor 1.5x)', () => {
  const factors = new Array(32).fill(1024);
  factors[13] = 1536;
  const state = { economy: { factors, base: new Array(32).fill(1024) } };
  // trunc(1210 * 1536 / 12288) = trunc(151.25) = 151
  expect(monthlyRunningCost({ runningCost: 1210 }, state)).toBe(151);
});

// Finding 8: the warning block only ever touches the player's company (companyManager.js updateMonthly1 uses s.company).
test('bankruptcy warnings are posted only from the player block', async () => {
  const src = await Bun.file(new URL('../js/simulation/loco/companyManager.js', import.meta.url)).text();
  const block = src.slice(src.indexOf('// bankruptcy: 3 / 6 months'), src.indexOf('c.negativeMonths'));
  expect(block).toContain('c.numMonthsInTheRed++');
  expect(block).not.toMatch(/for \(const r of/);
});
