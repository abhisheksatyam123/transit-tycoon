/** OpenTTD engine preview (enginePreview setting): exclusive offer, accept/decline, 365-day expiry, save/load. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting, getSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { modelAvailable } from '../js/simulation/vehicles.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { ensureRivals } from '../js/simulation/aiCompanies.js';
import { previewBlocks, pendingPlayerOffer, EXCLUSIVE_DAYS } from '../js/simulation/enginePreview.js';
import { listModels } from '../js/simulation/queries.js';
import * as EnginePreview from '../js/simulation/enginePreview.js';

/** 1957 world: eng_thunder (intro 1958) is next; setting optional. */
function world(on, rivals = 0) {
  const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 6, startYear: 1957 });
  if (on) setSetting(g.state, 'enginePreview', true);
  if (rivals) { setSetting(g.state, 'aiCompanies', rivals); ensureRivals(g.state, rivals); }
  return g;
}

/** Step to the intro year, then one more day: the daily offer runs on the day after the rollover (OTTD order). */
function intro(g) {
  while (g.state.date.year < 1958) g.stepDays(1);
  g.stepDays(1);
}

/** Make the player look like a company that runs trains, so it is a candidate. */
function giveTrain(g) {
  const v = { id: 900001, name: 'Train 1', unitNumber: 1, kind: 'train', modelId: 'eng_puffer' };
  g.state.vehicles.push(v);
}

describe('enginePreview', () => {
  test('default is off and the setting is in DEFAULT_SETTINGS', () => {
    expect(DEFAULT_SETTINGS.enginePreview).toBe(false);
    const g = world(false);
    expect(getSetting(g.state, 'enginePreview')).toBe(false);
  });

  test('setting off = unchanged availability; no preview state is created', () => {
    const g = world(false);
    g.stepDays(400);
    expect(g.state.enginePreview).toBeUndefined();
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_thunder, null)).toBe(true);
  });

  test('setting on: model held back from others during the preview, offered to the player', () => {
    const g = world(true);
    giveTrain(g);
    let offered = null;
    g.on('enginePreview', (e) => { offered = e.modelId; });
    // step into 1958 (intro of eng_thunder)
    intro(g);
    expect(offered).toBe('eng_thunder');
    expect(pendingPlayerOffer(g.state)).toBe('eng_thunder');
    // while the player has not answered, nobody can buy it
    expect(previewBlocks(g.state, MODEL_BY_ID.eng_thunder, null)).toBe(true);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_thunder, null)).toBe(false);
    expect(listModels(g.state, 'engine').some((m) => m.id === 'eng_thunder')).toBe(false);
  });

  test('accept: player gets the model; public after 365 days with the news', () => {
    const g = world(true);
    giveTrain(g);
    intro(g);
    expect(g.answerEnginePreview('eng_thunder', true).ok).toBe(true);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_thunder, null)).toBe(true);
    // a rival (not the holder) still cannot use it
    ensureRivals(g.state, 1);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_thunder, g.state.rivals[0].id)).toBe(false);
    g.stepDays(EXCLUSIVE_DAYS - 30);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_thunder, g.state.rivals[0].id)).toBe(false);
    g.stepDays(60);
    expect(previewBlocks(g.state, MODEL_BY_ID.eng_thunder, g.state.rivals[0].id)).toBe(false);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_thunder, g.state.rivals[0].id)).toBe(true);
    expect(g.state.enginePreview.models.eng_thunder.status).toBe('public');
    expect(g.state.news.some((n) => /New train now available: Thunder/.test(n.text))).toBe(true);
  }, 60000);

  test('decline: no answer 20 days later -> public at once (no rival to ask)', () => {
    const g = world(true);
    giveTrain(g);
    intro(g);
    expect(g.answerEnginePreview('eng_thunder', false).ok).toBe(true);
    expect(g.state.enginePreview.models.eng_thunder.status).toBe('public');
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_thunder, null)).toBe(true);
  }, 60000);

  test('unanswered offer times out after 20 days and goes public', () => {
    const g = world(true);
    giveTrain(g);
    intro(g);
    g.stepDays(25);
    expect(pendingPlayerOffer(g.state)).toBeNull();
    expect(g.state.enginePreview.models.eng_thunder.status).toBe('public');
  }, 60000);

  test('rival accepts automatically and holds the model exclusively', () => {
    const g = world(true, 1);
    const r = g.state.rivals[0];
    // only the rival runs trains, so it is the sole candidate; drive the daily hook directly (no AI monthly)
    g.state.vehicles.push({ id: 900002, name: 'Train 2', unitNumber: 2, kind: 'train', ownerId: r.id, modelId: 'eng_puffer' });
    EnginePreview.updateDaily(g); // 1957: creates the lazy state (eng_thunder not yet introduced)
    g.state.date.year = 1958; g.state.date.month = 0; g.state.date.day = 1;
    EnginePreview.updateDaily(g);
    const rec = g.state.enginePreview.models.eng_thunder;
    expect(rec.status).toBe('exclusive');
    expect(rec.holder).toBe('r' + r.id);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_thunder, r.id)).toBe(true);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_thunder, null)).toBe(false);
    expect(pendingPlayerOffer(g.state)).toBeNull();
  });

  test('save/load mid-offer keeps the pending offer and the holder', () => {
    const g = world(true);
    giveTrain(g);
    intro(g);
    g.stepDays(5);
    const json = serializeState(g.state);
    const back = parseState(json);
    expect(pendingPlayerOffer(back)).toBe('eng_thunder');
    expect(back.enginePreview.models.eng_thunder.wait).toBe(g.state.enginePreview.models.eng_thunder.wait);
    expect(previewBlocks(back, MODEL_BY_ID.eng_thunder, null)).toBe(true);
  }, 60000);
});
