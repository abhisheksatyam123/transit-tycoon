/** N8 save/load robustness: boot autosave guard, unknown packed formats, Moscow detection, parseState checks. */
import { test, expect, describe, beforeEach, afterAll } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { parseState, serializeState, stripCarsScratch } from '../js/simulation/save.js';
import { isMoscowSave } from '../js/simulation/scenarios/moscowRegistry.js';
import { saveToSlot, readSlot, slotPresence } from '../js/ui/storage.js';
import {
  lockAutosaveSlot, unlockAutosaveSlot, autosaveSlotLocked, resetAutosaveGuard,
} from '../js/ui/autosaveGuard.js';

/** A small valid random-world state. */
function smallState() {
  return Game.create({ seed: 3, width: 32, height: 32, townCount: 0, industryCount: 0 }).state;
}

describe('boot autosave guard', () => {
  beforeEach(() => resetAutosaveGuard());

  test('the guard locks and unlocks the autosave slot', () => {
    expect(autosaveSlotLocked()).toBe(false);
    lockAutosaveSlot();
    expect(autosaveSlotLocked()).toBe(true);
    unlockAutosaveSlot();
    expect(autosaveSlotLocked()).toBe(false);
  });

  test('resetAutosaveGuard clears the lock (test helper)', () => {
    lockAutosaveSlot();
    resetAutosaveGuard();
    expect(autosaveSlotLocked()).toBe(false);
  });
});

describe('unknown packed sub-formats are rejected with a clear error', () => {
  test('traffic RLE array with an unknown rle tag', () => {
    const st = smallState();
    st.traffic.load = { rle: 9, n: st.map.tiles.length, d: '' };
    expect(() => parseState(st)).toThrow(/unsupported traffic array format/);
  });

  test('traffic cars with an unknown fmt', () => {
    const st = smallState();
    st.traffic.cars = { fmt: 'cars-col-v9', n: 0 };
    expect(() => parseState(st)).toThrow(/unsupported traffic cars format: cars-col-v9/);
  });

  test('station cargo with an unknown fmt', () => {
    const st = smallState();
    st.stations = [{ cargo: { COAL: { fmt: 'parcels-v9', n: 1, d: '' } } }];
    expect(() => parseState(st)).toThrow(/unsupported station cargo format: parcels-v9/);
  });

  test('tiles with an unknown format', () => {
    const st = smallState();
    st.map.tiles = { format: 'tiles-rle-v9' };
    expect(() => parseState(st)).toThrow(/unsupported tiles format: tiles-rle-v9/);
  });
});

describe('Moscow detection tolerates re-formatted JSON', () => {
  test('compact saves still match', () => {
    expect(isMoscowSave('{"scenario":"moscow","tick":1}')).toBe(true);
    expect(isMoscowSave({ scenario: 'moscow' })).toBe(true);
  });

  test('whitespace around the colon matches', () => {
    expect(isMoscowSave('{\n  "scenario" : "moscow",\n  "tick": 1\n}')).toBe(true);
    expect(isMoscowSave('{"scenario"\t:\t"moscow"}')).toBe(true);
    expect(isMoscowSave('{"scenario":\n "moscow"}')).toBe(true);
  });

  test('other scenarios do not match', () => {
    expect(isMoscowSave('{"scenario":"arctic"}')).toBe(false);
    expect(isMoscowSave({ scenario: 'arctic' })).toBe(false);
    expect(isMoscowSave('{}')).toBe(false);
    expect(isMoscowSave(null)).toBe(false);
  });
});

describe('parseState validates the state shape', () => {
  test('a normal save still loads', () => {
    const st = smallState();
    expect(parseState(serializeState(st)).map.tiles.length).toBe(st.map.width * st.map.height);
  });

  test('tiles length must equal width * height', () => {
    const st = smallState();
    st.map.tiles.pop();
    expect(() => parseState(st)).toThrow(/tiles for a 32x32 map/);
  });

  test('every tile must be an object', () => {
    const st = smallState();
    st.map.tiles[0] = null;
    expect(() => parseState(st)).toThrow(/tile 0 is not an object/);
  });

  test('core arrays must be arrays', () => {
    for (const key of ['vehicles', 'stations', 'towns', 'industries']) {
      const st = smallState();
      delete st[key];
      expect(() => parseState(st)).toThrow(new RegExp(`${key} is not an array`));
    }
  });

  test('missing or inconsistent map is rejected', () => {
    const st = smallState();
    delete st.map;
    expect(() => parseState(st)).toThrow(/missing map/);
    const st2 = smallState();
    st2.map.width = 0;
    expect(() => parseState(st2)).toThrow(/bad map dimensions/);
  });
});

