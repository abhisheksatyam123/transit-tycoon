import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { pushNews, notify, newsCategoryOf, NEWS_CATEGORY_IDS } from '../js/simulation/news.js';
import { newsDisplay, newsLevel, saveNewsPrefs, loadNewsPrefs } from '../js/ui/newsPrefs.js';
import { orderCargoWarning, unservedCargos, acceptanceProblems, vehicleCargos } from '../js/simulation/orderCargo.js';
import { flatGame } from './helpers.js';

describe('news categories', () => {
  test('every item emitted in a 1-year random sim has a known category (no fallback)', () => {
    const g = Game.create({ seed: 5 });
    const seen = [];
    g.on('news', (n) => seen.push(n));
    g.stepDays(365);
    expect(g.state.news.length).toBeGreaterThan(0);
    for (const n of g.state.news) {
      // the category is stored on the item; a missing or unknown one would fall back to 'general'
      expect(NEWS_CATEGORY_IDS).toContain(n.cat);
      expect(newsCategoryOf(n)).toBe(n.cat);
    }
    expect(seen.length).toBeGreaterThan(0);
  }, 120000);

  test('categories are not serialized (world hash / saves unchanged)', () => {
    const item = pushNews({ tick: 0, date: { year: 1950, day: 0 }, news: [] }, 'x', 'info', undefined, undefined, 'subsidy');
    expect(item.cat).toBe('subsidy');
    expect(JSON.stringify(item)).not.toContain('subsidy');
  });

  test('items without a category (old saves) read as general', () => {
    expect(newsCategoryOf({ text: 'old' })).toBe('general');
    expect(newsCategoryOf(null)).toBe('general');
  });
});

describe('message settings effect', () => {
  test('defaults: every category is Summary (behaviour unchanged)', () => {
    saveNewsPrefs({});
    expect(newsLevel(loadNewsPrefs(), 'subsidy')).toBe('summary');
    expect(newsDisplay('summary')).toEqual({ sound: true, flash: true, toast: false });
  });

  test('Off: no sound, no ticker flash, no toast, but the item stays in history', () => {
    expect(newsDisplay('off')).toEqual({ sound: false, flash: false, toast: false });
    const g = flatGame();
    const state = g.state;
    const before = state.news.length;
    const item = notify({ state, emit: () => {} }, 'Subsidy offered: test', 'good', undefined, undefined, 'subsidy');
    expect(state.news.length).toBe(before + 1);
    expect(state.news[state.news.length - 1]).toBe(item);
    expect(newsDisplay('off').toast).toBe(false);
  });

  test('Full adds a toast', () => {
    expect(newsDisplay('full')).toEqual({ sound: true, flash: true, toast: true });
  });

  test('saved prefs drop invalid entries and keep only non-default levels', () => {
    saveNewsPrefs({ subsidy: 'off', general: 'summary', bogus: 'full', arrival: 'loud' });
    const p = loadNewsPrefs();
    expect(p).toEqual({ subsidy: 'off' });
    saveNewsPrefs({});
  });
});

describe('order cargo acceptance', () => {
  function busWithStop(g, { accepts = {}, supplies = false } = {}) {
    const st = { id: 900, name: 'Test stop', x: 5, y: 5, tiles: [], accepts, kinds: { bus: true }, cargo: {}, rating: {}, lastPickup: {} };
    g.state.stations.push(st);
    return st;
  }

  test('a bus to a stop that accepts no passengers gets the warning text', () => {
    const g = flatGame();
    const st = busWithStop(g, { accepts: { MAIL: true } });
    const v = { name: 'Bus 1', cargoId: 'PASS', orders: [{ stationId: st.id }] };
    // no houses in the catchment, so the stop neither accepts nor supplies passengers
    expect(unservedCargos(g.state, v, st)).toEqual(['PASS']);
    expect(orderCargoWarning(g.state, v, st)).toBe('Does not accept Passengers');
  });

  test('no warning when the stop accepts the carried cargo', () => {
    const g = flatGame();
    const st = busWithStop(g, { accepts: { PASS: true } });
    const v = { name: 'Bus 1', cargoId: 'PASS', orders: [{ stationId: st.id }] };
    expect(orderCargoWarning(g.state, v, st)).toBe('');
  });

  test('vehicle with no cargo never warns', () => {
    const g = flatGame();
    const st = busWithStop(g, {});
    expect(orderCargoWarning(g.state, { name: 'Lorry', orders: [] }, st)).toBe('');
  });

  test('mixed consist lists every carried cargo', () => {
    expect(vehicleCargos({ cargoId: 'COAL', consist: [{ modelId: 'w', cargoId: 'GOOD' }, { modelId: 'w', cargoId: 'COAL' }] }).sort())
      .toEqual(['COAL', 'GOOD']);
  });

  test('Issues: a vehicle whose stops accept none of its cargo is reported once per cargo', () => {
    const g = flatGame();
    const st = busWithStop(g, { accepts: {} });
    g.state.vehicles.push({ id: 77, name: 'Bus 77', cargoId: 'PASS', orders: [{ stationId: st.id }] });
    const probs = acceptanceProblems(g.state);
    const hit = probs.find((p) => p.vehicleId === 77);
    expect(hit).toBeDefined();
    expect(hit.message).toBe('Vehicle Bus 77: no stop on its orders accepts Passengers');
  });
});
