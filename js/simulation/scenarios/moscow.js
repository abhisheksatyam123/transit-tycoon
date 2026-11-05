/**
 * Moscow scenario: turns the baked MOSCOW map into a live game state. Entry point is
 * buildMoscow(game, map); the map object is passed in so tests can use a fixture.
 */
import { tl, TS } from './moscowScale.js';
import { PATH_MAX_NODES } from '../../config/traffic.js';
import { createMoscowMap, decodeLayers, applyTerrain, applyBits, markMajor, layLocalStreets, project, embankWaterRoads, upgradeTrunkRoads } from './moscowTiles.js';
import { makeTowns, placeHouses } from './moscowTowns.js';
import { buildMetroLine, pickMetroLines, metroGeometry } from './moscowMetro.js';
import { buildBusLines } from './moscowBuses.js';
import { buildAirports, airportReserve } from './moscowAirports.js';
import { placeIndustry } from '../industries.js';
import { createTraffic } from '../traffic.js';
import { recomputeAllAcceptance } from '../stations.js';
import { INDUSTRY_BY_ID } from '../../config/industries.js';
import { clearFootprint, pruneRoadIslands, joinRoadComponents, clearLinks, demolishHouseAt } from './moscowLand.js';
import { placeLandmarks } from './moscowLandmarks.js';
import { planIndustries, namedSiteFootprint } from './moscowIndustry.js';
import { recomputePopulation } from '../towns.js';
import { cleanRail } from './moscowRail.js';
import { cleanRoad } from './moscowRoad.js';

/** Starting company money for the real-city game. */
export const MOSCOW_MONEY = 4_000_000;

/** Minimum distance (tiles) from the Kremlin to any industry footprint. */
export const INDUSTRY_MIN_DIST = tl(30);

/** Industries at real outskirt sites (MKAD ring / industrial zones): [typeId, lat, lon, label]. */
export const INDUSTRY_SITES = [
  ['refinery', 55.6386, 37.797, 'Kapotnya oil refinery'],
  ['power_station', 55.878, 37.536, 'TETs-21 (north)'],
  ['power_station', 55.844, 37.806, 'TETs-23 (east)'],
  ['power_station', 55.66, 37.83, 'TETs-22 (south-east)'],
  ['power_station', 55.66, 37.453, 'TETs-25 (west)'],
  ['factory', 55.69, 37.74, 'Lyublino factory zone'],
  ['factory', 55.87, 37.6, 'Northern industrial zone'],
  ['steel_mill', 55.81, 37.56, 'Steel works'],
];

/** Landmark position by id, falling back to lat/lon. */
function landmark(map, id, fallback) {
  const l = (map.landmarks || []).find((q) => q.id === id);
  return l ? { x: l.x, y: l.y } : project(fallback[0], fallback[1]);
}

/**
 * Lay terrain, roads, rail and local streets onto state.map (replaces it).
 * @returns {{L:object,major:Uint8Array,streets:object}}
 */
export function buildTiles(state, map) {
  const L = decodeLayers(map);
  state.map = createMoscowMap(map);
  applyTerrain(state.map, L);
  applyBits(state.map, 'road', L.road);
  const major = markMajor(state.map, L);
  applyBits(state.map, 'rail', L.rail);
  embankWaterRoads(state.map);
  const streets = layLocalStreets(state.map, L, major, airportReserve(state.map, map));
  const highways = upgradeTrunkRoads(state.map, L);
  return { L, major, streets, highways };
}

/** Industries at the real sites (nearest clearable footprint). @returns {number} placed */
function buildIndustries(state, major, kremlin, log) {
  let placed = 0;
  for (const [typeId, lat, lon, label] of INDUSTRY_SITES) {
    const type = INDUSTRY_BY_ID[typeId];
    if (!type) { log.push(`industry ${label}: unknown type ${typeId}`); continue; }
    const c = project(lat, lon);
    const a = namedSiteFootprint(state, typeId, c.x, c.y, tl(8), major);
    if (!a) { log.push(`industry ${label}: no clearable site within ${tl(8)} tiles of ${c.x},${c.y}`); continue; }
    const far = Math.hypot(a.x + type.w / 2 - kremlin.x, a.y + type.h / 2 - kremlin.y);
    if (far < INDUSTRY_MIN_DIST) { log.push(`industry ${label}: site ${a.x},${a.y} only ${far.toFixed(1)} tiles from Kremlin, skipped`); continue; }
    if (!clearFootprint(state, a.x, a.y, type.w, type.h)) { log.push(`industry ${label}: site ${a.x},${a.y} not clearable`); continue; }
    placeIndustry(state, typeId, a.x, a.y);
    log.push(`industry ${label}: ${type.name} at ${a.x},${a.y} (${far.toFixed(0)} tiles from Kremlin)`);
    placed++;
  }
  return placed;
}

