import { test, expect, describe } from 'bun:test';
import { consistSignature, updateConsistStrip } from '../js/ui/windows/depot.js';

const DATE = { year: 1930, month: 0, day: 1 };
const train = () => ({
  id: 4, modelId: 'eng_puffer', engines: [], wagons: 2, wagonModelId: 'wag_hopper',
  cargoId: 'COAL', capacity: 60,
});

describe('depot consist strip cache', () => {
  test('signature changes for every displayed consist input', () => {
    const v = train();
    const base = consistSignature(v, DATE);
    for (const changed of [
      { id: 5 }, { modelId: 'eng_comet' }, { engines: ['eng_puffer'] }, { wagons: 3 },
      { cargoId: 'GOOD' }, { capacity: 90 }, { consist: [{ modelId: 'wag_coach', cargoId: 'PASS' }] },
    ]) expect(consistSignature({ ...v, ...changed }, DATE)).not.toBe(base);
    expect(consistSignature(v, { ...DATE, day: 2 })).not.toBe(base);
    expect(consistSignature(v, DATE)).toBe(base); // unchanged inputs keep the same key
  });

  test('unchanged signature returns without rebuilding or dry-run pricing', () => {
    const v = train();
    const pick = { value: 'wag_hopper' };
    const strip = {
      dataset: { consistSig: `${consistSignature(v, DATE)}|${pick.value}|` },
      children: [{}, pick, {}, {}, {}, null, null, null],
    };
    let dry = 0;
    const game = {
      state: { date: DATE },
      addWagonModel() { dry++; return { ok: true, cost: 1 }; },
      removeWagons() { dry++; return { ok: true, cost: 1 }; },
    };
    expect(updateConsistStrip(strip, { game }, v)).toBe(false);
    expect(dry).toBe(0);
  });

  test('unchanged strip refreshes the cash-dependent disabled flag', () => {
    const v = train();
    const pick = { value: 'wag_hopper' };
    const add = {}, del = {};
    const strip = {
      dataset: { consistSig: `${consistSignature(v, DATE)}|${pick.value}|` },
      children: [{}, pick, add, del, {}, null, null, null],
      _dry: { a: { ok: true, cost: 100 }, r: { ok: true }, ea: null, er: null },
    };
    const game = { state: { date: DATE, company: { money: 50 } } };
    expect(updateConsistStrip(strip, { game }, v)).toBe(false);
    expect(add.disabled).toBe(true); // cannot afford the cached price now
    game.state.company.money = 150;
    expect(updateConsistStrip(strip, { game }, v)).toBe(false);
    expect(add.disabled).toBe(false);
  });
});
