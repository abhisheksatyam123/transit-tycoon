/**
 * F2: enginePreviewBlock must really gate the next preview cycle (review finding 2, commit 4f5f89f).
 *
 * Before the fix a company that declined was pushed into rec.asked, which is never reset, so the block
 * (BLOCK_DAYS = 600) was never reached in play: asked permanently excluded the company instead. The fix makes the
 * block the exclusion while it lasts, removes the declining company from asked, and re-runs the offer in a later
 * preview cycle (monthly) so the company is asked again once the block expires.
 *
 * The setting defaults OFF; the OFF tests pin that path to the unmodified behaviour.
 */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { answerEnginePreview, bestCompanyKey, pendingPlayerOffer, BLOCK_DAYS } from '../js/simulation/enginePreview.js';
import { dayNumber } from '../js/simulation/date.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';

const MODEL = 'eng_thunder';

/** 1957 world with the enginePreview setting on; enginePreviewBlock only when `block` is true. */
function world(block) {
  const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 6, startYear: 1957 });
  setSetting(g.state, 'enginePreview', true);
  if (block) setSetting(g.state, 'enginePreviewBlock', true);
  g.state.vehicles.push({ id: 900001, name: 'Train 1', unitNumber: 1, kind: 'train', modelId: 'eng_puffer' });
  // a model already offered to the player (the decline path itself is real: answerEnginePreview -> offerNext)
  g.state.enginePreview = { models: { [MODEL]: { status: 'offer', offer: 'p', holder: null, asked: ['p'], wait: 20 } } };
  return g;
}

function recOf(g) { return g.state.enginePreview.models[MODEL]; }

describe('enginePreviewBlock: real next preview cycle (F2)', () => {
  test('default is off', () => {
    expect(DEFAULT_SETTINGS.enginePreviewBlock).toBe(false);
  });

  test('on: a declining company is blocked, not asked, in the next cycle (before 600 days)', () => {
    const g = world(true);
    const rec = recOf(g);
    const declinedOn = dayNumber(g.state.date);
    expect(answerEnginePreview(g.ctx, MODEL, false).ok).toBe(true);

    expect(rec.block.p).toBe(declinedOn + BLOCK_DAYS);
    // the blocked company does not count as an asker: the block, not asked, excludes it
    expect(rec.asked).not.toContain('p');
    // waiting for the block, no offer outstanding
    expect(rec.status).toBe('offer');
    expect(rec.offer).toBe(null);
    expect(rec.retry).toBeDefined();

    // cycle 2: a month later, well before BLOCK_DAYS, the player is still not offered the model
    g.stepDays(31);
    expect(dayNumber(g.state.date)).toBeLessThan(declinedOn + BLOCK_DAYS);
    expect(rec.offer).toBe(null);
    expect(pendingPlayerOffer(g.state)).toBeNull();
    expect(bestCompanyKey(g.state, MODEL_BY_ID[MODEL], rec)).toBe(null);
    expect(rec.asked).not.toContain('p');
  }, 60000);

  test('on: after BLOCK_DAYS the company is offered the model again (without resetting asked)', () => {
    const g = world(true);
    const rec = recOf(g);
    const declinedOn = dayNumber(g.state.date);
    expect(answerEnginePreview(g.ctx, MODEL, false).ok).toBe(true);

    g.stepDays(610); // past the 600-day block; the monthly preview cycle must re-offer it
    expect(dayNumber(g.state.date) - declinedOn).toBeGreaterThan(BLOCK_DAYS);
    expect(rec.offer).toBe('p');
    expect(pendingPlayerOffer(g.state)).toBe(MODEL);
  }, 60000);

  test('off: behaviour is exactly the unmodified path (decline -> asked kept, model public)', () => {
    const g = world(false);
    const rec = recOf(g);
    expect(answerEnginePreview(g.ctx, MODEL, false).ok).toBe(true);
    // values derived from the unmodified code path (probe of the pre-fix enginePreview.js under $HOME/tmp)
    expect({ status: rec.status, offer: rec.offer, holder: rec.holder, asked: rec.asked, wait: rec.wait })
      .toEqual({ status: 'public', offer: null, holder: null, asked: ['p'], wait: 0 });
    expect(rec.block).toBeUndefined();
    expect(rec.retry).toBeUndefined();
    expect(bestCompanyKey(g.state, MODEL_BY_ID[MODEL], rec)).toBe(null);

    // and it stays exactly like that: no block, no re-offer cycle, no offer
    g.stepDays(31);
    expect({ status: rec.status, offer: rec.offer, holder: rec.holder, asked: rec.asked, wait: rec.wait })
      .toEqual({ status: 'public', offer: null, holder: null, asked: ['p'], wait: 0 });
    expect(rec.block).toBeUndefined();
    expect(rec.retry).toBeUndefined();
    expect(pendingPlayerOffer(g.state)).toBeNull();
  }, 60000);
});
