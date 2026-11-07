/**
 * Vehicle segment sprites: locomotives, wagons, buses and trucks in 4 travel directions.
 * dir bit = travel direction: N=1 (y-1), E=2 (x+1), S=4 (y+1), W=8 (x-1).
 * `info` is the owning vehicle (modelId, id, kind, livery, metroLine) passed by the renderer;
 * without it the generic cargo-based look is used.
 */
import { playerVehicleColour } from '../palette.js';
import { makeSprite, SpriteCache } from './canvas.js';
import { orient } from './iso3d.js';
import { setCargoColorMap } from './cargoColors.js';
import { drawBus, drawTrolley, drawTruck } from './buses.js';
import { drawTram } from './trams.js';
import { drawEngine, drawMetroCar, drawWagon, ENGINE_FAMILY } from './trains.js';

const cache = new SpriteCache();
const SIZE = 56;

/** Truck body per model id. */
const TRUCK_BODY = { trk_tanker: 'tank', trk_bulk: 'bulk', trk_log: 'logs', trk_goods: 'box', trk_mail: 'box', trk_steel: 'flat', trk_cattle: 'cattle', trk_heavy: 'flat', trk_armoured: 'box' };
const CAB_COLORS = ['#1e6fd9', '#f2c230', '#b91c1c', '#e5e7eb', '#166534'];
const BUS_VARIANT = { bus_city: 0, bus_express: 1, bus_modern: 2, bus_artic: 2 };

/**
 * Stable small int from a string and a number.
 * @param {string} str
 * @param {number} n
 * @returns {number}
 */
function hash2(str, n) {
  let h = n | 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  h ^= h >>> 15;
  return ((Math.imul(h, 0x2c1b3c6d) ^ (h >>> 9)) >>> 0);
}

/**
 * Rail vehicle on the Moscow metro: has a metroLine or livery and is a train.
 * @param {any} info
 */
function isMetro(info) {
  return !!info && info.kind === 'train' && !!(info.metroLine || info.livery);
}

/**
 * Draw one segment body.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} part
 * @param {number} dir
 * @param {string} cargo
 * @param {number} fill
 * @param {any} info
 */
function drawPart(ctx, part, dir, cargo, fill, info) {
  const { axis, s } = orient(dir);
  const mid = info && info.modelId ? info.modelId : '';
  const hv = hash2(mid || part, info && info.id !== undefined ? info.id : 0);
  const metro = isMetro(info);
  // player vehicles without a livery take the chosen company colour (palette.js); rivals always carry one
  const liv = info && info.livery && info.livery[0] === '#' ? info.livery : (info && info.ownerId == null ? playerVehicleColour() || undefined : undefined);
  if (part === 'loco') {
    if (metro) drawMetroCar(ctx, axis, s, liv, true);
    else drawEngine(ctx, axis, s, ENGINE_FAMILY[mid] || 'diesel', hv % 2);
  } else if (part === 'wagon') {
    if (metro) drawMetroCar(ctx, axis, s, liv, false);
    else drawWagon(ctx, axis, s, cargo, fill);
  } else if (part === 'bus') {
    if (info && info.roadType === 'tram') drawTram(ctx, axis, s, mid === 'tram_electric' || mid === 'tram_artic', liv);
    else if (info && info.livery === 'trolley') drawTrolley(ctx, axis, s, hv % 4);
    else drawBus(ctx, axis, s, BUS_VARIANT[mid] !== undefined ? BUS_VARIANT[mid] : 0, hv % 4, liv);
  } else {
    const body = TRUCK_BODY[mid] || (cargo === 'WOOD' ? 'logs' : cargo === 'LVST' ? 'cattle' : cargo === 'OIL' ? 'tank' : 'bulk');
    drawTruck(ctx, axis, s, body, cargo, fill, CAB_COLORS[hv % CAB_COLORS.length]);
  }
}

/**
 * Provide cargo colours (from core data) used for load indicators.
 * @param {Record<string,string>} map
 */
export function setCargoColors(map) {
  setCargoColorMap(map);
  cache.clear();
}

/**
 * Vehicle segment sprite.
 * @param {'loco'|'wagon'|'bus'|'truck'} part
 * @param {number} dir travel direction bit
 * @param {string} cargo cargo id
 * @param {number} fill 0..1 (quantised to quarters)
 * @param {any} [info] owning vehicle (optional)
 * @returns {import('./canvas.js').Sprite}
 */
export function vehicleSprite(part, dir, cargo, fill, info) {
  const q = Math.round(Math.max(0, Math.min(1, fill || 0)) * 4) / 4;
  const d = dir === 1 || dir === 2 || dir === 4 || dir === 8 ? dir : 2;
  const mid = info && info.modelId ? info.modelId : '';
  let vk = 0;
  if (info) vk = isMetro(info) ? 1000 + (hash2(info.livery || info.metroLine || '', 0) % 64) : hash2(mid || part, info.id | 0) % 4;
  const pc = info && info.ownerId == null && !(info.livery && info.livery[0] === '#') ? playerVehicleColour() : ''; // player colour choice is part of the key
  const key = `v:${part}:${d}:${cargo}:${q}:${mid}:${vk}:${pc}`;
  return cache.get(key, () => makeSprite(SIZE, SIZE, SIZE / 2, SIZE * 0.66, (ctx) => {
    drawPart(ctx, part, d, cargo, q, info);
  }));
}
