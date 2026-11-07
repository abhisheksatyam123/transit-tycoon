#!/usr/bin/env bun
/**
 * Bake real OpenStreetMap (Overpass JSON) data into js/config/maps/moscow.js.
 * Usage: bun tools/moscow/bake.js [rawDir] [outFile]
 * Contract: scratchpad/moscow-contract.md. Missing layers are skipped with a warning.
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIDTH, HEIGHT, BBOX, TILE_M, project, projectF } from './proj.js';
import { loadLayer, tag } from './io.js';
import { buildRoads, buildRail, dropLadders, dropSmall, pruneStubs, countStairs, symmetrise, asymmetry } from './network.js';
import { buildRivers, buildWaterPolys, buildParks, insideMkad } from './areas.js';
import { buildDensity } from './density.js';
import { satelliteList, settlementSeeds } from './satellites.js';
import { buildMetroLines, buildRailStations, buildDistricts, buildLandmarks } from './meta.js';
import { buildMetro, buildLanduse, buildTall, buildAirports, selectAirports, lineIndex } from './layers.js';
import { orthogonalize } from './ortho.js';
import { buildRoadsOcti, buildRailOcti } from './octiNet.js';
import { dejog } from './dejog.js';
import { encodeRLE } from '../../js/config/maps/rle.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const RAW = process.argv[2] || '/home/abhi/project/city_sim/scratchpad/moscow/raw';
const OUT = resolve(process.argv[3] || resolve(ROOT, 'js/config/maps/moscow.js'));

/**
 * Convert a Uint8Array of values to a char-code string.
 * @param {ArrayLike<number>} arr
 * @param {(v:number)=>string} f
 * @returns {string}
 */
function toStr(arr, f) {
  const parts = [];
  for (let i = 0; i < arr.length; i += 8192) {
    const chunk = [];
    for (let j = i; j < Math.min(arr.length, i + 8192); j++) chunk.push(f(arr[j]));
    parts.push(chunk.join(''));
  }
  return parts.join('');
}

/**
 * Count occurrences of chars in a string.
 * @param {string} s
 * @returns {Record<string, number>}
 */
function histo(s) {
  const h = {};
  for (const c of s) h[c] = (h[c] || 0) + 1;
  return h;
}

