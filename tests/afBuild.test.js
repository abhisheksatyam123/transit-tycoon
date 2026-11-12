/**
 * AF build round (OpenTTD ports, default-preserving):
 *  - construction.road_stop_on_competitor_road -> roadStopOnCompetitorRoad (buildRoadStop on competitor roads)
 *  - vehicle list sorts 'number' and 'capacity' (OpenTTD vehicle_gui.cpp ADI sorts), appended after existing keys
 *  - engine preview block (OpenTTD engine.cpp block_preview, 20 months) -> enginePreviewBlock (default off)
 */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { buildRoadStop } from '../js/simulation/cmdStation.js';
import { getTile } from '../js/simulation/map.js';
import { AXIS_BITS } from '../js/simulation/constants.js';
import { VEHICLE_SORTS, sortVehicles } from '../js/ui/windows/vehicleList.js';
import { ensureRivals } from '../js/simulation/aiCompanies.js';
import { bestCompanyKey, answerEnginePreview, BLOCK_DAYS } from '../js/simulation/enginePreview.js';
import { dayNumber } from '../js/simulation/date.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';

describe('roadStopOnCompetitorRoad (construction.road_stop_on_competitor_road)', () => {
  function roadTile(g, owner, rivalId) {
    const t = getTile(g.state.map, 20, 20);
    t.road = AXIS_BITS.x;
    t.owner = owner;
    if (rivalId != null) t.rivalId = rivalId;
    return t;
  }

  test('default is true and has exactly one SETTING_META entry in group construction', () => {
    expect(DEFAULT_SETTINGS.roadStopOnCompetitorRoad).toBe(true);
    const metas = SETTING_META.filter((m) => m.key === 'roadStopOnCompetitorRoad');
    expect(metas.length).toBe(1);
    expect(metas[0].group).toBe('construction');
  });

  test('default: a bus stop is allowed on a competitor (rival) road', () => {
    const g = flatGame();
    roadTile(g, 'rival', 3);
    expect(buildRoadStop(g.ctx, 20, 20, 'bus').ok).toBe(true);
  });

  test('false: a bus or truck stop on a competitor road is refused; own road still allowed', () => {
    const g = flatGame();
    setSetting(g.state, 'roadStopOnCompetitorRoad', false);
    roadTile(g, 'rival', 3);
    const r = buildRoadStop(g.ctx, 20, 20, 'bus');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('competitor roads');
    expect(buildRoadStop(g.ctx, 20, 20, 'truck').ok).toBe(false);

    const g2 = flatGame();
    setSetting(g2.state, 'roadStopOnCompetitorRoad', false);
    roadTile(g2, 'company');
    expect(buildRoadStop(g2.ctx, 20, 20, 'bus').ok).toBe(true);
  });

  test('false: a rival building on its own road is allowed; on the player road it is refused', () => {
    const g = flatGame();
    setSetting(g.state, 'roadStopOnCompetitorRoad', false);
    ensureRivals(g.state, 1);
    const own = g.state.rivals[0].id;
    roadTile(g, 'rival', own);
    expect(buildRoadStop(g.ctx, 20, 20, 'bus', { owner: own }).ok).toBe(true);

    const g2 = flatGame();
    setSetting(g2.state, 'roadStopOnCompetitorRoad', false);
    roadTile(g2, 'company');
    ensureRivals(g2.state, 1);
    const rid = g2.state.rivals[0].id;
    expect(buildRoadStop(g2.ctx, 20, 20, 'bus', { owner: rid }).ok).toBe(false);
  });
});

describe('vehicle list sorts: number and capacity', () => {
  const V = [
    { id: 30, name: 'C', unitNumber: 3, kind: 'road', capacity: 20 },
    { id: 10, name: 'A', unitNumber: 1, kind: 'road', capacity: 60 },
    { id: 20, name: 'B', unitNumber: 2, kind: 'road', capacity: 40 },
  ];

  test('default sort (name) first 3 rows are pinned and existing sort indices are unchanged', () => {
    expect(VEHICLE_SORTS[0][0]).toBe('name');
    expect(VEHICLE_SORTS[VEHICLE_SORTS.length - 2][0]).toBe('number');
    expect(VEHICLE_SORTS[VEHICLE_SORTS.length - 1][0]).toBe('capacity');
    expect(sortVehicles(V, {}).map((v) => v.id)).toEqual([10, 20, 30]);
  });

  // Fixture ids (30,10,20) and unit numbers (3,1,2) are in different orders, so this checks unit number, not id. See f3NumberSort.test.js.
  test('number sorts by unit number ascending (and descending)', () => {
    expect(sortVehicles(V, { sort: 'number', dir: 1 }).map((v) => v.id)).toEqual([10, 20, 30]);
    expect(sortVehicles(V, { sort: 'number', dir: -1 }).map((v) => v.id)).toEqual([30, 20, 10]);
  });

  test('capacity sorts by total capacity ascending', () => {
    expect(sortVehicles(V, { sort: 'capacity', dir: 1 }).map((v) => v.id)).toEqual([30, 20, 10]);
    expect(sortVehicles(V, { sort: 'capacity', dir: -1 }).map((v) => v.id)).toEqual([10, 20, 30]);
  });
});

describe('enginePreviewBlock (engine.cpp block_preview)', () => {
  const MODEL = 'eng_thunder';
  function world(block) {
    const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 6, startYear: 1957 });
    setSetting(g.state, 'enginePreview', true);
    if (block) setSetting(g.state, 'enginePreviewBlock', true);
    g.state.vehicles.push({ id: 900001, name: 'Train 1', unitNumber: 1, kind: 'train', modelId: 'eng_puffer' });
    // open a preview record for the model, offered to the player (no rivals: decline makes it public)
    g.state.enginePreview = { models: { [MODEL]: { status: 'offer', offer: 'p', holder: null, asked: ['p'], wait: 20 } } };
    return g;
  }

  test('default is off; a declined company is offered again immediately', () => {
    expect(DEFAULT_SETTINGS.enginePreviewBlock).toBe(false);
    expect(SETTING_META.filter((m) => m.key === 'enginePreviewBlock').length).toBe(1);
    const g = world(false);
    expect(answerEnginePreview(g.ctx, MODEL, false).ok).toBe(true);
    const rec = g.state.enginePreview.models[MODEL];
    expect(rec.block).toBeUndefined(); // lazy: nothing written on the default path
    // a fresh offer round (asked cleared): the declining player is picked again at once
    rec.asked = [];
    expect(bestCompanyKey(g.state, MODEL_BY_ID[MODEL], rec)).toBe('p');
  });

  test('on: a declined company is not offered for 20 months, then is again', () => {
    const g = world(true);
    expect(answerEnginePreview(g.ctx, MODEL, false).ok).toBe(true);
    const rec = g.state.enginePreview.models[MODEL];
    const today = dayNumber(g.state.date);
    expect(rec.block.p).toBe(today + BLOCK_DAYS);
    rec.asked = [];
    expect(bestCompanyKey(g.state, MODEL_BY_ID[MODEL], rec)).toBe(null);
    // day before the block ends: still blocked; at the block end: offered again
    g.stepDays(BLOCK_DAYS - 1);
    expect(bestCompanyKey(g.state, MODEL_BY_ID[MODEL], rec)).toBe(null);
    g.stepDays(1);
    expect(bestCompanyKey(g.state, MODEL_BY_ID[MODEL], rec)).toBe('p');
  });
});