describe('car scratch keys', () => {
  test('stripCarsScratch removes only `_` keys and keeps the same array when clean', () => {
    const clean = [{ id: 1, path: [2] }];
    expect(stripCarsScratch(clean)).toBe(clean);
    const dirty = [{ id: 1, path: [2], _key: 'x', _ahead: { id: 2 } }];
    const out = stripCarsScratch(dirty);
    expect(out).toEqual([{ id: 1, path: [2] }]);
    expect(dirty[0]._key).toBe('x'); // input untouched
  });

  test('the scenario fallback raw-car path also drops scratch keys', () => {
    const st = smallState();
    const n = st.map.width * st.map.height;
    st.scenario = 'test'; // use the packed scenario serialiser
    // An extra non-scratch key forces packCarsSteps to fall back to the raw car array.
    st.traffic.cars = [{
      id: 1, townId: 0, path: [0], i: 0, t: 0, speed: 0.1, wait: 0, born: 0, kind: 'car', color: 0,
      _key: 7, extra: true,
    }];
    st.traffic.load = new Array(n).fill(0);
    st.traffic.jam = new Array(n).fill(0);
    st.traffic.acc = { samples: new Array(n).fill(0), blocked: new Array(n).fill(0), speedSum: 0, speedN: 0 };
    const back = JSON.parse(serializeState(st));
    expect(back.traffic.cars[0]._key).toBeUndefined();
    expect(back.traffic.cars[0].extra).toBe(true);
  });
});

describe('corrupt slot helper', () => {
  let store;
  const realLocalStorage = globalThis.localStorage;
  afterAll(() => { globalThis.localStorage = realLocalStorage; });
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    resetAutosaveGuard();
  });

  const fakeGame = { state: { date: { year: 1, month: 0 }, company: { money: 100 }, seed: 1 }, serialize: () => '{"ok":1}' };

  test('empty, readable and corrupt slots are distinguished', () => {
    expect(readSlot('1').status).toBe('empty');

    expect(saveToSlot('1', fakeGame).ok).toBe(true);
    const ok = readSlot('1');
    expect(ok.status).toBe('ok');
    expect(ok.data).toBe('{"ok":1}');

    store.set('tt.save.2:meta', JSON.stringify({ date: { year: 1, month: 0 }, money: 5, savedAt: 1, seed: 2 }));
    const corrupt = readSlot('2');
    expect(corrupt.status).toBe('corrupt');
    expect(corrupt.meta.money).toBe(5);

    store.set('tt.save.3', 'Z1:not compressed');
    store.set('tt.save.3:meta', JSON.stringify({ savedAt: 1 }));
    expect(readSlot('3').status).toBe('corrupt');
  });

  test('the payload is written before the meta record', () => {
    const order = [];
    const inner = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = (k, v) => { order.push(k); inner(k, v); };
    expect(saveToSlot('1', fakeGame).ok).toBe(true);
    expect(order).toEqual(['tt.save.1', 'tt.save.1:meta']);
  });

  test('a failed payload write does not manufacture a corrupt (meta-only) slot', () => {
    const inner = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = (k, v) => {
      if (k === 'tt.save.2') throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      inner(k, v);
    };
    const r = saveToSlot('2', fakeGame);
    expect(r.ok).toBe(false);
    expect(r.quota).toBe(true);
    expect(readSlot('2').status).toBe('empty');
  });

  test('slotPresence distinguishes empty, present and meta-only without decoding', () => {
    expect(slotPresence('1').state).toBe('empty');
    expect(saveToSlot('1', fakeGame).ok).toBe(true);
    expect(slotPresence('1').state).toBe('present');
    store.set('tt.save.2:meta', JSON.stringify({ savedAt: 1 }));
    expect(slotPresence('2').state).toBe('meta-only');
  });
});
