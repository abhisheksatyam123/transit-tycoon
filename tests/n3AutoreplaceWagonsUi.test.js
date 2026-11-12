import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { autoreplaceCounts, wagonRowModels } from '../js/ui/windows/autoreplace.js';

/**
 * N3-G2: the autoreplace window also lists wagon models (trains' wagons, split per wagon). The counts are a pure
 * helper; rules themselves use the existing setAutoreplace / setGroupAutoreplace commands (not tested here).
 */
function setup() {
  const g = flatGame();
  const L = coalLine(g);
  g.state.date.year = 1930;
  const buy = (spec) => {
    const y = g.state.date.year;
    g.state.date.year = 1920;
    const r = g.buyVehicle(L.depotId, spec);
    g.state.date.year = y;
    expect(r.ok).toBe(true);
    return r.vehicle;
  };
  return { g, L, buy };
}

describe('N3-G2 autoreplace window wagon rows', () => {
  test('plain train: engine once, each wagon once under its wagon model', () => {
    const { g, buy } = setup();
    buy({ modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 3, cargoId: 'COAL' });
    const c = autoreplaceCounts(g.state.vehicles, null);
    expect(c.engines).toEqual({ eng_puffer: 1 });
    expect(c.wagons).toEqual({ wag_hopper: 3 });
    expect(wagonRowModels(c.wagons).map((m) => m.id)).toEqual(['wag_hopper']);
  });

  test('mixed consist is split per wagon model', () => {
    const { g, buy } = setup();
    buy({ modelId: 'eng_puffer', consist: [
      { modelId: 'wag_hopper', cargoId: 'COAL' },
      { modelId: 'wag_hopper', cargoId: 'COAL' },
      { modelId: 'wag_coach', cargoId: 'PASS' },
    ] });
    const c = autoreplaceCounts(g.state.vehicles, null);
    expect(c.wagons).toEqual({ wag_hopper: 2, wag_coach: 1 });
  });

  test('group scope counts only that group and skips rival-owned vehicles', () => {
    const { g, buy } = setup();
    const grp = g.createGroup('A').group;
    const a = buy({ modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    buy({ modelId: 'eng_puffer', wagonModelId: 'wag_coach', wagons: 4, cargoId: 'PASS' });
    a.groupId = grp.id;
    const inGroup = autoreplaceCounts(g.state.vehicles, grp.id);
    expect(inGroup.engines).toEqual({ eng_puffer: 1 });
    expect(inGroup.wagons).toEqual({ wag_hopper: 2 });
    const all = autoreplaceCounts(g.state.vehicles, null);
    expect(all.wagons).toEqual({ wag_hopper: 2, wag_coach: 4 });
    const rival = autoreplaceCounts([{ modelId: 'eng_puffer', ownerId: 7, kind: 'train', wagonModelId: 'wag_hopper', wagons: 5 }], null);
    expect(rival).toEqual({ engines: {}, wagons: {} });
  });

  test('wagonRowModels keeps only wagon-kind models, sorted by name', () => {
    const rows = wagonRowModels({ eng_puffer: 1, wag_hopper: 1, wag_coach: 1, unknown_x: 1 });
    expect(rows.map((m) => m.id)).toEqual(['wag_hopper', 'wag_coach']); // by name: Hopper Wagon, Passenger Coach
  });
});
