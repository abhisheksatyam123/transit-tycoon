/**
 * Moscow scenario, towns and housing: districts become towns (max 60, farthest-point
 * sampling), every urban roadside tile gets a house assigned to its nearest town.
 */
import { placeHouse, nextToRoad, recomputePopulation } from '../towns.js';
import { allocId } from '../state.js';
import { manhattan } from '../state.js';
import { pickStyle, clampLevel, tileDist, LANDUSE_STYLE } from './moscowStyles.js';

/** Maximum number of towns created from districts. */
export const MAX_TOWNS = 80;

/** Catchment radius (tiles) of a district town: houses farther than this from every town stay empty. */
export const TOWN_CATCHMENT = 22;

/** Catchment radius (tiles) of the Kremlin/Tverskoy town (dense centre). */
export const CENTRE_CATCHMENT = 30;
/** Distance weight of the Kremlin/Tverskoy town when claiming tiles (<1 pulls the centre outward). */
export const CENTRE_PULL = 0.5;

/** Radius (tiles) of the dense centre inside the Garden Ring: houses at level 3, some 4. */
export const CENTRE_RADIUS = 18;

/** Share of dense centre houses that are towers (level 4); the rest are mid-rise (level 3). */
export const CENTRE_TOWER_SHARE = 0.35;

/** Blank town record with the same fields generateTowns uses. */
function blankTown(state, name, nameRu, x, y) {
  return {
    id: allocId(state), name, nameRu, x, y, population: 0, houses: [],
    passengersLastMonth: 0, passengersTransported: 0, goodsDelivered: 0, growthCounter: 0,
    mailLastMonth: 0, passengersThisMonth: 0, transportedThisMonth: 0, mailThisMonth: 0,
    goodsThisMonth: 0, deliveredPassThisMonth: 0,
  };
}

/** Squared distance. */
const d2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

/**
 * Pick at most `k` points from `pts` by farthest-point sampling, seeded with `seed`.
 * Deterministic: ties resolved by input order.
 */
export function farthestPoints(pts, k, seed) {
  if (pts.length <= k) return pts.slice();
  const chosen = [seed];
  const dist = pts.map((p) => d2(p.x, p.y, seed.x, seed.y));
  while (chosen.length < k) {
    let best = -1, bd = -1;
    for (let i = 0; i < pts.length; i++) if (dist[i] > bd) { bd = dist[i]; best = i; }
    const c = pts[best];
    chosen.push(c);
    for (let i = 0; i < pts.length; i++) dist[i] = Math.min(dist[i], d2(pts[i].x, pts[i].y, c.x, c.y));
  }
  return chosen;
}

/**
 * Create one town per district (plus a Kremlin town). Names: English name, else Russian.
 * @param {object} state game state (map already set)
 * @param {{name:string,nameEn?:string,x:number,y:number}[]} districts
 * @param {{x:number,y:number}} kremlin
 * @param {string[]} log warnings
 * @returns {object[]} towns
 */
export function makeTowns(state, districts, kremlin, log) {
  const used = new Set();
  const pts = districts
    .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y) && (d.nameEn || d.name))
    .map((d) => ({ x: d.x, y: d.y, name: d.nameEn || d.name, nameRu: d.name, sat: !!d.sat }));
  const seed = { x: kremlin.x, y: kremlin.y };
  // satellite cities (flag `sat`) always become towns; the rest fill the remaining slots by farthest-point sampling
  const must = pts.filter((p) => p.sat).slice(0, MAX_TOWNS - 1);
  const rest = pts.filter((p) => !p.sat);
  // farthestPoints returns the seed first; the seed has no name, so it is dropped here (the Kremlin town is added separately)
  const picked = [...must, ...farthestPoints(rest, MAX_TOWNS - 1 - must.length, seed).filter((p) => p.name)];
  const towns = [];
  const add = (name, nameRu, x, y) => {
    let n = name, i = 2;
    while (used.has(n)) n = `${name} ${i++}`;
    used.add(n);
    const t = blankTown(state, n, nameRu, x, y);
    state.towns.push(t);
    towns.push(t);
  };
  add('Kremlin / Tverskoy', 'Кремль / Тверской', kremlin.x, kremlin.y);
  for (const p of picked) add(p.name, p.nameRu, p.x, p.y);
  if (pts.length > MAX_TOWNS - 1) log.push(`towns: kept ${MAX_TOWNS} of ${pts.length} districts (farthest-point sampling)`);
  return towns;
}