/** Main bake. @returns {void} */
function main() {
  console.log(`[bake] map ${WIDTH}x${HEIGHT} tiles @${TILE_M} m, bbox ${JSON.stringify(BBOX)}`);
  const N = WIDTH * HEIGHT;
  const roadsEls = loadLayer(RAW, 'roads');
  const riversEls = loadLayer(RAW, 'rivers') || loadLayer(RAW, 'river_small');
  const railEls = loadLayer(RAW, 'rail');
  const parksEls = [...(loadLayer(RAW, 'parks') || []), ...(loadLayer(RAW, 'parkrels') || [])];
  const waterEls = loadLayer(RAW, 'water');
  const stationEls = loadLayer(RAW, 'stations');
  const metroEls = loadLayer(RAW, 'metro');
  const placeEls = loadLayer(RAW, 'places');
  const subwayEls = loadLayer(RAW, 'subway');
  const landuseEls = loadLayer(RAW, 'landuse');
  const tallEls = loadLayer(RAW, 'tallbld');
  const aeroEls = loadLayer(RAW, 'aeroway');

  // 2+3: roads
  const OCTI = !process.env.OLD;
  const roads = OCTI ? buildRoadsOcti(roadsEls) : buildRoads(roadsEls);
  if (OCTI) console.log(`[bake] octi roads: kept ${JSON.stringify(roads.kept)}`);
  const roadsBefore = countRoads(roads.bits);
  const cls = roads.cls;
  const stairsBefore = countStairs(roads.bits);
  const ladders = dropLadders(roads.bits, cls);
  const stubs = pruneStubs(roads.bits, cls, 3);
  const small = dropSmall(roads.bits, cls, 4);
  const roadsAfter = countRoads(roads.bits);
  console.log(`[bake] roads: stairs ${stairsBefore} -> ${countStairs(roads.bits)}; stubs removed ${stubs.removed}`);
  console.log(`[bake] roads: ${roads.ways} ways; tiles before ${roadsBefore} after ${roadsAfter}; ladder blocks ${ladders.blocks}, removed ${ladders.removed}; small comps dropped ${small.dropped} (components ${small.components})`);

  // rail
  const rail = OCTI ? buildRailOcti(railEls) : buildRail(railEls);
  console.log(`[bake] rail: ${rail.ways} ways`);

  // 4: water
  const water = new Uint8Array(N);
  const riverWays = buildRivers(riversEls, water);
  const waterPolys = buildWaterPolys(waterEls, water);
  console.log(`[bake] water: ${riverWays} river ways, ${waterPolys} polygons`);
  // 4b: OpenTTD-style straightening (axis-aligned legs, no zig-zags)
  if (!OCTI && !process.env.NO_ORTHO) {
    const mkadF = new Uint8Array(N); for (const t of roads.mkad) mkadF[t] = 1;
    const st0 = countStairs(roads.bits);
    const railM = Uint8Array.from(rail.bits, (b) => (b ? 1 : 0)), mkadO = Uint8Array.from(mkadF);
    let or = null;
    for (let pass = 0; pass < 3; pass++) { // re-routing creates new junctions -> new chains to straighten
      const r = orthogonalize(roads.bits, cls, { water, rail: railM, mkad: mkadF, mkadOrig: mkadO });
      or = or ? { chains: r.chains, rerouted: or.rerouted + r.rerouted, kept: r.kept, invalid: r.invalid } : r;
      if (!r.rerouted) break;
    }
    // MKAD ring / inside test keep the real OSM geometry (roads.mkad untouched): the re-routed ring may leak
    console.log(`[bake] ortho: chains ${or.chains} rerouted ${or.rerouted} kept ${or.kept} invalid ${or.invalid}; stairs ${st0} -> ${countStairs(roads.bits)}; tiles ${countRoads(roads.bits)}`);
  }

  // 5: terrain
  const terrain = new Uint8Array(N).fill('g'.charCodeAt(0));
  for (let t = 0; t < N; t++) if (water[t]) terrain[t] = 'w'.charCodeAt(0);
  const pf = buildParks(parksEls, terrain, water);
  console.log(`[bake] parks: ${pf.parks} park, ${pf.forests} forest polygons`);
  const mk = insideMkad(roads.mkad);
  console.log(`[bake] MKAD method ${mk.method} (${roads.mkad.length} tiles)`);

  // 6: density
  const terrS = toStr(terrain, (v) => String.fromCharCode(v));
  const railOn = Uint8Array.from(rail.bits, (b) => (b ? 1 : 0));
  const settlements = settlementSeeds(placeEls, projectF);
  const dens = buildDensity({ terrain: terrS, rail: railOn, inside: mk.inside, mkadTiles: roads.mkad, settlements });
  // roads over water are bridges; rail yards get 0 already. Tiles with no road next to them stay 0? keep margin 1.
  // v2: industrial landuse -> 1, airport footprints -> 0
  const lu = buildLanduse(landuseEls);
  const airports = selectAirports(buildAirports(aeroEls));
  const airFoot = new Uint8Array(WIDTH * HEIGHT);
  for (const a of airports) {
    for (let t = 0; t < airFoot.length; t++) {
      const x = t % WIDTH, y = (t - x) / WIDTH;
      if (x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h) airFoot[t] = 1;
    }
  }
  for (let t = 0; t < dens.length; t++) {
    if (airFoot[t]) dens[t] = 0;
    else if (lu.cls[t] === 'i'.charCodeAt(0) && terrain[t] === 'g'.charCodeAt(0)) dens[t] = 1;
  }
  const densS = toStr(dens, (v) => (v ? String(v) : '0'));
  console.log(`[bake] landuse polys ${lu.polys}; airports ${airports.map((a) => a.id).join(',') || 'none'}`);

  // 7–9: meta
  const metroLines = buildMetroLines(metroEls, stationEls);
  const metroRels = (metroEls || []).filter((e) => e.type === 'relation' && tag(e, 'route') === 'subway');
  const metro = buildMetro({ subway: subwayEls, relations: metroRels, lineIndexByRef: lineIndex(metroLines) });
  const tall = buildTall(tallEls);
  console.log(`[bake] metro track ways ${metro.ways}, tiles ${metro.tiles}; tall buildings ${tall.n}, tiles ${tall.count.reduce((a, c) => a + (c ? 1 : 0), 0)}`);
  const railStations = buildRailStations(stationEls);
  const districts = buildDistricts(placeEls);
  for (const s of satelliteList()) {
    const p = project(s.lat, s.lon);
    const near = districts.find((d) => Math.hypot(d.x - p.x, d.y - p.y) * TILE_M < 600);
    if (near) near.sat = true;
    else districts.push({ name: s.nameRu, nameEn: s.name, x: p.x, y: p.y, sat: true });
  }
  const landmarks = buildLandmarks();
  console.log(`[bake] metro lines ${metroLines.length} (stations ${metroLines.reduce((a, l) => a + l.stations.length, 0)}), rail stations ${railStations.length}, districts ${districts.length}`);

  // 4c: remove 1-tile lateral jogs from the octilinear road grid (R5a2)
  if (OCTI && !process.env.NO_DEJOG) {
    const dj = dejog(roads.bits, cls, water);
    console.log(`[bake] dejog: jogs ${dj.before} -> ${dj.after} (fixes ${dj.fixed})`);
  }
  // symmetry
  const asym = asymmetry(roads.bits) + asymmetry(rail.bits);
  const fixed = symmetrise(roads.bits) + symmetrise(rail.bits);
  console.log(`[bake] symmetry: asymmetric links ${asym}, fixed ${fixed}`);

  const roadS = toStr(roads.bits, (v) => v.toString(16));
  const metroS = toStr(metro.bits, (v) => v.toString(16));
  const metroLineS = toStr(metro.lineAt, (c) => (c ? String.fromCharCode(c) : '-'));
  const landuseS = toStr(lu.cls, (c) => (c ? String.fromCharCode(c) : '-'));
  const bldLevelsS = toStr(tall.levels, (c) => String.fromCharCode(c));
  const bldCountS = toStr(tall.count, (c) => String(c));
  const airportsOut = airports.map(({ mask, area, ...a }) => a);
  // '.' is the RLE token separator, so 'no class' is stored as '-' (see report)
  const classS = toStr(cls, (c) => (c === '.' ? '-' : c));
  const railS = toStr(rail.bits, (v) => v.toString(16));
  const terrOut = terrS;

  // Pinned snapshot date (tracked file): a wall-clock date would make every re-bake drift.
  const fetched = readFileSync(resolve(HERE, 'fetched.txt'), 'utf8').trim();
  const body = [
    '/**',
    ' * Moscow map baked from OpenStreetMap by tools/moscow/bake.js. Do not edit by hand.',
    ' * © OpenStreetMap contributors (ODbL). https://www.openstreetmap.org/copyright',
    ' */',
    `export const MOSCOW = {`,
    `  name: 'Moscow', attribution: '© OpenStreetMap contributors (ODbL)', fetched: '${fetched}',`,
    `  width: ${WIDTH}, height: ${HEIGHT}, tileMeters: ${TILE_M},`,
    `  bbox: ${JSON.stringify(BBOX)},`,
    `  terrain: '${encodeRLE(terrOut)}',`,
    `  road: '${encodeRLE(roadS)}',`,
    `  roadClass: '${encodeRLE(classS)}',`,
    `  rail: '${encodeRLE(railS)}',`,
    `  metro: '${encodeRLE(metroS)}',`,
    `  metroLine: '${encodeRLE(metroLineS)}',`,
    `  landuse: '${encodeRLE(landuseS)}',`,
    `  bldLevels: '${encodeRLE(bldLevelsS)}',`,
    `  bldCount: '${encodeRLE(bldCountS)}',`,
    `  density: '${encodeRLE(densS)}',`,
    `  metroLines: ${JSON.stringify(metroLines, null, 2).replace(/\n/g, '\n  ')},`,
    `  railStations: ${JSON.stringify(railStations)},`,
    `  districts: ${JSON.stringify(districts)},`,
    `  landmarks: ${JSON.stringify(landmarks)},`,
    `  airports: ${JSON.stringify(airportsOut)},`,
    '};',
    '',
  ].join('\n');
  writeFileSync(OUT, body);
  const counts = {
    terrain: histo(terrOut), roadClass: histo(classS), roadTiles: roadsAfter, railTiles: countRoads(rail.bits),
    density: histo(densS), landuse: histo(landuseS), bldLevels: histo(bldLevelsS), metroLine: histo(metroLineS),
  };
  console.log(`[bake] wrote ${OUT} (${(body.length / 1024).toFixed(0)} KB)`);
  console.log('[bake] counts', JSON.stringify(counts));
  if (!existsSync(OUT)) throw new Error('write failed');
}

/**
 * Number of tiles with non-zero bits.
 * @param {Uint8Array} bits
 * @returns {number}
 */
function countRoads(bits) {
  let n = 0;
  for (const b of bits) if (b) n++;
  return n;
}

main();