/**
 * Drop road/rail links on landmark footprints (a neighbouring track may have linked into them
 * after the footprint was cleared). Footprints are never part of a route.
 * @returns {number} footprint tiles cleared
 */
export function clearLandmarkLinks(map) {
  let n = 0;
  map.tiles.forEach((t, i) => {
    if (!t.building || t.building.type !== 'landmark' || !(t.road || t.rail)) return;
    clearLinks({ map }, i);
    delete t.tunnel;
    delete t.metroColor;
    n++;
  });
  return n;
}

/**
 * Mark surface tiles where a road and a rail share a tile without a level crossing (grade-separated).
 * Metro (tunnel) tiles are excluded: they never cross the road surface.
 * @returns {number} tiles marked
 */
export function markGradeSeparation(map) {
  let n = 0;
  for (const t of map.tiles) {
    if (t.road && t.rail && !t.tunnel) { t.gradeSep = 1; n++; }
  }
  return n;
}

/**
 * Remove unnecessary houses that wall in transport corridors or crowd the map.
 * Keeps houses spaced apart and clears a buffer beside highways and surface rail so roads/rail
 * remain visible and buildable. The dense centre (near the Kremlin) is left mostly intact.
 * @param {object} state
 * @param {{x:number,y:number}} kremlin
 * @returns {number} houses removed
 */
export function thinBuildings(state, kremlin) {
  const { map } = state;
  const W = map.width, H = map.height;
  const kx = kremlin.x, ky = kremlin.y;
  const isHouse = (i) => map.tiles[i].building?.type === 'house';
  const near = (i, pred, r) => {
    const x = i % W, y = Math.floor(i / W);
    for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++)
      for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) {
        if (xx === x && yy === y) continue;
        if (pred(map.tiles[yy * W + xx], yy * W + xx)) return true;
      }
    return false;
  };
  let removed = 0;
  // 1) clear a buffer beside highways and rail (corridors must stay open)
  for (let i = 0; i < map.tiles.length; i++) {
    if (!isHouse(i)) continue;
    const x = i % W, y = Math.floor(i / W);
    if (Math.hypot(x - kx, y - ky) <= tl(10)) continue;
    const t = map.tiles[i];
    const byHwy = near(i, (nt) => nt.highway, tl(1));
    const byRail = near(i, (nt) => nt.rail && !nt.tunnel, tl(1));
    if (byHwy || byRail) { demolishHouseAt(state, i); removed++; }
  }
  // 2) gently break up wall-to-wall house blocks so there is buildable space between places
  for (let i = 0; i < map.tiles.length; i++) {
    if (!isHouse(i)) continue;
    const x = i % W, y = Math.floor(i / W);
    const dK = Math.hypot(x - kx, y - ky);
    if (dK <= tl(14)) continue;
    let adj = 0;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++)
      for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++)
        if ((xx !== x || yy !== y) && isHouse(yy * W + xx)) adj++;
    if (adj >= 6 && ((x * 7 + y * 11) % 4 === 0)) { demolishHouseAt(state, i); removed++; }
  }
  for (const t of state.towns) recomputePopulation(state, t);
  return removed;
}

/**
 * Build the whole Moscow scenario onto a freshly created game (state.map is replaced).
 * @param {object} game Game instance (from Game.create with no generation)
 * @param {object} map baked MOSCOW object
 * @returns {{towns:number,population:number,houses:number,streets:number,metro:object[],bus:object,industries:number,log:string[]}}
 */
