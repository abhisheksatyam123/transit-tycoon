/**
 * Monthly town statistics and growth (new houses, upgrades, street extensions).
 */
import { pickStyle, tileDist } from './scenarios/moscowStyles.js';
import { DIR_BY_BIT, OPPOSITE } from './constants.js';

import { placeHouse, nextToRoad, layStreet, recomputePopulation } from './towns.js';
import { pushNews } from './news.js';
import { nextGrowthAction } from './townLayout.js';

/** Population milestones that trigger news. */
export const MILESTONES = [500, 1000, 2000, 3000, 5000, 8000, 12000];

/**
 * Month end statistics roll for a town (growth itself is driven per town tick by loco/town.js,
 * see Town::tick / Town::updateMonthly there): last-month figures, counters reset, population, news.
 */
export function rollTownStats(state, town) {
  town.passengersLastMonth = town.passengersThisMonth;
  town.mailLastMonth = town.mailThisMonth;
  town.passengersTransported = town.transportedThisMonth;
  town.goodsDeliveredLastMonth = town.goodsThisMonth;
  town.goodsDelivered = town.goodsThisMonth;
  town.passengersThisMonth = 0; town.mailThisMonth = 0; town.transportedThisMonth = 0;
  town.goodsThisMonth = 0; town.deliveredPassThisMonth = 0;
  const before = town.population;
  recomputePopulation(state, town);
  for (const m of MILESTONES) {
    if (before < m && town.population >= m) {
      pushNews(state, `${town.name} has grown to a population of ${town.population}!`, 'good', town.x, town.y);
    }
  }
}

/** Town radius used for growth. */
function townRadius(town) {
  return 4 + Math.floor(Math.sqrt(town.houses.length) * 1.3);
}

/**
 * One growth step: try new house next to road; else upgrade house; else extend street.
 * @returns {boolean}
 */
export function growOnce(state, rng, town) {
  const { map } = state;
  const r = townRadius(town);
  const roll = rng.next();
  if (roll < 0.6) {
    for (let a = 0; a < 25; a++) {
      const x = town.x + rng.int(-r, r), y = town.y + rng.int(-r, r);
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const t = map.tiles[y * map.width + x];
      if (t.terrain === 'water' || t.building || t.rail || t.road) continue;
      if (!nextToRoad(map, x, y)) continue;
      if (placeHouse(state, rng, town, x, y, 1)) {
        if (state.scenario === 'moscow') {
          const k = state.scenarioMeta?.focus ?? town;
          map.tiles[y * map.width + x].building.style = pickStyle(rng, tileDist(x, y, k.x, k.y), false);
        }
        return true;
      }
    }
  }
  if (roll < 0.85 && town.houses.length) {
    const h = rng.pick(town.houses);
    const t = map.tiles[h.y * map.width + h.x];
    if (t.building && t.building.type === 'house' && t.building.level < 4) {
      const d = Math.abs(h.x - town.x) + Math.abs(h.y - town.y);
      if (d < r || rng.chance(0.3)) { t.building.level++; return true; }
    }
  }
  return extendStreet(state, rng, town, r);
}

/**
 * Extend a dead end straight on, as OpenTTD towns grow: only from a town road
 * tile with exactly one link, continuing that line, and stopping before the
 * new street would run beside another road (no 1-tile parallel roads, no stubs).
 * @returns {boolean}
 */
function extendStreet(state, rng, town, r) {
  const { map } = state;
  const layout = town.layout || 'better';
  for (let a = 0; a < 30; a++) {
    const x = town.x + rng.int(-r, r), y = town.y + rng.int(-r, r);
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const t = map.tiles[y * map.width + x];
    if (!t.road || t.owner !== 'town' || t.rail) continue;
    if (t.road & (t.road - 1)) continue; // not a dead end
    let dir = OPPOSITE[t.road];
    const len = rng.int(2, 4);
    const pts = [];
    let cx = x, cy = y;
    for (let i = 0; i < len; i++) {
      const d = DIR_BY_BIT[dir];
      const nx = cx + d.dx, ny = cy + d.dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) break;
      const pt = map.tiles[ny * map.width + nx];
      if (pt.building || pt.rail || pt.road || pt.terrain === 'water') break;
      // OpenTTD GrowTownInTile: layout decides whether/where the road continues
      const step = nextGrowthAction(state, rng, town, nx, ny, dir, layout);
      if (step.action === 'stop') break;
      pts.push({ x: nx, y: ny });
      cx = nx; cy = ny; dir = step.dir;
      if (step.action === 'house' || step.action === 'turn') break;
    }
    if (pts.length < 1) continue;
    if (layStreet(state, [{ x, y }, ...pts]) > 1) return true;
  }
  return false;
}
/**
 * Record passengers delivered to a town or goods delivered (boosts growth).
 */
export function recordTownDelivery(town, cargoId, amount) {
  if (cargoId === 'GOOD') { town.goodsThisMonth += amount; town.goodsDelivered += amount; }
  else if (cargoId === 'PASS' || cargoId === 'MAIL') town.deliveredPassThisMonth += amount;
}
