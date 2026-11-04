import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { MOSCOW } from '../js/config/maps/moscow.js';

const real = MOSCOW && MOSCOW.width > 0 && (MOSCOW.roadClass || '').length > 0;

describe.skipIf(!real)('Moscow airports (T35)', () => {
  let g = null;
  const world = () => (g ??= Game.create({ scenario: 'moscow', seed: 1, startYear: 1950 }));

  test('SVO and VKO are built as airports with a hangar depot; DME is logged if it cannot be placed', () => {
    const { state } = world();
    const air = state.scenarioMeta.air;
    expect(air.airports.length).toBeGreaterThanOrEqual(2);
    for (const a of air.airports) {
      expect(state.stations.some((s) => s.id === a.stationId)).toBe(true);
      expect(state.depots.some((d) => d.id === a.depotId && d.kind === 'air')).toBe(true);
    }
    const dme = state.scenarioLog.some((l) => /airport DME/.test(l));
    expect(air.airports.some((a) => a.id === 'DME') || dme).toBe(true);
  }, 60000);

  test('airport footprints are 6x4 station tiles of kind airport', () => {
    const { state } = world();
    const tiles = state.map.tiles.filter((t) => t.building && t.building.kind === 'airport');
    expect(tiles.length).toBe(state.scenarioMeta.air.airports.length * 24);
  }, 60000);

  test('aircraft fly between airports', () => {
    const { state } = world();
    const planes = state.vehicles.filter((v) => v.kind === 'aircraft');
    expect(planes.length).toBeGreaterThanOrEqual(1);
    for (const v of planes) expect(v.orders.length).toBe(2);
  }, 60000);
});
