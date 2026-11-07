import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { buildRailStation } from '../js/simulation/cmdStation.js';
import { setSetting } from '../js/simulation/settings.js';
import { TERRA_ERR } from '../js/simulation/cmdTerraform.js';
import { cornerSlopeOk } from '../js/simulation/map.js';

const ERR_TRACK = 'Track or road in the way';
const R = (x0, y0, x1 = x0, y1 = y0) => ({ x0, y0, x1, y1 });
const h = (g, x, y) => g.tile(x, y).height;

/** Rail along y=24 from x=20..30 on the flat plateau (height 1), autoslope set as given. */
function railGame(autoslope) {
  const g = flatGame();
  setSetting(g.state, 'autoslope', autoslope);
  const r = g.buildRail(20, 24, 30, 24);
  expect(r.ok).toBe(true);
  return g;
}

describe('autoslope rule', () => {
  test('corner slope rule: flat and single-step inclines pass, corners and steeper fail', () => {
    expect(cornerSlopeOk([1, 1, 1, 1])).toBe(true);
    expect(cornerSlopeOk([1, 2, 2, 1])).toBe(true); // straight incline (E,S high)
    expect(cornerSlopeOk([2, 1, 1, 2])).toBe(true); // straight incline (N,W high, wraps around)
    expect(cornerSlopeOk([2, 1, 1, 1])).toBe(false); // single corner
    expect(cornerSlopeOk([1, 2, 1, 2])).toBe(false); // diagonal
    expect(cornerSlopeOk([1, 3, 3, 1])).toBe(false); // two levels
  });

  test('setting off: raising a plateau under track is refused as before', () => {
    const g = railGame(false);
    const r = g.terraform('raise', R(25, 16, 50, 32));
    expect(r.ok).toBe(false);
    expect(r.error).toBe(ERR_TRACK);
  });

  test('autoslope on: a straight track follows a raised plateau edge', () => {
    const g = railGame(true);
    const r = g.terraform('raise', R(25, 16, 50, 32));
    expect(r.ok).toBe(true);
    expect(h(g, 25, 24)).toBe(2);
    expect(h(g, 24, 24)).toBe(1);
    // the track bits survive the terraform
    for (let x = 20; x <= 30; x++) expect(g.tile(x, 24).rail).not.toBe(0);
  });

  test('autoslope on: refused when a single corner would break the straight track', () => {
    const g = railGame(true);
    const r = g.terraform('raise', R(25, 24));
    expect(r.ok).toBe(false);
    expect(r.error).toBe(TERRA_ERR.slope);
    expect(h(g, 25, 24)).toBe(1); // unchanged
  });

  test('autoslope on: still refused under a station', () => {
    const g = flatGame();
    setSetting(g.state, 'autoslope', true);
    expect(buildRailStation(g.ctx, 26, 24, 'x', 2).ok).toBe(true);
    const r = g.terraform('raise', R(25, 22, 28, 26));
    expect(r.ok).toBe(false);
    expect(r.error).toBe(TERRA_ERR.structure);
  });

  test('autoslope on: road follows a raised plateau edge; a single road corner is refused', () => {
    const g = flatGame();
    setSetting(g.state, 'autoslope', true);
    expect(g.buildRoad(20, 20, 30, 20).ok).toBe(true);
    expect(g.terraform('raise', R(25, 16, 50, 32)).ok).toBe(true);
    expect(h(g, 25, 20)).toBe(2);
    const g2 = flatGame();
    setSetting(g2.state, 'autoslope', true);
    expect(g2.buildRoad(20, 20, 30, 20).ok).toBe(true);
    const r = g2.terraform('raise', R(25, 20));
    expect(r.ok).toBe(false);
    expect(r.error).toBe(TERRA_ERR.slope);
  });

  test('autoslope on: terraform away from track is unchanged', () => {
    const g = railGame(true);
    expect(g.terraform('raise', R(40, 30)).ok).toBe(true);
  });
});
