/**
 * N6 tick economy fixes: industry input stock/carry-forward (OpenLoco Industry::updateDaily), cargo
 * distribution when the first station is full, >127 towns ticking, owner-scoped subsidies, rival interest month.
 */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame, coalLine } from './helpers.js';
import { placeIndustry, deliverToIndustry } from '../js/simulation/industries.js';
import { updateDaily } from '../js/simulation/loco/industry.js';
import { INDUSTRY_BY_ID } from '../js/config/industries.js';
import { deliverToStations } from '../js/simulation/cargo.js';
import { addWaiting, waitingAmount } from '../js/simulation/stations.js';
import { MAX_WAITING } from '../js/simulation/constants.js';
import { tick as townTick } from '../js/simulation/loco/townManager.js';
import { setSetting } from '../js/simulation/settings.js';
import { updateMonthly as subsidyMonthly, subsidyMultiplier } from '../js/simulation/subsidies.js';
import { updateMonthly as aiMonthly } from '../js/simulation/aiCompanies.js';
import { monthlyLoanInterest } from '../js/simulation/economy.js';

describe('industry input stock and carry-forward', () => {
  test('stock shows the cargo that was waiting before the daily processing (sum processors consume it)', () => {
    const g = flatGame(42);
    const ind = placeIndustry(g.state, 'sawmill', 10, 20); // accepts WOOD, produces GOOD
    deliverToIndustry(ind, 'WOOD', 16);
    updateDaily(g, ind);
    expect(ind.stock.WOOD).toBe(16);       // shown as "waiting to be processed"
    expect(ind.receivedDaily[0]).toBe(0);  // sum branch consumes the input (OpenLoco, requiresAllCargo == false)
    expect(ind.outputBuffer[0]).toBeGreaterThan(0);
  });

  test('requiresAllCargo: unconsumed input is carried and loses a 16th a day (OpenLoco line 228)', () => {
    const g = flatGame(42);
    const ind = placeIndustry(g.state, 'factory', 10, 20); // accepts GRAI, LVST, STEL
    const type = INDUSTRY_BY_ID.factory;
    const prev = type.requiresAllCargo;
    try {
      type.requiresAllCargo = true;
      deliverToIndustry(ind, 'GRAI', 16); // the other two inputs are missing: nothing can be produced
      updateDaily(g, ind);
      expect(ind.stock.GRAI).toBe(16);      // snapshot before processing
      expect(ind.receivedDaily[0]).toBe(15); // 16 - ceil(16/16) carried to the next day
      updateDaily(g, ind);
      expect(ind.receivedDaily[0]).toBe(14); // 15 - ceil(15/16)
    } finally {
      if (prev === undefined) delete type.requiresAllCargo; else type.requiresAllCargo = prev;
    }
  });
});

describe('cargo distribution with a full first station', () => {
  test('the part station 0 rejects is offered to station 1', () => {
    const g = flatGame(41);
    const L = coalLine(g);
    L.a.rating = { ...(L.a.rating || {}), COAL: 100 };
    L.b.rating = { ...(L.b.rating || {}), COAL: 100 };
    addWaiting(L.a, 'COAL', MAX_WAITING, 10, 20, g.state.tick, MAX_WAITING); // station 0 at its cap, same source
    expect(waitingAmount(L.a, 'COAL')).toBe(MAX_WAITING);
    const moved = deliverToStations(g.state, [L.a, L.b], 'COAL', 100, 10, 20);
    expect(waitingAmount(L.a, 'COAL')).toBe(MAX_WAITING); // nothing could be added
    expect(waitingAmount(L.b, 'COAL')).toBe(100);         // old code offered only the 50-unit share and lost 50
    expect(moved).toBe(100);
  });
});

describe('town ticks cover the whole town list', () => {
  test('130 towns all tick within 130 * 8 scenario ticks', () => {
    const g = flatGame(42);
    setSetting(g.state, 'townGrowthRate', 'none'); // tickTown still runs recalculateSize; no map growth needed
    const towns = [];
    for (let i = 0; i < 130; i++) {
      towns.push({
        id: i, name: `T${i}`, x: 8, y: 18, population: 0, size: 4,
        history: [0], historyMinPopulation: 0, buildSpeed: 0, companyRating: 500, ratingAdjusted: false, houses: [],
      });
    }
    g.state.towns = towns;
    for (let t = 0; t < 130 * 8; t += 8) {
      g.state.scenarioTicks = t;
      townTick(g);
    }
    // recalculateSize(): size 4 with population 0 drops to 3; the 3 unvisited towns would still be 4.
    expect(towns.every((town) => town.size === 3)).toBe(true);
  });
});

describe('subsidies are owner-scoped', () => {
  function world(seed = 42) {
    const g = flatGame(seed);
    const mine = placeIndustry(g.state, 'coal_mine', 10, 20);
    const power = placeIndustry(g.state, 'power_station', 40, 20);
    g.state.subsidies = {
      nextId: 2,
      offers: [{ id: 1, cargoId: 'COAL', src: { type: 'industry', id: mine.id }, dst: { type: 'industry', id: power.id }, expiresMonths: 12 }],
      awarded: [],
    };
    return { g, toSt: { x: 40, y: 24 } };
  }
  const rival = { id: 99, name: 'Rival Co' };

  test('a rival delivery cannot consume the player offer or earn the multiplier', () => {
    const { g, toSt } = world();
    expect(subsidyMultiplier(g.state, 'COAL', 10, 24, toSt, g.ctx, rival)).toBe(1);
    expect(g.state.subsidies.offers.length).toBe(1); // still open for the player
    expect(g.state.subsidies.awarded.length).toBe(0);
    expect(subsidyMultiplier(g.state, 'COAL', 10, 24, toSt, g.ctx)).toBe(2); // player still wins it
    expect(g.state.subsidies.awarded.length).toBe(1);
    // after the award, a rival delivery neither receives x2 nor disturbs the player's award
    expect(subsidyMultiplier(g.state, 'COAL', 10, 24, toSt, g.ctx, rival)).toBe(1);
    expect(g.state.subsidies.awarded[0].multiplier).toBe(2);
    expect(subsidyMultiplier(g.state, 'COAL', 10, 24, toSt, g.ctx)).toBe(2);
  });

  test('single-player calls (no payee) behave exactly as before', () => {
    const { g, toSt } = world();
    expect(subsidyMultiplier(g.state, 'COAL', 10, 24, toSt, g.ctx)).toBe(2);
    expect(g.state.subsidies.offers.length).toBe(0);
    expect(g.state.subsidies.awarded.length).toBe(1);
  });
});

describe('rival interest is booked in the month it accrues', () => {
  test('interest lands in the closed month ledger, like the player', () => {
    const g = Game.create({ seed: 3, width: 96, height: 96, townCount: 8 });
    setSetting(g.state, 'aiCompanies', 1);
    aiMonthly(g); // creates the rivals and runs a first turn
    const r = g.state.rivals[0];
    r.loan = 120000;
    r.money = 1_000_000; // no borrowing; manageLoan may repay, which is not an expense
    r.ledger.current = { income: 0, expenses: 0, byType: {} };
    const before = r.ledger.history.length;
    aiMonthly(g);
    expect(r.ledger.history.length).toBe(before + 1);
    const interest = monthlyLoanInterest(g.state, 120000);
    expect(interest).toBeGreaterThan(0);
    expect(r.ledger.history[r.ledger.history.length - 1].expenses).toBe(interest);
  });
});
