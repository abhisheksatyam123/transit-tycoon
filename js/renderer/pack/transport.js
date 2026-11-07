/**
 * OpenGFX transport ground layer: flat and sloped roads, rail, level crossings, rail stations, road
 * stops and depots. Ported from OpenTTD road_cmd.cpp / rail_cmd.cpp / station_cmd.cpp (see rail.js,
 * road.js, crossing.js, stations.js, depots.js). Tiles that OpenTTD draws with sprites we cannot yet
 * place (bridges over water) return false so the procedural layer draws them.
 */
import { packActive, packState } from './state.js';
import { railIds, railSlopeId, twoCornerSlope } from './rail.js';
import { roadSprite, roadSlopeId } from './road.js';
import { crossingId } from './crossing.js';
import { railStationIds, roadStopIds } from './stations.js';
import { railDepotIds, roadDepotId } from './depots.js';
import { blitPack } from './draw.js';
import { packTop, flatGroundId } from './ground.js';
import { drawSloped } from '../slope.js';
import { HALF_H, HEIGHT_STEP } from '../iso.js';
import { drawBridgeTile } from './bridges.js';
import { diagRoadTop } from './diagRoad.js';

/** Sprite ids that exist in the loaded pack. */
function have(ids) {
  const s = packState.pack && packState.pack.sprites;
  return !!s && ids.every((id) => s[id]);
}

/** Flat ground for a tile: grass-like terrain uses 3981, desert 3924, rock 4023. */
function groundOf(tile) {
  return flatGroundId(tile.terrain);
}

/**
 * Draw sprite stack `ids` on the tile (ids[0] = full-tile ground). Returns false if unavailable.
 * @returns {boolean}
 */
function drawStack(ctx, ids, sx, sy, c) {
  if (!have(ids)) return false;
  const top = packTop(ids);
  if (!top) return false;
  drawSloped(ctx, top, sx, sy, c);
  return true;
}

/**
 * Draw road / rail / station / depot for a tile with OpenGFX sprites.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} tile
 * @param {number} sx flat tile centre x
 * @param {number} sy flat tile centre y
 * @param {number[]} c corner heights [hN,hE,hS,hW]
 * @param {boolean} [diag] road corner is part of a 1:1 staircase (drawn as a straight diagonal)
 * @returns {boolean} true when handled
 */
export function drawPackTransport(ctx, tile, sx, sy, c, diag = false) {
  if (!packActive()) return false;
  const b = tile.building && tile.building.kind !== 'waypoint' ? tile.building : null; // waypoint: plain rail ground
  if (b && b.type === 'landmark') return false;
  if (b && b.type === 'station' && (b.kind === 'airport')) return false;
  const road = tile.road | 0;
  const rail = tile.tunnel ? 0 : (tile.rail | 0);
  if (tile.terrain === 'water') {
    // road or rail over water: OpenGFX bridge deck; otherwise leave the water to the ground layer
    if (road && !rail) return drawBridgeTile(ctx, 'road', road, sx, sy, c);
    if (rail && !road) return drawBridgeTile(ctx, 'rail', rail, sx, sy, c);
    if (road && rail) return false; // crossing over water: rare, procedural
    return false;
  }
  if (b && b.type === 'depot') return drawDepot(ctx, b, tile, sx, sy, c);
  if (b && b.type === 'station') return drawStation(ctx, b, tile, sx, sy, c);
  if (!road && !rail) return true; // ground only (drawn by the terrain layer)
  const paved = (tile.avenue | 0) > 0 || tile.owner === 'town';
  if (road && rail && tile.gradeSep) return false; // grade separation: procedural deck (sprites/gradeSep.js)
  if (road && rail) {
    const id = crossingId(road, rail);
    if (id < 0) return false;
    // crossing sprite includes the road-less rail ground; road pieces are drawn underneath.
    const rid = roadSprite(road, paved);
    return drawStack(ctx, [rid, id], sx, sy, c) || drawStack(ctx, [id], sx, sy, c);
  }
  const slope = twoCornerSlope(c);
  if (slope) {
    // Straight track/road on a diagonal slope uses OpenTTD's own slope sprite.
    const sid = road ? roadSlopeId(road, slope, paved) : railSlopeId(rail, slope);
    if (sid > 0 && have([sid])) {
      blitPack(ctx, sid, sx, sy - HALF_H - HEIGHT_STEP * Math.min(...c));
      return true;
    }
  }
  if (road && diag) {
    const top = diagRoadTop(road, paved, groundOf(tile));
    if (top) { drawSloped(ctx, top, sx, sy, c); return true; }
  }
  if (road) {
    const id = roadSprite(road, paved);
    if (id < 0) return false;
    return drawStack(ctx, [id], sx, sy, c);
  }
  const g = groundOf(tile);
  if (g < 0) return false;
  return drawStack(ctx, railIds(rail, g === 3981), sx, sy, c);
}

/** Rail station (kind rail) or road stop (bus/truck). */
function drawStation(ctx, b, tile, sx, sy, c) {
  if (b.kind === 'rail') {
    const axis = b.axis === 'y' ? 'y' : 'x';
    // Brick style: OpenGFX station building (SPR_RAIL_PLATFORM_BUILDING_X/Y) on top of the platform.
    if (b.style === 'brick') {
      const ids = [...railStationIds(axis), axis === 'y' ? 1074 : 1073];
      if (drawStack(ctx, ids, sx, sy, c)) return true;
    }
    return drawStack(ctx, railStationIds(axis), sx, sy, c);
  }
  if (b.kind === 'bus' || b.kind === 'truck') {
    const mask = tile.road | 0;
    const ids = roadStopIds(b.kind, mask);
    if (!ids.length) return false;
    const g = groundOf(tile) >= 0 ? roadSprite(mask, false) : -1;
    return drawStack(ctx, [g, ...ids], sx, sy, c);
  }
  return false;
}

/** Rail depot (exit dir) or road depot. */
function drawDepot(ctx, b, tile, sx, sy, c) {
  if (b.kind === 'rail') {
    const ids = railDepotIds(b.dir | 0);
    return ids.length ? drawStack(ctx, ids, sx, sy, c) : false;
  }
  if (b.kind === 'road') {
    const axis = (b.dir | 0) === 1 || (b.dir | 0) === 4 ? 5 : 10;
    const ground = roadSprite(axis, paved(tile));
    const id = roadDepotId(b.dir | 0);
    if (ground < 0 || id < 0) return false;
    return drawStack(ctx, [ground, id], sx, sy, c);
  }
  return false;
}

function paved(tile) { return (tile.avenue | 0) > 0 || tile.owner === 'town'; }
