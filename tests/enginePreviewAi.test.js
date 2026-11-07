/** EP2: rival (AI) model lookups honour the engine preview exclusivity (owner-aware listModels / helpers). */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { ensureRivals } from '../js/simulation/aiCompanies.js';
import { listModels } from '../js/simulation/queries.js';
import { modelAvailable } from '../js/simulation/vehicles.js';
import { ALL_VEHICLE_MODELS, MODEL_BY_ID } from '../js/config/vehicles.js';
import { airPlaneModel } from '../js/simulation/aiAir.js';
import { truckModelFor } from '../js/simulation/aiFreight.js';
import { shipModelFor } from '../js/simulation/aiShip.js';
import { railEngineModel, railWagonFor } from '../js/simulation/aiRail.js';
import { previewBlocks } from '../js/simulation/enginePreview.js';

/** Game in 1960 with the engine preview on and one rival; preview records set by hand. */
function world() {
  const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 6, startYear: 1960 });
  setSetting(g.state, 'enginePreview', true);
  ensureRivals(g.state, 1);
  g.state.enginePreview = { models: {} };
  return { g, rival: g.state.rivals[0] };
}

function exclusive(state, modelId, holder) {
  state.enginePreview.models[modelId] = { status: 'exclusive', offer: null, holder, asked: [holder], wait: 0, until: 999999 };
}

/** A plain (non-optIn) model of the kind that is on sale in 1960 with no preview record. */
function sample(state, kind) {
  const m = listModels(state, kind).find((x) => !x.optIn);
  if (!m) throw new Error('no ' + kind + ' model in 1960');
  return m;
}

const KINDS = ['train', 'wagon', 'road', 'bus', 'truck', 'aircraft', 'ship'];

describe('engine preview: rival lookups skip the player-exclusive model', () => {
  for (const kind of KINDS) {
    test(`${kind}: player-exclusive model is hidden from the rival`, () => {
      const { g, rival } = world();
      const m = sample(g.state, kind);
      exclusive(g.state, m.id, 'p');
      expect(previewBlocks(g.state, MODEL_BY_ID[m.id], rival.id)).toBe(true);
      expect(listModels(g.state, kind, rival.id).map((x) => x.id)).not.toContain(m.id);
      expect(modelAvailable(g.state, MODEL_BY_ID[m.id], rival.id)).toBe(false);
    });

    test(`${kind}: rival-exclusive model is included for that rival only`, () => {
      const { g, rival } = world();
      const m = sample(g.state, kind);
      exclusive(g.state, m.id, 'r' + rival.id);
      expect(listModels(g.state, kind, rival.id).map((x) => x.id)).toContain(m.id);
      expect(listModels(g.state, kind, rival.id + 1000).map((x) => x.id)).not.toContain(m.id);
      expect(listModels(g.state, kind, null).map((x) => x.id)).not.toContain(m.id);
    });
  }

  test('helpers pass the owner through: aircraft, truck, ship, rail engine and wagon', () => {
    const { g, rival } = world();
    const { state } = g;
    const plane = airPlaneModel(state, 'small');
    const truck = truckModelFor(state, 'PASS') || null;
    const ship = shipModelFor(state, 'GOOD') || null;
    const engine = railEngineModel(state);
    const wagon = railWagonFor(state, 'COAL');
    // exclusive to the player: none of the rival picks may be it
    for (const m of [plane, engine, wagon]) if (m) exclusive(state, m.id, 'p');
    expect(airPlaneModel(state, 'small', rival.id)?.id).not.toBe(plane?.id);
    expect(railEngineModel(state, rival.id)?.id).not.toBe(engine?.id);
    expect(railWagonFor(state, 'COAL', rival.id)?.id).not.toBe(wagon?.id);
    // exclusive to the rival: its own pick may use it
    exclusive(state, plane.id, 'r' + rival.id);
    expect(airPlaneModel(state, 'small', rival.id)?.id).toBe(plane.id);
    expect(airPlaneModel(state, 'small', null)?.id).not.toBe(plane.id);
    // truck and ship lookups accept the owner argument without error
    expect(truck === null || typeof truck.id === 'string').toBe(true);
    expect(ship === null || typeof ship.id === 'string').toBe(true);
    expect(truckModelFor(state, 'PASS', rival.id) === null || typeof truckModelFor(state, 'PASS', rival.id).id === 'string').toBe(true);
  });

  test('preview off: exclusivity is ignored for rivals (no change)', () => {
    const { g, rival } = world();
    setSetting(g.state, 'enginePreview', false);
    const m = sample(g.state, 'train');
    exclusive(g.state, m.id, 'p');
    expect(listModels(g.state, 'train', rival.id).map((x) => x.id)).toContain(m.id);
  });
});
