/** N10: rival route builders preflight every step (and roll back a partial attempt) so a late failure
 * leaves no orphan stations, depots, routes, vehicles or track. Rival paths only. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { ensureRivals, buildRoute } from '../js/simulation/aiCompanies.js';
import { buildFreightRoute } from '../js/simulation/aiFreight.js';
import { stationSpot } from '../js/simulation/aiRail.js';
import { buildRailStation, buildDepot } from '../js/simulation/cmdStation.js';
import { beginRivalAttempt, rollbackRivalAttempt } from '../js/simulation/rivalAttempt.js';
import { DIRS } from '../js/simulation/constants.js';

function world(seed) {
  const g = Game.create({ seed, width: 96, height: 96, townCount: 8 });
  setSetting(g.state, 'aiCompanies', 1);
  const r = ensureRivals(g.state, 1)[0];
  r.money = 1e6;
  return { g, r };
}

/** Everything an attempt could add: records, owned tiles, and the map buildings that carry them. */
function assets(state, r) {
  let stationTiles = 0, depotTiles = 0, railTiles = 0, roadTiles = 0, rivalTiles = 0;
  for (const t of state.map.tiles) {
    if (t.building && t.building.type === 'station') stationTiles++;
    if (t.building && t.building.type === 'depot') depotTiles++;
    if (t.rail) railTiles++;
    if (t.road) roadTiles++;
    if (t.owner === 'rival' || t.rivalId != null) rivalTiles++;
  }
  return {
    stations: state.stations.length, depots: state.depots.length, routes: r.routes.length,
    vehicles: state.vehicles.length, stationTiles, depotTiles, railTiles, roadTiles, rivalTiles,
  };
}

function attempt(snapshot, money, build) {
  const g = Game.deserialize(snapshot);
  const r = g.state.rivals[0];
  r.money = money;
  return { ok: build(g.ctx, r), g, r };
}

/** Smallest cash at which `build` succeeds (deterministic integer binary search). */
function minMoney(snapshot, build, hi = 1 << 21) {
  while (!attempt(snapshot, hi, build).ok) {
    hi *= 2;
    if (hi > 1 << 28) throw new Error('build never succeeds');
  }
  let lo = 0;
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (attempt(snapshot, mid, build).ok) hi = mid; else lo = mid;
  }
  return hi;
}

describe('N10 rival builders: a late failure leaves no orphan assets', () => {
  test('bus route: one unit below the three construction costs builds nothing', () => {
    const { g, r } = world(37);
    const snapshot = g.serialize();
    const base = assets(g.state, r);
    const need = minMoney(snapshot, buildRoute);
    const bad = attempt(snapshot, need - 1, buildRoute);
    expect(bad.ok).toBe(false);
    expect(assets(bad.g.state, bad.r)).toEqual(base);
    expect(bad.r.money).toBe(need - 1); // no money was spent on a failed attempt
  }, 120000);

  test('freight route: one unit below the road+stops+depot costs builds nothing', () => {
    const { g, r } = world(2); // seed 2 has a producer/acceptor pair within the freight window
    const snapshot = g.serialize();
    const base = assets(g.state, r);
    const need = minMoney(snapshot, buildFreightRoute);
    const bad = attempt(snapshot, need - 1, buildFreightRoute);
    expect(bad.ok).toBe(false);
    expect(assets(bad.g.state, bad.r)).toEqual(base);
    expect(bad.r.money).toBe(need - 1);
  }, 120000);

  test('rollback undoes stations and depots built by a partial attempt, keeping earlier assets', () => {
    const { g, r } = world(15);
    const base = assets(g.state, r);
    const pair = { src: g.state.industries[0], dst: g.state.industries[1] };
    const sa = stationSpot(g.state, pair.src, { x: pair.dst.x, y: pair.dst.y });
    expect(sa).not.toBeNull();
    // preflight a depot beside a station tile, then snapshot every tile the attempt will touch
    let spot = null;
    for (const p of sa.tiles) for (const d of DIRS) {
      if (spot) break;
      const x = p.x + d.dx, y = p.y + d.dy;
      if (buildDepot(g.ctx, x, y, 'rail', d.bit, { owner: r.id, dryRun: true }).ok) spot = { x, y, dir: d.bit };
    }
    expect(spot).not.toBeNull();
    const attemptSnap = beginRivalAttempt(g.state, r, [...sa.tiles, { x: spot.x, y: spot.y }]);
    const st = buildRailStation(g.ctx, sa.x0, sa.y0, sa.axis, 3, { owner: r.id });
    expect(st.ok).toBe(true);
    const dep = buildDepot(g.ctx, spot.x, spot.y, 'rail', spot.dir, { owner: r.id });
    expect(dep.ok).toBe(true);
    expect(assets(g.state, r).stations).toBeGreaterThan(base.stations);
    rollbackRivalAttempt(attemptSnap);
    expect(assets(g.state, r)).toEqual(base);
    expect(g.state.stations.some((s) => s.ownerId === r.id)).toBe(false);
  }, 120000);
});
