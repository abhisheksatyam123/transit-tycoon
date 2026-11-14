/** D18: days-based link graph cadence (settings linkgraphIntervalDays / linkgraphTimeDays). Defaults stay monthly. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { noteLeg, updateDaily, updateMonthly, linkgraphIntervalDays, linkgraphTimeDays } from '../js/simulation/cargodist.js';
import { setSetting } from '../js/simulation/settings.js';
import { dateFromDayNumber, dayNumber } from '../js/simulation/date.js';

const BASE_DAY = 2000 * 365; // 1 Jan 2000 (a spawn day for the 4-day interval)

/** Line A(10,24) - B(25,24) - C(40,24) with passenger and mail capacity on each leg. */
function line() {
  const g = flatGame(5);
  const s = g.state;
  setSetting(s, 'cargodistDemandParity', false);
  setSetting(s, 'cargodist', 'symmetric');
  for (const r of [g.buildRailStation(10, 24, 'x', 3), g.buildRailStation(25, 24, 'x', 3), g.buildRailStation(40, 24, 'x', 3),
    g.buildRail(13, 24, 39, 24), g.buildDepot(20, 25, 'rail', 1)]) expect(r.ok).toBe(true);
  const [A, B, C] = s.stations.slice(-3);
  s.date = dateFromDayNumber(BASE_DAY);
  for (const cargoId of ['PASS', 'MAIL']) {
    noteLeg(s, A, B.id, [{ cargoId, capacity: 40 }]);
    noteLeg(s, B, C.id, [{ cargoId, capacity: 40 }]);
    noteLeg(s, B, A.id, [{ cargoId, capacity: 40 }]);
    noteLeg(s, C, B.id, [{ cargoId, capacity: 40 }]);
    for (const [st, supply] of [[A, 200], [B, 100], [C, 100]]) {
      if (!st.cdSupply) st.cdSupply = {};
      st.cdSupply[cargoId] = supply;
    }
  }
  return { s, A, B, C };
}

/** Set the state's date to BASE_DAY + d and run one daily schedule tick. */
function tickDay(s, d) {
  s.date = dateFromDayNumber(BASE_DAY + d);
  updateDaily(s);
}
const spawned = (s, c) => s.cargoDist[c] && s.cargoDist[c].day !== undefined;

describe('D18 link graph cadence', () => {
  test('defaults: days schedule is off; updateDaily is a no-op and updateMonthly keeps the monthly cadence', () => {
    const { s } = line();
    expect(linkgraphIntervalDays(s)).toBe(0);
    expect(linkgraphTimeDays(s)).toBe(0);
    const before = JSON.stringify(s.cargoDist);
    for (let d = 0; d < 40; d++) tickDay(s, d);
    expect(JSON.stringify(s.cargoDist)).toBe(before); // nothing created, nothing rebuilt
    // month schedule still runs exactly once per month call
    s.date = { year: 2000, month: 0, day: 1 };
    updateMonthly(s);
    expect(s.cargoDist.PASS.month).toBe(1);
    expect(s.cargoDist.PASS.dem[s.stations[0].id]).toBeDefined();
    updateMonthly(s);
    expect(s.cargoDist.PASS.month).toBe(2);
  });

  test('interval 4 / time 16: spawns on days 0,4,8,...; result applied on day 18 (not 16); one cargo per spawn', () => {
    const { s, A } = line();
    setSetting(s, 'linkgraphIntervalDays', 4);
    setSetting(s, 'linkgraphTimeDays', 16);
    const passRes = () => s.cargoDist.PASS.dem[A.id];
    tickDay(s, 0);
    expect(spawned(s, 'PASS')).toBe(true); // first cargo in cdCargoList starts the single component
    expect(spawned(s, 'MAIL')).toBe(false);
    expect(s.cargoDist.PASS.pending.dueDay).toBe(BASE_DAY + 16);
    tickDay(s, 4);
    expect(spawned(s, 'MAIL')).toBe(true); // round-robin: mail is next
    expect(s.cargoDist.MAIL.pending.dueDay).toBe(BASE_DAY + 20);
    tickDay(s, 8);
    expect(s.cargoDist.PASS.day).toBe(BASE_DAY); // still pending: no second job
    expect(s.cargoDist.MAIL.day).toBe(BASE_DAY + 4);
    tickDay(s, 16);
    expect(passRes()).toBeUndefined(); // due at 16 but not a join slot -> still pending
    tickDay(s, 18);
    expect(passRes()).toBeDefined(); // day%4 == 2 and due <= 18
    expect(s.cargoDist.MAIL.dem[A.id]).toBeUndefined();
    tickDay(s, 22);
    expect(s.cargoDist.MAIL.dem[A.id]).toBeDefined(); // mail applied at its next join slot
  });

  test('time 0 applies at once; updateMonthly is ignored while the days schedule is on', () => {
    const { s, A } = line();
    setSetting(s, 'linkgraphIntervalDays', 2);
    setSetting(s, 'linkgraphTimeDays', 0);
    tickDay(s, 0);
    expect(s.cargoDist.PASS.dem[A.id]).toBeDefined();
    expect(s.cargoDist.PASS.pending).toBeUndefined();
    const month = s.cargoDist.PASS.month;
    s.date = { year: 2000, month: 0, day: 1 };
    updateMonthly(s);
    expect(s.cargoDist.PASS.month).toBe(month); // month schedule returns early
  });
});