export function buildMoscow(game, map) {
  const { state } = game;
  const log = [];
  state.scenario = 'moscow';
  state.company.money = MOSCOW_MONEY;
  const { L, major, streets, highways } = buildTiles(state, map);
  // car route search budget: 100 m tiles double every path length (random worlds keep PATH_MAX_NODES)
  state.map.pathMaxNodes = Math.round(PATH_MAX_NODES * TS * TS);
  const kremlin = landmark(map, 'kremlin', [55.752, 37.6175]);
  const city = landmark(map, 'moscow_city', [55.749, 37.539]);
  const landmarks = placeLandmarks(state, map, major, log);
  const towns = makeTowns(state, map.districts || [], kremlin, log);
  const houses = placeHouses(state, game.rng, L, towns, { kremlin, city, landmarks, centreTown: towns[0], landuse: L.landuse });
  const thinned = thinBuildings(state, kremlin);
  if (streets.noMajor) log.push('roads: baked map has no major road layer; local streets laid unconnected to any avenue');
  if (highways) log.push(`roads: marked ${highways} motorway/trunk tiles as 4-lane highways`);
  if (streets.pruned) log.push(`streets: pruned ${streets.pruned} tiles of local roads not connected to the major network`);
  if (thinned) log.push(`buildings: removed ${thinned} houses to clear transport corridors and spacing`);
  const metro = [];
  for (const line of pickMetroLines(map.metroLines || [])) {
    const stops = line.stations.map((s) => ({ x: s.x, y: s.y }));
    const geo = metroGeometry(L, map.metroLines || [], line);
    const r = buildMetroLine(game, line, stops, log, metro.length, geo);
    if (r) metro.push(r);
  }
  if (!globalThis.process?.env?.NO_RAILCLEAN) {
    const c = cleanRail(state, L.rail);
    log.push(`rail: cleanRail removed ${c.removedEdges} edges, pruned ${c.prunedTiles} tiles, restored ${c.restored} dead ends, small cycles ${c.smallCyclesBefore}->${c.smallCyclesAfter}`);
  }
  if (!globalThis.process?.env?.NO_ROADCLEAN) {
    const r = cleanRoad(state);
    log.push(`roads: cleanRoad removed ${r.removedEdges} edges, pruned ${r.prunedTiles} spur tiles, collapsed ${r.collapsed} doubled, flagged ${r.flaggedHighway} highway, small cycles ${r.smallCyclesBefore}->${r.smallCyclesAfter}`);
  }
  clearLandmarkLinks(state.map);
  markGradeSeparation(state.map);
  const bus = buildBusLines(game, major, log);
  // airports after buses (aircraft need a free hangar depot); road-connected below by pruneRoadIslands / joins
  const islands = pruneRoadIslands(state, 150 * TS * TS);
  if (islands) log.push(`streets: pruned ${islands} tiles of tiny road islands (bridge stubs)`);
  const joins = joinRoadComponents(state, tl(60));
  if (joins.tiles) for (const t of state.towns) recomputePopulation(state, t);
  if (joins.joined) log.push(`streets: joined ${joins.joined} cut-off road pieces with ${joins.tiles} connector tiles`);
  // industries last among the road-changing steps: pruneRoadIslands/joinRoadComponents could strip the access they are sited on
  const industries = buildIndustries(state, major, kremlin, log) + planIndustries(state, map, { L, major, kremlin, log }).placed;
  state.traffic = createTraffic(state);
  recomputeAllAcceptance(state);
  state.metro = { lines: metro.map((m) => ({ ref: m.ref, name: m.name, nameEn: m.nameEn, color: m.color, ring: m.ring, stationIds: m.stationIds, vehicleIds: m.vehicleIds })) };
  const air = buildAirports(game, map, log);
  state.scenarioMeta = { metro, bus, air, focus: { x: kremlin.x, y: kremlin.y }, landmarks };
  state.scenarioLog = log;
  const population = state.towns.reduce((a, t) => a + (t.population || 0), 0);
  return { towns: state.towns.length, population, houses, streets: streets.laid, metro, bus, industries, landmarks: landmarks.length, log };
}

/** Test hook: lay tiles only. */
export function buildTilesOnly(game, map) { return buildTiles(game.state, map); }
