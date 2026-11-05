/**
 * Ported from OpenLoco (MIT), src/Map/TileManager.cpp: tick (0x00463ABA) / updateYearly (0x0047AB9B), and the building
 * part of the tile loop, src/Map/BuildingElement.cpp BuildingElement::tick (0x0042DF8B).
 *
 * TileManager::tick visits 1/256 of the map per tick (every 16th tile in x and y, start offset advanced by 9 each
 * tick -> every tile is visited once per 256 ticks, ~2.7 days). We do the same, only handling tiles with a house.
 * Surface/tree/road/industry element ticks have no TT counterpart here (industries and trees are handled elsewhere).
 *
 * BuildingElement mapping (tile.building {type:'house', level, variant, townId}):
 *  - unk5u (3 bit counter) -> building.ageTick; age (0..63) -> building.age. Houses are always "constructed" (TT places
 *    finished houses), so the construction animation phase is skipped.
 *  - age >= 40: removal if rand16 <= 16 (OpenLoco removes the building and lets the town re-grow). Replacement is done in
 *    place here (new variant, age 0, same level) so hand-built (Moscow) districts do not vanish.
 *  - producedCargoType/producedQuantity -> passengers = HOUSE_POP[level]/3 per month, mail = pop/15 per month; the
 *    quantity Q (byte) is derived so the expected production of the original randArr formula (amount = r/4+1 for r < Q)
 *    matches those monthly figures (11.4 tile ticks per house per month).
 *  - StationManager::deliverCargoToNearbyStations -> cargo.js servingStations/deliverToStations on the cached coverage.
 *  - town->var_19C[i][0|1] (produced/transported) -> town.passengersThisMonth/mailThisMonth, transportedThisMonth.
 */
import { servingStations, deliverToStations } from '../cargo.js';
import { buildCoverage } from '../stations.js';
import { HOUSE_POP } from '../towns.js';
import { updateDaily as townUpdateDaily } from './townManager.js';

const TILE_TICKS_PER_MONTH = (30.4 * 96) / 256;
const REMOVE_AGE = 40;
const MAX_AGE = 63;

/** Producible quantity Q such that E[amount] = Q^2/2048 + Q/256 equals `perMonth / tile ticks`. */
function quantityFor(perMonth) {
  const m = perMonth / TILE_TICKS_PER_MONTH;
  return Math.max(0, Math.min(255, Math.round(-4 + Math.sqrt(16 + 2048 * m))));
}
const PASS_Q = HOUSE_POP.map((p) => quantityFor(p / 3));
const MAIL_Q = HOUSE_POP.map((p) => quantityFor(p / 15));

const coverageCache = new WeakMap();
const townCache = new WeakMap();

/** Coverage index, rebuilt only when the station set / geometry changes. */
function getCoverage(state) {
  const c0 = coverageCache.get(state);
  // the signature scan is itself O(stations): re-check it only every 16 ticks
  if (c0 && (state.tick & 15) !== 0) return c0.cov;
  let sig = state.stations.length;
  for (const st of state.stations) {
    sig = (sig * 31 + st.id) >>> 0;
    sig = (sig * 31 + st.tiles.length) >>> 0;
    for (const t of st.tiles) sig = (sig * 31 + t.x * 997 + t.y * 13 + (t.radius ?? 0)) >>> 0;
  }
  const c = coverageCache.get(state);
  if (c && c.sig === sig) return c.cov;
  const cov = buildCoverage(state);
  coverageCache.set(state, { sig, cov });
  return cov;
}

function townOf(state, id) {
  let c = townCache.get(state);
  if (!c || c.n !== state.towns.length) { c = { n: state.towns.length, map: new Map(state.towns.map((t) => [t.id, t])) }; townCache.set(state, c); }
  return c.map.get(id);
}

/** BuildingElement::tick for one house tile. */
function tickHouse(game, cov, i, x, y, b) {
  const { state, rng } = game;
  const town = townOf(state, b.townId);
  if (!town) return;
  // ageing: unk5u++ ; wraps to 0 -> age++
  b.ageTick = ((b.ageTick || 0) + 1) & 7;
  if (b.ageTick === 0 && (b.age || 0) < MAX_AGE) b.age = (b.age || 0) + 1;
  if ((b.age || 0) >= REMOVE_AGE && Math.floor(rng.next() * 65536) <= 16) {
    b.age = 0; b.variant = rng.int(0, 15); // rebuilt in place
  }
  const r16 = Math.floor(rng.next() * 65536);
  const level = b.level;
  const rp = r16 & 0xff, rm = r16 >> 8;
  let pass = 0, mail = 0;
  if (rp < PASS_Q[level]) pass = (rp >> 2) + 1;
  if (rm < MAIL_Q[level]) mail = (rm >> 2) + 1;
  if (!pass && !mail) return;
  town.passengersThisMonth += pass;
  town.mailThisMonth += mail;
  if (!cov.has(i)) return;
  if (pass) {
    const sp = servingStations(state, cov, [i], 'PASS', x, y);
    town.transportedThisMonth += deliverToStations(state, sp, 'PASS', pass, x, y);
  }
  if (mail) {
    const sm = servingStations(state, cov, [i], 'MAIL', x, y);
    deliverToStations(state, sm, 'MAIL', mail, x, y);
  }
}

/**
 * TileManager::tick: process the 1/256 slice of the map.
 * @param {object} game
 * @param {boolean} newDay true on the tick a new day started
 */
export function tick(game, newDay) {
  const s = game.state;
  if (newDay) townUpdateDaily(game);
  const { map } = s;
  const w = map.width, h = map.height, tiles = map.tiles;
  const start = (s.tileUpdateStart || 0) & 0xff;
  const cov = getCoverage(s);
  for (let y = start >> 4; y < h; y += 16) {
    for (let x = start & 15, i = y * w + x; x < w; x += 16, i += 16) {
      const b = tiles[i].building;
      if (b && b.type === 'house') tickHouse(game, cov, i, x, y, b);
    }
  }
  s.tileUpdateStart = (start + 9) & 0xff;
}

/** TileManager::updateYearly: (road/tram upkeep in OpenLoco; nothing for TT buildings). */
export function updateYearly(_game) {}
