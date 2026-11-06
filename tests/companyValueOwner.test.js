// Player company value must not include AI rivals' vehicles (they carry ownerId); the status bar,
// graphs and monthly history use the same OpenLoco formula (cash - loan + 8 x recent profit + vehicle value).
import { test, expect } from 'bun:test';
import { companyValue } from '../js/ui/statusbar.js';
import { liveCompanyValue } from '../js/ui/windows/graphs.js';
import { calculateCompanyValue } from '../js/simulation/loco/company.js';

const state = () => ({
  company: { money: 50000, loan: 20000 },
  vehicles: [
    { id: 1, value: 4000, profit: [100, 50] },
    { id: 2, ownerId: 7, value: 90000, profit: [9000] },
  ],
});

test('status bar value counts only player vehicles, with the OpenLoco profit term', () => {
  const s = state();
  expect(companyValue(s)).toBe(50000 - 20000 + 4000 + 150 * 8);
});

test('graphs live value equals the status bar and the monthly formula', () => {
  const s = state();
  const monthly = calculateCompanyValue(s.company, s.vehicles.filter((v) => v.ownerId == null)).companyValue;
  expect(liveCompanyValue(s, s.company)).toBe(companyValue(s));
  expect(companyValue(s)).toBe(monthly);
});
