/** N8: AI rival fixes — HQ ownership on demolish, bankruptcy wind-up state, takeover cash/price edge cases,
 * station-owner town rating, aiCompanies toggled off mid-game, all-or-nothing airport upgrades, effective
 * max age in AI renewal. Rival paths only: the default (no rivals) path is covered by the existing tests. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { ensureRivals, updateMonthly as aiMonthly, BANKRUPT_MONTHS } from '../js/simulation/aiCompanies.js';
import { RIVAL_OWNED } from '../js/simulation/owner.js';
import { clearArea } from '../js/simulation/map.js';
import { buildHQ } from '../js/simulation/cmdHQ.js';
import { createStation } from '../js/simulation/stations.js';
import { updateAuthorityMonthly, townRating } from '../js/simulation/townAuthority.js';
import { updateDaily } from '../js/simulation/loco/townManager.js';
import { buildAirRoute } from '../js/simulation/aiAir.js';
import { airportType, airportTypeId } from '../js/simulation/airportTypes.js';
import { COSTS } from '../js/config/costs.js';
import { constructionTotal } from '../js/simulation/prices.js';
import { upgradeRivalAirports } from '../js/simulation/aiAirUpgrade.js';
import { renewRivalFleet } from '../js/simulation/aiRenew.js';

const flat = (g, x0 = 4, y0 = 4, x1 = 40, y1 = 40) => {
  const s = g.state;
  clearArea(s, x0, y0, x1, y1, 'grass');
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = s.map.tiles[y * s.map.width + x];
    t.height = 1; t.terrain = 'grass'; t.building = null; t.owner = null;
  }
};

function hqWorld(seed = 11) {
  const g = Game.create({ seed, width: 64, height: 64, townCount: 2 });
  flat(g);
  g.state.company.money = 1_000_000;
  const [r] = ensureRivals(g.state, 1);
  r.money = 1_000_000;
  return { g, r };
}

function hqTiles(g, hq) {
  const out = [];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const t = g.state.map.tiles[(hq.y + dy) * g.state.map.width + hq.x + dx];
    if (t.building && t.building.type === 'hq') out.push(t);
  }
  return out;
}

describe('N8 rival HQ demolish', () => {
  test('a rival HQ is refused; the player HQ is removed alone', () => {
    const { g, r } = hqWorld();
    expect(buildHQ(g.ctx, 10, 10).ok).toBe(true);
    expect(buildHQ(g.ctx, 14, 10, { owner: r.id }).ok).toBe(true);
    expect(hqTiles(g, g.state.company.hq).length).toBe(4);
    expect(hqTiles(g, r.hq).length).toBe(4);

    // any of the rival's four tiles: refused, nothing changes
    const bad = g.demolish(15, 11, 15, 11);
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe(RIVAL_OWNED);
    expect(g.state.company.hq).toBeTruthy();
    expect([g.state.company.hq.x, g.state.company.hq.y]).toEqual([10, 10]);
    expect(r.hq).toBeTruthy();
    expect(hqTiles(g, g.state.company.hq).length).toBe(4);
    expect(hqTiles(g, r.hq).length).toBe(4);

    // the player's own HQ: removed, the rival's stays
    const own = g.demolish(10, 10, 10, 10);
    expect(own.ok).toBe(true);
    expect(g.state.company.hq).toBeUndefined();
    expect(hqTiles(g, { x: 10, y: 10 }).length).toBe(0);
    expect(r.hq).toBeTruthy();
    expect(hqTiles(g, r.hq).length).toBe(4);
  });
});

describe('N8 rival bankruptcy wind-up', () => {
  test('no takeover offer, zero stats, no HQ record or tiles after wind-up', () => {
    const { g, r } = hqWorld();
    expect(buildHQ(g.ctx, 14, 10, { owner: r.id }).ok).toBe(true);
    r.money = -100_000; r.loan = 0;
    r.negValueMonths = BANKRUPT_MONTHS;
    r.takeoverOffer = { price: 0 };
    r.stats = { profit: 42, vehicles: 3 };
    // keep the player's own HQ to prove wind-up does not touch it
    expect(buildHQ(g.ctx, 10, 10).ok).toBe(true);
    aiMonthly({ state: g.state, ctx: g.ctx });
    expect(r.bankrupt).toBe(true);
    expect('takeoverOffer' in r).toBe(false);
    expect(r.stats).toEqual({ profit: 0, vehicles: 0 });
    expect('hq' in r).toBe(false);
    expect(hqTiles(g, { x: 14, y: 10 }).length).toBe(0);
    expect(g.state.company.hq).toBeTruthy();
    expect(hqTiles(g, g.state.company.hq).length).toBe(4);
  });
});

describe('N8 takeover edge cases', () => {
  test('negative rival cash is assumed as an expense and reconciles the player money', () => {
    const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 4 });
    const [r] = ensureRivals(g.state, 1);
    const rivalCash = -5000;
    r.money = rivalCash; r.loan = 10000;
    r.takeoverOffer = { price: 0 };
    g.state.company.money = -1000; // negative player cash: a free takeover is still allowed
    const m0 = g.state.company.money, loan0 = g.state.company.loan || 0;
    const res = g.acceptTakeover(r.id);
    expect(res.ok).toBe(true);
    expect(res.price).toBe(0);
    expect(g.state.company.money).toBe(m0 + rivalCash); // -1000 + -5000
    expect(g.state.company.loan).toBe(loan0 + 10000);
    expect(r.bankrupt).toBe(true);
    expect(r.taken).toBe(true);
  });

  test('a $0 share is buyable when the player is in the red', () => {
    const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 4 });
    setSetting(g.state, 'shares', true);
    setSetting(g.state, 'aiCompanies', 1);
    const [r] = ensureRivals(g.state, 1);
    r.companyValue = 0;
    r.foundedAt = g.state.date.year * 12 + g.state.date.month - 12;
    g.state.company.money = -100;
    const res = g.tradeShare(r.id, 'buy');
    expect(res.ok).toBe(true);
    expect(res.price).toBe(0);
    expect(g.state.company.money).toBe(-100);
    expect(r.playerShares).toBe(1);
  });
});

describe('N8 rival stations and the player town rating', () => {
  function townGame() {
    const g = Game.create({ seed: 42, width: 96, height: 96 });
    const s = g.state;
    flat(g);
    s.company.money = 5_000_000;
    s.towns = [{ id: 900, name: 'Testville', x: 30, y: 24, population: 0, houses: [], passengersLastMonth: 0,
      passengersTransported: 0, goodsDelivered: 0, growthCounter: 0, mailLastMonth: 0, passengersThisMonth: 0,
      transportedThisMonth: 0, mailThisMonth: 0, goodsThisMonth: 0, deliveredPassThisMonth: 0 }];
    return { g, s, town: s.towns[0] };
  }

  test('rival stations do not move the monthly player rating; player decay still applies', () => {
    const { g, s, town } = townGame();
    const played = g.buildRailStation(30, 27, 'x', 1);
    expect(played.ok).toBe(true);
    const own = s.stations.find((st) => st.id === played.stationId);
    own.lastPickup = { PASS: s.tick - 60 * 60 * 24 * 2 }; // stale: unserved
    const rival = createStation(s, 28, 27);
    rival.ownerId = 7;
    rival.tiles = [{ x: 28, y: 27, kind: 'bus' }];
    rival.lastPickup = { PASS: s.tick }; // served, but it is not the player's station
    expect(townRating(town)).toBe(500);
    for (let i = 0; i < 3; i++) updateAuthorityMonthly(s);
    expect(townRating(town)).toBe(500 - 3 * 15); // only the player's unserved station counts
  });

  test('a lone served rival station leaves the player rating unchanged', () => {
    const { s, town } = townGame();
    const rival = createStation(s, 30, 27);
    rival.ownerId = 7;
    rival.tiles = [{ x: 30, y: 27, kind: 'bus' }];
    rival.lastPickup = { PASS: s.tick };
    for (let i = 0; i < 6; i++) updateAuthorityMonthly(s);
    expect(townRating(town)).toBe(500);
  });

  test('the daily +1 tick ignores rival stations and keeps counting the player', () => {
    const { s, town } = townGame();
    const rival = createStation(s, 28, 27);
    rival.ownerId = 7;
    rival.tiles = [{ x: 28, y: 27, kind: 'bus' }];
    rival.lastPickup = { PASS: s.tick };
    rival.rating200 = { PASS: 200 };
    updateDaily({ state: s });
    expect(townRating(town)).toBe(500);
    const played = createStation(s, 31, 27);
    played.tiles = [{ x: 31, y: 27, kind: 'bus' }];
    played.lastPickup = { PASS: s.tick };
    played.rating200 = { PASS: 200 };
    updateDaily({ state: s });
    expect(townRating(town)).toBe(501);
  });
});

describe('N8 aiCompanies toggled off mid-game', () => {
  test('existing rivals keep ledger, interest and bankruptcy bookkeeping but stop building', () => {
    const g = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
    setSetting(g.state, 'aiCompanies', 1);
    g.stepDays(120);
    const r = g.state.rivals[0];
    expect(r).toBeTruthy();
    r.loan = 100_000;
    const hist = r.ledger.history.length;
    const values = r.valueHistory.length;
    const stations = r.stations.length, vehicles = r.vehicles.length;
    setSetting(g.state, 'aiCompanies', 0);
    aiMonthly({ state: g.state, ctx: g.ctx });
    expect(r.ledger.history.length).toBe(hist + 1);
    expect(r.valueHistory.length).toBeGreaterThanOrEqual(values);
    const latest = r.ledger.history[r.ledger.history.length - 1];
    expect(latest.byType.interest).toBeGreaterThan(0); // loan interest is still charged
    expect(r.stations.length).toBe(stations); // no new build decisions
    expect(r.vehicles.length).toBe(vehicles);
    expect(r.bankrupt).toBeFalsy();
  });
});

describe('N8 all-or-nothing rival airport upgrade', () => {
  function pairWorld() {
    const g = Game.create({ seed: 7, width: 96, height: 96, townCount: 8 });
    setSetting(g.state, 'aiCompanies', 1);
    ensureRivals(g.state, 1);
    g.stepDays(30);
    const r = g.state.rivals[0];
    r.money = 1e8;
    g.state.date.year = 1975;
    for (const t of g.state.towns) t.population = 100;
    expect(buildAirRoute(g.ctx, r)).toBe(true);
    const rt = r.routes.find((q) => q.air);
    // the upgrade bar and the flat footprint at the first airport's corner (as aiUpgrade.test.js)
    g.state.date.year = 1985;
    for (const t of g.state.towns) t.population = 1000;
    const st = g.state.stations.find((s) => s.id === rt.a);
    const p0 = st.tiles.filter((p) => p.kind === 'airport');
    const ox = Math.min(...p0.map((p) => p.x)), oy = Math.min(...p0.map((p) => p.y));
    const base = g.state.map.tiles[oy * g.state.map.width + ox].height;
    for (let y = oy; y < oy + 4; y++) for (let x = ox; x < ox + 6; x++) g.state.map.tiles[y * g.state.map.width + x].height = base;
    // take the planes off the field so they do not block the upgrade
    g.state.vehicles = g.state.vehicles.filter((v) => !(v.ownerId === r.id && v.kind === 'aircraft'));
    r.vehicles = r.vehicles.filter((id) => g.state.vehicles.some((v) => v.id === id));
    return { g, r, rt };
  }

  test('cash between one and two airport costs: neither end moves', () => {
    const { g, rt } = pairWorld();
    const snap = g.serialize();
    const attempt = (money) => {
      const g2 = Game.deserialize(snap);
      const r2 = g2.state.rivals[0];
      r2.money = money;
      const ok = upgradeRivalAirports(g2.ctx, r2);
      return { ok, g2, r2 };
    };
    const unit = constructionTotal(g.state, airportType('commuter').cost + COSTS.demolishStation * 12);
    let hi = Math.max(1, unit * 2);
    let res = attempt(hi);
    for (let i = 0; !res.ok && i < 4; i++) { hi *= 2; res = attempt(hi); }
    expect(res.ok).toBe(true);
    let lo = 0; // known failure
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (attempt(mid).ok) hi = mid; else lo = mid;
    }
    // hi = the exact combined cost; one less could pay for one end only
    const { ok, g2, r2 } = attempt(hi - 1);
    expect(ok).toBe(false);
    expect(r2.money).toBe(hi - 1);
    for (const id of [rt.a, rt.b]) {
      const tiles = g2.state.stations.find((s) => s.id === id).tiles.filter((p) => p.kind === 'airport');
      expect(tiles.length).toBe(12); // still the 4x3 small airport at both ends
      expect(tiles.every((p) => airportTypeId(g2.state.map.tiles[p.y * g2.state.map.width + p.x].building) === 'small')).toBe(true);
    }
  }, 120000);
});

describe('N8 rival renewal uses the effective max age', () => {
  test('extendVehicleLife defers an AI renewal; at 0 the same vehicle is renewed', () => {
    const g = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
    setSetting(g.state, 'aiCompanies', 1);
    ensureRivals(g.state, 1);
    g.stepDays(30);
    const r = g.state.rivals[0];
    r.money = 1e8;
    g.state.date.year = 2000;
    expect(buildAirRoute(g.ctx, r)).toBe(true);
    const rt = r.routes.find((q) => q.air);
    const v = g.state.vehicles.find((x) => x.ownerId === r.id && x.kind === 'aircraft');
    expect(v).toBeTruthy();
    v.age = v.maxAge + 10; // past the raw maximum, inside the extended one
    v.state = 'depot';
    v.depotId = rt.depot;
    setSetting(g.state, 'extendVehicleLife', 1);
    renewRivalFleet(g.ctx, r);
    expect(g.state.vehicles.some((x) => x.id === v.id)).toBe(true); // extension keeps it in service
    setSetting(g.state, 'extendVehicleLife', 0);
    renewRivalFleet(g.ctx, r);
    expect(g.state.vehicles.some((x) => x.id === v.id)).toBe(false); // without the extension it is renewed
    expect(g.state.vehicles.some((x) => x.ownerId === r.id && x.kind === 'aircraft' && x.age === 0)).toBe(true);
  }, 120000);
});
