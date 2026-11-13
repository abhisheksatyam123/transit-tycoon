/**
 * Moscow scenario, airports: SVO, VKO and DME as game airports (6x4 footprint), each with a
 * hangar depot, plus a couple of prop/jet aircraft flying between them. Sites come from
 * map.airports when baked, otherwise from the real lat/lon. Pure and deterministic.
 */
import { tl, TS } from './moscowScale.js';
import { project } from './moscowTiles.js';

/** Real airport positions: [id, name, lat, lon]. */
const AIRPORT_SITES = [
  ['SVO', 'Sheremetyevo', 55.9726, 37.4146],
  ['VKO', 'Vnukovo', 55.5915, 37.2615],
  ['DME', 'Domodedovo', 55.4088, 37.9063],
];

/** Aircraft bought per airport pair (round trips SVO-VKO, SVO-DME, VKO-DME). */
const AIRCRAFT_PER_PAIR = 1;

/** Search radius (tiles) around a real site for a clearable airport footprint. */
const AIRPORT_SEARCH_R = tl(40);

/** Half-size (tiles) of the area kept free of generated local streets around each airport site. */
const AIRPORT_RESERVE = { rx: tl(6), ry: tl(5) };

/**
 * Tile position of each airport site: centre of the baked bbox (x+w/2, y+h/2) clamped into the map,
 * else the real lat/lon. The top-left corner would put the search start off the terminal.
 */
function sitePositions(map) {
  return AIRPORT_SITES.map(([id, name, lat, lon]) => {
    const b = (map.airports || []).find((a) => a.id === id);
    if (!b) return { id, name, p: project(lat, lon) };
    const x = Math.round(b.x + (b.w || 0) / 2), y = Math.round(b.y + (b.h || 0) / 2);
    return { id, name, p: { x: Math.min(map.width - 1, Math.max(0, x)), y: Math.min(map.height - 1, Math.max(0, y)) } };
  });
}

/**
 * Mask of tiles reserved for airports (no generated local streets there), so a 6x4 airport fits
 * even where the density layer would fill the land with a street grid (e.g. Domodedovo).
 * @param {{width:number,height:number}} gm game map
 * @param {object} map baked MOSCOW object
 * @returns {Uint8Array}
 */
export function airportReserve(gm, map) {
  const W = gm.width, H = gm.height, out = new Uint8Array(W * H);
  const { rx, ry } = AIRPORT_RESERVE;
  for (const s of sitePositions(map)) {
    const cx = Math.max(rx, Math.min(W - 1 - rx, s.p.x)), cy = Math.max(ry, Math.min(H - 1 - ry, s.p.y));
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) out[y * W + x] = 1;
  }
  return out;
}

/**
 * Find the first footprint near (cx,cy) that game.buildAirport accepts (dry run).
 * @returns {{x:number,y:number}|null}
 */
function findAirportSite(game, cx, cy, maxR = AIRPORT_SEARCH_R) {
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy;
      if (game.buildAirport(x, y, { dryRun: true }).ok) return { x, y };
    }
  }
  return null;
}

/**
 * Build the Moscow airports and aircraft.
 * @param {object} game Game instance
 * @param {object} map baked MOSCOW object (map.airports optional)
 * @param {string[]} log warnings
 * @returns {{airports:object[], aircraft:object[]}}
 */
export function buildAirports(game, map, log) {
  const out = { airports: [], aircraft: [] };
  const sites = sitePositions(map);
  for (const s of sites) {
    const at = findAirportSite(game, s.p.x, s.p.y);
    if (!at) { log.push(`airport ${s.id}: no clearable 6x4 site near ${s.p.x},${s.p.y}`); continue; }
    const r = game.buildAirport(at.x, at.y);
    if (!r.ok) { log.push(`airport ${s.id}: build failed: ${r.error}`); continue; }
    const a = { id: s.id, name: s.name, x: at.x, y: at.y, stationId: r.stationId, depotId: r.depotId };
    out.airports.push(a);
  }
  // aircraft between each pair of built airports
  const models = ['ac_il14', 'ac_li2'];
  let k = 0;
  for (let i = 0; i < out.airports.length; i++) for (let j = i + 1; j < out.airports.length; j++) {
    const A = out.airports[i], B = out.airports[j];
    for (let n = 0; n < AIRCRAFT_PER_PAIR; n++) {
      const modelId = models[k++ % models.length];
      const dep = A.depotId;
      const bought = game.buyVehicle(dep, { modelId, cargoId: 'PASS' });
      if (!bought.ok) { log.push(`aircraft ${A.id}-${B.id}: not bought: ${bought.error}`); continue; }
      game.setOrders(bought.vehicle.id, [{ stationId: A.stationId, full: false }, { stationId: B.stationId, full: false }]);
      game.startVehicle(bought.vehicle.id);
      out.aircraft.push(bought.vehicle.id);
    }
  }
  return out;
}
