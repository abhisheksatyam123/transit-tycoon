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
import { recessionHalve } from '../recession.js';
import { getSetting } from '../settings.js';

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

/**
 * OpenTTD Bitcount mode (economy.town_cargogen_mode = Bitcount) calibration.
 * OTTD produces on one quarter of the tile-loop visits (town_cmd.cpp:632-640), so a house is
 * offered a production visit TILE_TICKS_PER_MONTH / 4 = 2.85 times per month. A Binomial call
 * yields E[popcount(mask)] = genmax / 2 where genmax = (rate + 7) / 8, so choosing
 * genmax = round(2 * perMonth / 2.85) reproduces TT's monthly targets (pop/3 passengers,
 * pop/15 mail); rate = 8 * genmax - 7 makes (rate + 7) / 8 exactly genmax. Masks up to 32 bits.
 */
const PROD_VISITS_PER_MONTH = TILE_TICKS_PER_MONTH / 4;

/** Rate (0..255) whose Bitcount genmax matches `perMonth` at the gated visit frequency. */
export function bitcountRateFor(perMonth) {
  const genmax = Math.round((2 * perMonth) / PROD_VISITS_PER_MONTH);
  return Math.max(0, Math.min(255, genmax * 8 - 7));
}

/** Bitmask for a Bitcount rate: genmax = (rate + 7) / 8 bits (up to 32). */
export function bitcountMask(rate) {
  const genmax = (rate + 7) >> 3;
  return genmax >= 32 ? 0xffffffff : ((1 << genmax) - 1) >>> 0;
}

/** Population count of the low 32 bits (SWAR, no float ops). */
export function countBits(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

/** Bitcount amount for one cargo: CountBits(r & mask) * mult / 256 with mult = 256 (cancels). */
export function bitcountAmount(rate, r) {
  return countBits((r >>> 0) & bitcountMask(rate));
}

export const BITCOUNT_PASS_RATE = HOUSE_POP.map((p) => bitcountRateFor(p / 3));
export const BITCOUNT_MAIL_RATE = HOUSE_POP.map((p) => bitcountRateFor(p / 15));

/**
 * OpenTTD's 1/4 visit gate (town_cmd.cpp:636): a tile produces only when the tile's low two
 * bits match bits 8-9 of the tick counter. A house is visited every 256 ticks, so those bits
 * advance by one per visit and exactly one visit in four is active.
 */
export function bitcountVisitActive(tick, tileIndex) {
  return ((tick >> 8) & 3) === (tileIndex & 3);
}

/**
 * OpenTTD ScaleByCargoScale(amount, town=true): multiply by town_cargo_scale / 100. On a
 * truncation to 0 the original draws a random chance (~pct/100) to round back up to 1; here
 * that chance is deterministic and integer, keyed on the same cargo draw (no extra RNG).
 */
function scaleTownCargo(state, amount, r) {
  const pct = getSetting(state, 'townCargoScale');
  if (amount === 0 || pct === 100) return amount;
  const scaled = Math.floor((amount * pct) / 100);
  if (scaled > 0 || pct <= 0) return scaled;
  return (r % 100) < pct ? 1 : 0;
}

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
  // modifiedCatchment changes every radius: fold it into the signature so a live toggle rebuilds the index
  sig = (sig * 31 + (getSetting(state, 'modifiedCatchment') ? 1 : 0)) >>> 0;
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

/** BuildingElement::tick for one house tile. `mode` is read once per tick by `tick`. */
function tickHouse(game, cov, i, x, y, b, mode) {
  const { state, rng } = game;
  const town = townOf(state, b.townId);
  if (!town) return;
  // ageing: unk5u++ ; wraps to 0 -> age++
  b.ageTick = ((b.ageTick || 0) + 1) & 7;
  if (b.ageTick === 0 && (b.age || 0) < MAX_AGE) b.age = (b.age || 0) + 1;
  if ((b.age || 0) >= REMOVE_AGE && Math.floor(rng.next() * 65536) <= 16) {
    b.age = 0; b.variant = rng.int(0, 15); // rebuilt in place
  }
  const level = b.level;
  let pass = 0, mail = 0;
  if (mode === 'bitcount') {
    // OpenTTD town_cmd.cpp:632-640: only one quarter of the tile-loop visits produce cargo,
    // keyed by the tile bits. TimerGameTick::counter advances 256 between visits of the same
    // tile, so bits 8-9 of the tick cycle through all four phases (1/4 of visits per house).
    if (bitcountVisitActive(state.tick, i)) {
      const rp = Math.floor(rng.next() * 4294967296) >>> 0;
      const rm = Math.floor(rng.next() * 4294967296) >>> 0;
      pass = recessionHalve(state, bitcountAmount(BITCOUNT_PASS_RATE[level], rp));
      mail = recessionHalve(state, bitcountAmount(BITCOUNT_MAIL_RATE[level], rm));
      pass = scaleTownCargo(state, pass, rp);
      mail = scaleTownCargo(state, mail, rm);
    }
  } else {
    // 'original': current OpenLoco-style path, unchanged (one shared r16, (r>>2)+1 if r<Q).
    const r16 = Math.floor(rng.next() * 65536);
    const rp = r16 & 0xff, rm = r16 >> 8;
    if (rp < PASS_Q[level]) pass = (rp >> 2) + 1;
    if (rm < MAIL_Q[level]) mail = (rm >> 2) + 1;
    pass = recessionHalve(state, pass); mail = recessionHalve(state, mail); // economyRecessions (OpenTTD TownGenerateCargo)
  }
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
  const mode = getSetting(s, 'townCargogenMode');
  const cov = getCoverage(s);
  for (let y = start >> 4; y < h; y += 16) {
    for (let x = start & 15, i = y * w + x; x < w; x += 16, i += 16) {
      const b = tiles[i].building;
      if (b && b.type === 'house') tickHouse(game, cov, i, x, y, b, mode);
    }
  }
  s.tileUpdateStart = (start + 9) & 0xff;
}

/** TileManager::updateYearly: (road/tram upkeep in OpenLoco; nothing for TT buildings). */
export function updateYearly(_game) {}
