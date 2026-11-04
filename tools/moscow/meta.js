/**
 * Metro lines, rail stations, districts and landmarks.
 */
import { WIDTH, HEIGHT, project, inBBox } from './proj.js';
import { tag, nodeIndex } from './io.js';

/** Hard-coded landmarks (lat, lon). */
export const LANDMARKS = [
  { id: 'kremlin', name: 'Kremlin', lat: 55.752, lon: 37.6175 },
  { id: 'red_square', name: 'Red Square', lat: 55.7539, lon: 37.6208 },
  { id: 'moscow_city', name: 'Moscow City', lat: 55.7495, lon: 37.5375 },
  { id: 'msu', name: 'MSU', lat: 55.7033, lon: 37.5302 },
  { id: 'vdnkh', name: 'VDNKh', lat: 55.8263, lon: 37.6377 },
  { id: 'gorky_park', name: 'Gorky Park', lat: 55.7298, lon: 37.601 },
  { id: 'luzhniki', name: 'Luzhniki', lat: 55.7158, lon: 37.5537 },
  { id: 'ostankino_tower', name: 'Ostankino Tower', lat: 55.8197, lon: 37.6117 },
  { id: 'bolshoi', name: 'Bolshoi Theatre', lat: 55.7601, lon: 37.6186 },
  { id: 'christ_saviour', name: 'Christ the Saviour', lat: 55.7446, lon: 37.6055 },
  { id: 'ukraina', name: 'Hotel Ukraina', lat: 55.7516, lon: 37.5663 },
  { id: 'kotelnicheskaya', name: 'Kotelnicheskaya Embankment Building', lat: 55.7472, lon: 37.6426 },
  { id: 'kudrinskaya', name: 'Kudrinskaya Square Building', lat: 55.7584, lon: 37.5812 },
  { id: 'mid', name: 'Ministry of Foreign Affairs', lat: 55.7462, lon: 37.5843 },
  { id: 'leningradskaya', name: 'Leningradskaya Hotel', lat: 55.7739, lon: 37.6531 },
  { id: 'red_gates', name: 'Red Gates Building', lat: 55.7685, lon: 37.6491 },
  { id: 'gum', name: 'GUM', lat: 55.7547, lon: 37.6215 },
  { id: 'shukhov_tower', name: 'Shukhov Tower', lat: 55.7172, lon: 37.6119 },
  { id: 'novodevichy', name: 'Novodevichy Convent', lat: 55.7262, lon: 37.5562 },
];

const LINE_COLOURS = ['#e3000f', '#0d6fb8', '#00903f', '#f7a600', '#8e3e96', '#8c5a2b', '#9fa3a7', '#a4d35c', '#7dd0f5', '#e77ebb', '#ffd900', '#00a4a6'];

/**
 * Ordered station list from a subway route relation.
 * @param {object} rel relation element
 * @param {Map<number,object>} nodes
 * @returns {Array<{name:string,nameEn:string,lat:number,lon:number}>}
 */
function relationStops(rel, nodes) {
  const out = [];
  for (const m of rel.members || []) {
    if (m.type !== 'node' || !/^stop/.test(m.role || '')) continue;
    const nd = nodes.get(m.ref);
    if (!nd || nd.lat === undefined) continue;
    out.push({ name: tag(nd, 'name'), nameEn: tag(nd, 'name:en'), lat: nd.lat, lon: nd.lon });
  }
  return out;
}

/**
 * Metro lines from metro.json (route relations). One relation per ref: the one with most stops.
 * @param {Array<object>} els
 * @returns {Array<object>} lines in the pre-projection form {ref,name,nameEn,colour,ring,stops}
 */
function linesFromRelations(els) {
  const nodes = nodeIndex(els);
  const best = new Map();
  for (const r of els) {
    if (r.type !== 'relation' || tag(r, 'route') !== 'subway') continue;
    const ref = tag(r, 'ref') || tag(r, 'name');
    const stops = relationStops(r, nodes);
    if (!stops.length) continue;
    if (!best.has(ref) || best.get(ref).stops.length < stops.length) {
      best.set(ref, { ref, name: tag(r, 'name'), nameEn: tag(r, 'name:en'), colour: tag(r, 'colour'), stops, rel: r });
    }
  }
  return [...best.values()];
}

/**
 * Metro lines grouped from station nodes tagged line/colour (fallback when no route relations).
 * Stop order is a greedy nearest-neighbour chain.
 * @param {Array<object>} els
 * @returns {Array<object>}
 */
