/**
 * Ported from OpenLoco (MIT), src/World/Town.cpp: Town::grow (0x00497348), findRoadExtent (0x00497FFC),
 * kSquareSearchRange/squareSearch (0x00463BD2), buildInitialRoad (0x00498101), constructBuilding (0x00498320),
 * addRoadJunction (0x00498388), appendToRoadEnd (0x004986EA), hasNearbyBuildings.
 *
 * Adaptation to the transit-tycoon tile model (road bits 1=N 2=E 4=S 8=W, houses = tile.building
 * {type:'house', level, variant}, town.houses list):
 *  - A "road piece + direction" (TrackAndDirection) is a tile plus the exit direction bit we walk out through.
 *  - findRoadExtent: same 9-ring square spiral around the town centre, same 50% "keep previous result" rule (one
 *    32-bit random value consumed bit by bit); the start direction is a random road bit of the chosen tile, reversed
 *    on prng.randBool().
 *  - Walk (max 75 steps): stop when the closest town is not this one; build a house beside the road
 *    (constructBuilding); step to the next tile; no road connection ahead -> appendToRoadEnd; branch: random pick of the
 *    connections; 2.5% (0x666/65536) chance to add a road junction (addRoadJunction) which ends the walk.
 *  - Road objects (ideal road, takeover, street lights, bridges, slopes) have no TT counterpart: omitted. Curves
 *    (2% in appendToRoadEnd) are omitted: TT road tiles are bit masks, the next appended tile bends instead.
 *  - Building object choice (size/era/availability/large buildings) -> house level: TT houses are 1x1; the level comes
 *    from the town size (cap) and centrality (as in towns.js buildTownLayout). "Large building update" -> level upgrade of
 *    an existing house with probability 1/32 (the !(srand & 0x7C000000) test).
 *  - TT_BUILD_CHANCE scales the success of a construction attempt so that growth stays at TT's pace (a grow call
 *    here can try a house at every step along up to 75 road tiles).
 *  - Moscow: houses and roads never enter ensembleBoxes (baked landmark sprites) and new houses get a Moscow style.
 */
import { DIR_BY_BIT, OPPOSITE } from '../constants.js';
import { layStreet, placeHouse, nextToRoad } from '../towns.js';
import { erasEnabled, eraHouse, houseAllowedInYear, pickEraHouse } from '../buildingEras.js';
import { roadAllowedHere, nextGrowthAction } from '../townLayout.js';
import { pickStyle, tileDist } from '../scenarios/moscowStyles.js';
import { ensembleBoxes } from '../scenarios/moscowTowns.js';
import { findRoadPath, layRoadPath } from '../townRoads.js';
import { labelComponents } from '../diagIssue.js';
import { TOWN_CORE_RADIUS } from '../diagChecksMap.js';

/** kBuildSpeedToGrowthPerTick */
export const BUILD_SPEED_TO_GROWTH_PER_TICK = [0, 1, 3, 5, 7, 9, 12, 16, 22, 0, 0, 0];
const MAX_STEPS = 75;
/** Chance that a construction attempt along the walked road is carried out (TT pacing, see header). */
const TT_BUILD_CHANCE = 0.01;
const BITS = [1, 2, 4, 8];
const MAX_LEVEL_BY_SIZE = [2, 3, 4, 4, 4];

/** kSquareSearchRange<9>: spiral of 100 offsets starting at (0,0). */
const SPIRAL = (() => {
  const dirs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  const out = [];
  let x = 0, y = 0;
  for (let i = 1; i <= 9; i += 2) {
    for (const [dx, dy] of dirs) for (let j = i; j !== 0; j--) { out.push([x, y]); x += dx; y += dy; }
    x += 1; y -= 1;
  }
  return out;
})();

const popcount = (v) => (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1);
const tileAt = (map, x, y) => (x < 0 || y < 0 || x >= map.width || y >= map.height ? null : map.tiles[y * map.width + x]);

const boxCache = new WeakMap();
/** Tiles that must stay free of new roads/houses (Moscow ensemble sprite boxes), else null. */
function protectedTiles(state) {
  if (state.scenario !== 'moscow') return null;
  let b = boxCache.get(state.map);
  if (!b) { b = ensembleBoxes(state.map); boxCache.set(state.map, b); }
  return b;
}