/**
 * Land tile index nearest to a town centre among the given towns (brute force).
 * @returns {object} town
 */
function nearestTownOf(towns, x, y) {
  let best = towns[0], bd = Infinity;
  for (const t of towns) {
    const d = d2(t.x, t.y, x, y) * (t === towns[0] ? CENTRE_PULL : 1);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

/**
 * Town a tile belongs to, or null when it lies outside every catchment. Each town only
 * houses tiles within its own catchment (centre town wider), so isolated outer towns
 * cannot absorb whole sectors.
 */
export function catchmentTownOf(towns, x, y) {
  const t = nearestTownOf(towns, x, y);
  const r = t === towns[0] ? CENTRE_CATCHMENT : TOWN_CATCHMENT;
  return d2(t.x, t.y, x, y) <= r * r ? t : null;
}

/**
 * Urban courtyard blocks: a house may stand next to a road, or (dens >= 2) up to two tiles from
 * one, so dense blocks stay populated without a street on every block edge.
 * @returns {boolean}
 */
function houseSite(map, x, y, dens) {
  if (nextToRoad(map, x, y)) return true;
  if (dens < 2) return false;
  const W = map.width, H = map.height;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const t = map.tiles[ny * W + nx];
      if (t.road && t.terrain !== 'water') return true;
    }
  }
  return false;
}

/**
 * Place houses on urban road-side tiles. Density 0 tiles stay empty; level = density ±1
 * (deterministic per game rng); the centre within CENTRE_RADIUS is mostly level 3 with
 * CENTRE_TOWER_SHARE level 4; Moscow City's
 * core (within 3 tiles) is level 4; the Kremlin core stays empty. Centre houses belong to the
 * Kremlin/Tverskoy town (marks.centreTown).
 * @param {object} state
 * @param {object} rng game rng
 * @param {{n?:number}} L decoded layers (density string)
 * @param {object[]} towns
 * @param {{kremlin:{x,y}, city?:{x,y}}} marks landmark positions
 * @returns {number} houses placed
 */
export function placeHouses(state, rng, L, towns, marks) {
  const { map } = state;
  const W = map.width;
  let placed = 0;
  const kx = marks.kremlin.x, ky = marks.kremlin.y;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dens = Number(L.density[i]) || 0;
      if (dens < 1 || map.tiles[i].terrain === 'water' || map.tiles[i].terrain === 'forest') continue;
      if (manhattan(x, y, kx, ky) <= 5) continue;
      if (!houseSite(map, x, y, dens)) continue;
      const inCity = marks.city && d2(x, y, marks.city.x, marks.city.y) <= 9;
      const inCentre = d2(x, y, kx, ky) <= CENTRE_RADIUS * CENTRE_RADIUS;
      let level = Math.max(1, Math.min(4, dens + rng.int(-1, 1)));
      // historic centre is mostly 4–8 storey blocks (level 3) with scattered towers (level 4)
      if (inCentre) level = rng.chance(dens >= 2 ? CENTRE_TOWER_SHARE : CENTRE_TOWER_SHARE / 2) ? 4 : 3;
      if (inCity) level = 4;
      const town = inCentre && marks.centreTown ? marks.centreTown : catchmentTownOf(towns, x, y);
      if (!town) continue;
      // inside the Garden Ring commercial landuse is shops in historic blocks, not warehouses
      const lu = marks.landuse ? marks.landuse[i] : '';
      const style = (inCentre && lu === 'c' ? null : LANDUSE_STYLE[lu]) || pickStyle(rng, tileDist(x, y, kx, ky), !!inCity);
      level = clampLevel(style, level);
      if (placeHouse(state, rng, town, x, y, level)) {
        map.tiles[i].building.style = style;
        placed++;
      }
    }
  }
  for (const t of towns) recomputePopulation(state, t);
  return placed;
}