function linesFromStations(els) {
  const groups = new Map();
  for (const e of els) {
    if (e.type !== 'node' || tag(e, 'station') !== 'subway') continue;
    const line = tag(e, 'line') || tag(e, 'ref');
    if (!line) continue;
    if (!groups.has(line)) groups.set(line, { ref: line, name: line, nameEn: '', colour: tag(e, 'colour'), stops: [] });
    groups.get(line).stops.push({ name: tag(e, 'name'), nameEn: tag(e, 'name:en'), lat: e.lat, lon: e.lon });
  }
  for (const g of groups.values()) {
    const rest = g.stops.slice();
    const chain = [rest.shift()];
    while (rest.length) {
      const last = chain[chain.length - 1];
      let bi = 0, bd = Infinity;
      rest.forEach((s, i) => { const d = (s.lat - last.lat) ** 2 + (s.lon - last.lon) ** 2; if (d < bd) { bd = d; bi = i; } });
      chain.push(rest.splice(bi, 1)[0]);
    }
    g.stops = chain;
  }
  return [...groups.values()];
}

/**
 * Build metro lines (projected). Empty array when nothing usable.
 * @param {Array<object>|null} metroEls metro.json elements
 * @param {Array<object>|null} stationEls stations.json elements
 * @returns {Array<object>}
 */
export function buildMetroLines(metroEls, stationEls) {
  let lines = [];
  if (metroEls && metroEls.length) lines = linesFromRelations(metroEls);
  else if (stationEls && stationEls.length) lines = linesFromStations(stationEls);
  else console.warn('[bake] no metro data; metroLines = []');
  let ci = 0;
  return lines.map((l) => {
    const stops = dedupe(l.stops).map((s) => ({ name: s.name, nameEn: s.nameEn, ...clampXY(s) }));
    const ring = l.ref === '5' || (stops.length > 3 && l.stops.length && sameLatLon(l.stops[0], l.stops[l.stops.length - 1]));
    return {
      ref: l.ref,
      name: l.name || `Line ${l.ref}`,
      nameEn: l.nameEn || '',
      color: /^#[0-9a-f]{6}$/i.test(l.colour || '') ? l.colour : LINE_COLOURS[ci++ % LINE_COLOURS.length],
      stations: stops,
      ring: !!ring,
    };
  }).filter((l) => l.stations.length >= 2);
}

/** @param {{lat:number,lon:number}} a @param {{lat:number,lon:number}} b */
function sameLatLon(a, b) { return a.lat === b.lat && a.lon === b.lon; }

/**
 * Projected integer coords clamped to the map.
 * @param {{lat:number,lon:number}} s
 * @returns {{x:number,y:number}}
 */
function clampXY(s) {
  const p = project(s.lat, s.lon);
  return { x: Math.min(WIDTH - 1, Math.max(0, p.x)), y: Math.min(HEIGHT - 1, Math.max(0, p.y)) };
}

/**
 * Remove consecutive duplicates and stops with no name-identity repeats (by name, keep first).
 * @param {Array<{name:string,lat:number,lon:number}>} stops
 * @returns {Array<object>}
 */
function dedupe(stops) {
  const seen = new Set();
  const out = [];
  for (const s of stops) {
    const key = s.name || `${s.lat},${s.lon}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Non-subway railway stations inside the map.
 * @param {Array<object>|null} stationEls
 * @returns {Array<{name:string,nameEn:string,x:number,y:number}>}
 */
export function buildRailStations(stationEls) {
  const out = [];
  for (const e of stationEls || []) {
    if (e.type !== 'node' || tag(e, 'railway') !== 'station' || tag(e, 'station') === 'subway') continue;
    if (!inBBox(e.lat, e.lon)) continue;
    out.push({ name: tag(e, 'name'), nameEn: tag(e, 'name:en'), ...clampXY(e) });
  }
  return out;
}

/** place=* values that become districts (towns and suburbs around Moscow). */
const DISTRICT_PLACES = new Set(['suburb', 'town', 'city']);

/**
 * Districts (place=suburb|town|city nodes) inside the map.
 * @param {Array<object>|null} placeEls
 * @returns {Array<{name:string,nameEn:string,x:number,y:number}>}
 */
export function buildDistricts(placeEls) {
  const out = [];
  const seen = new Set();
  for (const e of placeEls || []) {
    if (e.type !== 'node' || !DISTRICT_PLACES.has(tag(e, 'place')) || !inBBox(e.lat, e.lon)) continue;
    const key = tag(e, 'name');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: tag(e, 'name'), nameEn: tag(e, 'name:en'), ...clampXY(e) });
  }
  return out;
}

/**
 * Landmarks projected to tiles.
 * @returns {Array<{id:string,name:string,x:number,y:number}>}
 */
export function buildLandmarks() {
  return LANDMARKS.map((l) => ({ id: l.id, name: l.name, ...project(l.lat, l.lon) }));
}