/** TownManager::getClosestTownAndDensity (id only). */
function closestTown(state, x, y) {
  let best = null, bd = Infinity;
  for (const t of state.towns) {
    const d = Math.abs(t.x - x) + Math.abs(t.y - y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

/** hasNearbyBuildings: any building within +-2 tiles. */
function countBuildings(map, x, y, r) {
  let n = 0;
  for (let yy = Math.max(0, y - r); yy <= Math.min(map.height - 1, y + r); yy++) {
    for (let xx = Math.max(0, x - r); xx <= Math.min(map.width - 1, x + r); xx++) {
      if (map.tiles[yy * map.width + xx].building) n++;
    }
  }
  return n;
}

/** findRoadExtent: -> {x, y, dir} or null. */
function findRoadExtent(game, town) {
  const { map } = game.state;
  let randVal = (game.rng.next() * 4294967296) >>> 0;
  let res = null;
  for (const [ox, oy] of SPIRAL) {
    const x = town.x + ox, y = town.y + oy;
    const t = tileAt(map, x, y);
    if (!t || !t.road || t.rail || t.building) continue;
    if (res) {
      const bit = randVal & 1;
      randVal = ((randVal >>> 1) | (randVal << 31)) >>> 0;
      if (bit) continue;
    }
    res = { x, y, t };
  }
  if (!res) return null;
  const bits = BITS.filter((b) => res.t.road & b);
  return { x: res.x, y: res.y, dir: bits[Math.floor(game.rng.next() * bits.length)] };
}

/**
 * M2: a street started by buildInitialRoad must join the town's core network, else the town-roads-split
 * diagnostic reports it (Moscow only; random worlds keep their original growth so their hash is unchanged).
 * Lays a short A* road from the new street to the nearest existing core road tile, if one is reachable.
 */
function joinStreetToCore(state, town, street) {
  const { map } = state;
  const R = TOWN_CORE_RADIUS, R2 = R * R;
  const inCore = (x, y) => (x - town.x) ** 2 + (y - town.y) ** 2 <= R2;
  const prot = protectedTiles(state);
  const own = new Set(street.map((p) => p.y * map.width + p.x));
  const goals = new Set();
  // only the network that holds the town's existing roads (the one the diagnostic measures against)
  const labels = labelComponents(map, 'road', () => true);
  let home = -1, bd = Infinity;
  for (let y = town.y - R; y <= town.y + R; y++) for (let x = town.x - R; x <= town.x + R; x++) {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height || !inCore(x, y)) continue;
    const i = y * map.width + x;
    if (!map.tiles[i].road || own.has(i)) continue;
    const d = (x - town.x) ** 2 + (y - town.y) ** 2;
    if (d < bd) { bd = d; home = labels[i]; }
  }
  if (home < 0) return;
  const R2x = 4 * R2;
  for (let y = town.y - 2 * R; y <= town.y + 2 * R; y++) for (let x = town.x - 2 * R; x <= town.x + 2 * R; x++) {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height || (x - town.x) ** 2 + (y - town.y) ** 2 > R2x) continue;
    const i = y * map.width + x;
    if (map.tiles[i].road && !own.has(i) && labels[i] === home) goals.add(i);
  }
  if (!goals.size) return;
  const allowed = (x, y) => (x - town.x) ** 2 + (y - town.y) ** 2 <= 4 * R2 && !(prot && prot[y * map.width + x]);
  const path = findRoadPath(map, street, goals, { x: town.x, y: town.y }, allowed);
  if (path) layRoadPath(state, path);
}

/** buildInitialRoad: first free tile of the spiral gets a two-tile street in a random direction. */
function buildInitialRoad(game, town) {
  const { state, rng } = game;
  const { map } = state;
  const prot = protectedTiles(state);
  for (const [ox, oy] of SPIRAL) {
    const x = town.x + ox, y = town.y + oy;
    const t = tileAt(map, x, y);
    if (!t || t.terrain === 'water' || t.building || t.rail || t.road || t.object) continue;
    if (prot && prot[y * map.width + x]) continue;
    const d = DIR_BY_BIT[BITS[rng.int(0, 3)]];
    if (layStreet(state, [{ x, y }, { x: x + d.dx, y: y + d.dy }]) > 1) {
      if (state.scenario === 'moscow') joinStreetToCore(state, town, [{ x, y }, { x: x + d.dx, y: y + d.dy }]);
      return true;
    }
  }
  return false;
}

/**
 * M3 (Moscow only): monthly repair of a town's core road network. Any core road piece that is not on
 * the town's largest network piece is joined to it by a short road (<= REPAIR_MAX_LEN tiles), mirroring
 * OpenTTD towns that only grow from connected road. Returns the number of joins laid.
 */
const REPAIR_MAX_LEN = 24;
export function repairTownRoads(state, town, labels) {
  const { map } = state;
  const W = map.width, R = TOWN_CORE_RADIUS, R2 = R * R;
  const inCore = (x, y) => (x - town.x) ** 2 + (y - town.y) ** 2 <= R2;
  const count = new Map();
  for (let y = town.y - R; y <= town.y + R; y++) for (let x = town.x - R; x <= town.x + R; x++) {
    if (x < 0 || y < 0 || x >= W || y >= map.height || !inCore(x, y)) continue;
    const l = labels[y * W + x];
    if (l >= 0) count.set(l, (count.get(l) || 0) + 1);
  }
  if (count.size < 2) return 0;
  let main = -1, best = -1;
  for (const [l, c] of count) if (c > best || (c === best && l < main)) { best = c; main = l; }
  const prot = protectedTiles(state);
  const allowed = (x, y) => (x - town.x) ** 2 + (y - town.y) ** 2 <= 4 * R2 && !(prot && prot[y * W + x]);
  let joins = 0;
  for (const [l] of count) {
    if (l === main) continue;
    const sources = [], goals = new Set();
    for (let y = town.y - 2 * R; y <= town.y + 2 * R; y++) for (let x = town.x - 2 * R; x <= town.x + 2 * R; x++) {
      if (x < 0 || y < 0 || x >= W || y >= map.height || (x - town.x) ** 2 + (y - town.y) ** 2 > 4 * R2) continue;
      const i = y * W + x;
      if (labels[i] === l && map.tiles[i].road) sources.push({ x, y });
      else if (labels[i] === main && map.tiles[i].road) goals.add(i);
    }
    if (!sources.length || !goals.size) continue;
    const path = findRoadPath(map, sources, goals, { x: town.x, y: town.y }, allowed);
    if (path && path.length <= REPAIR_MAX_LEN) { layRoadPath(state, path); joins++; }
  }
  return joins;
}

/** constructBuilding: house (or upgrade) on a random side of the road tile (x, y) heading `dir`. */
function constructBuilding(game, town, x, y, dir) {
  const { state, rng } = game;
  const { map } = state;
  const sides = [BITS[(BITS.indexOf(dir) + 1) % 4], BITS[(BITS.indexOf(dir) + 3) % 4]];
  const d = DIR_BY_BIT[sides[rng.next() < 0.5 ? 0 : 1]];
  if (!rng.chance(TT_BUILD_CHANCE)) return;
  const bx = x + d.dx, by = y + d.dy;
  const t = tileAt(map, bx, by);
  if (!t) return;
  const cap = MAX_LEVEL_BY_SIZE[town.size] ?? 4;
  if (t.building) {
    if (t.building.type === 'house' && t.building.townId === town.id && t.building.level < cap && rng.chance(1 / 32)) {
      t.building.level++;
    }
    return;
  }
  if (t.terrain === 'water' || t.road || t.rail) return;
  const prot = protectedTiles(state);
  if (prot && prot[by * map.width + bx]) return;
  const R = 4 + Math.floor(Math.sqrt(town.houses.length) * 1.3);
  const dist = Math.abs(bx - town.x) + Math.abs(by - town.y);
  const centrality = Math.max(0, 1 - dist / (R * 1.5));
  const level = Math.max(1, Math.min(cap, 1 + Math.floor(centrality * 3 * rng.range(0.6, 1.3))));
  if (!placeHouse(state, rng, town, bx, by, level)) return;
  if (state.scenario === 'moscow') {
    const k = state.scenarioMeta?.focus ?? town;
    t.building.style = pickStyle(rng, tileDist(bx, by, k.x, k.y), false);
  }
}

/** appendToRoadEnd: lay one road tile at (x, y), joined to the tile behind it (direction `dir`). */
function appendToRoadEnd(game, town, fromX, fromY, x, y, dir, iteration) {
  const { state } = game;
  const { map } = state;
  const t = tileAt(map, x, y);
  if (!t || t.road || t.building || t.rail || t.object || t.terrain === 'water') return false;
  const prot = protectedTiles(state);
  if (prot && prot[y * map.width + x]) return false;
  if (iteration >= 2 && countBuildings(map, x, y, 2) < 2) return false;
  const layout = town.layout || 'better';
  const step = nextGrowthAction(state, game.rng, town, x, y, dir, layout);
  if (step.action === 'stop') return false;
  return layStreet(state, [{ x: fromX, y: fromY }, { x, y }]) > 1;
}

/** addRoadJunction: add a side road at (x, y) (a straight/curved piece); the new arm gets its first tile. */
function addRoadJunction(game, town, x, y) {
  const { state, rng } = game;
  const { map } = state;
  const t = tileAt(map, x, y);
  if (!t || t.rail || t.building || t.highway || t.object || t.owner !== 'town') return false;
  if (popcount(t.road) > 2) return false;
  if (!rng.chance(0x666 / 65536)) return false;
  const edges = BITS.filter((b) => !(t.road & b));
  if (!edges.length) return false;
  const e = edges[Math.floor(rng.next() * edges.length)];
  const d = DIR_BY_BIT[e];
  const nx = x + d.dx, ny = y + d.dy;
  const n = tileAt(map, nx, ny);
  if (!n || n.road || n.building || n.rail || n.object || n.terrain === 'water') return false;
  const prot = protectedTiles(state);
  if (prot && prot[ny * map.width + nx]) return false;
  const layout = town.layout || 'better';
  if (nextGrowthAction(state, rng, town, nx, ny, e, layout).action === 'stop') return false;
  return layStreet(state, [{ x, y }, { x: nx, y: ny }]) > 1;
}

/**
 * buildingEras: rebuild old houses whose type is past its max year (e.g. a 1950 cottage in 1960)
 * as the period type. Per growth step at most 4 replacements and 16 house checks (bounded cost).
 */
function renewObsoleteHouse(state, rng, town) {
  const { map } = state;
  const year = state.date.year;
  const hs = town.houses;
  if (!hs.length) return;
  let start = rng.int(0, hs.length - 1), done = 0;
  for (let k = 0; k < Math.min(hs.length, 16) && done < 4; k++) {
    const h = hs[(start + k) % hs.length];
    const t = map.tiles[h.y * map.width + h.x];
    if (!t || !t.building || t.building.type !== 'house' || t.building.style) continue;
    const cur = eraHouse(t.building.houseId);
    if (cur && houseAllowedInYear(cur, year)) continue;
    const hid = pickEraHouse(rng, t.building.level, year);
    if (hid === null) return;
    t.building.houseId = hid;
    done++;
  }
}

/** Town::grow. Returns true if the map changed (houses, roads or upgrades). */
export function growTown(game, town, { buildInitialRoadFlag = true, constructBuildings = true, allowRoadExpansion = true, allowRoadBranching = true } = {}) {
  const { state, rng } = game;
  // buildingEras: renewal happens on the same per-town growth step (off = no draws, unchanged)
  if (erasEnabled(state) && constructBuildings) renewObsoleteHouse(state, rng, town);
  const { map } = state;
  const ext = findRoadExtent(game, town);
  if (!ext) return buildInitialRoadFlag ? buildInitialRoad(game, town) : false;
  let { x, y, dir } = ext;
  if (rng.chance(0.5) && (map.tiles[y * map.width + x].road & OPPOSITE[dir])) dir = OPPOSITE[dir];
  let changed = false;
  const housesBefore = town.houses.length;

  for (let i = 0; i < MAX_STEPS; i++) {
    if (closestTown(state, x, y) !== town) break;
    const cur = map.tiles[y * map.width + x];
    if (constructBuildings && !cur.rail && !cur.highway) {
      const before = town.houses.length;
      constructBuilding(game, town, x, y, dir);
      if (town.houses.length !== before) changed = true;
    }
    const d = DIR_BY_BIT[dir];
    const nx = x + d.dx, ny = y + d.dy;
    const next = tileAt(map, nx, ny);
    if (!next) break;
    const back = OPPOSITE[dir];
    if (!(cur.road & dir) || !(next.road & back) || next.rail) {
      // no road connection ahead: appendToRoadEnd
      if (allowRoadExpansion && cur.owner === 'town' && !cur.building && !next.road && !next.rail
        && appendToRoadEnd(game, town, x, y, nx, ny, dir, i)) changed = true;
      break;
    }
    // connections: the exits of the next tile, excluding the way back
    const exits = BITS.filter((b) => (next.road & b) && b !== back);
    x = nx; y = ny;
    if (exits.length === 0) continue; // dead end: keep heading on, next iteration appends
    dir = exits.length === 1 ? exits[0] : exits[Math.floor(rng.next() * exits.length)];
    if (!allowRoadBranching) continue;
    if (addRoadJunction(game, town, x, y)) { changed = true; break; }
  }
  return changed || town.houses.length !== housesBefore;
}

/** The per-tick grow-call schedule of Town::tick. Returns true if anything grew. */
export function growForTick(game, town) {
  const per = BUILD_SPEED_TO_GROWTH_PER_TICK[town.buildSpeed] ?? 0;
  if (per === 0 || (per === 1 && (game.rng.int(0, 65535) & 7))) {
    return growTown(game, town, { constructBuildings: false, allowRoadExpansion: false, allowRoadBranching: false });
  }
  let grew = false;
  for (let c = 0; c < per; c++) if (growTown(game, town)) grew = true;
  return grew;
}
