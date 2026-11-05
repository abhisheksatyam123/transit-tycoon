/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/Map/TileManager.cpp (get, insertElement*, removeElement, getHeight, surface corner heights),
 *         include/OpenLoco/Map/Tile.h + src/Map/Tile.cpp (Tile view, trainStation, roadStation).
 * In-memory map: width x height tiles, each an ordered array of 8-byte elements sorted by baseZ
 * (surface first). The C++ single entries[] array / Store<T> allocators / defrag are replaced by
 * per-tile JS arrays; the observable ordering and `last`-flag semantics are preserved.
 */
import {
  ElementType, SurfaceElement, BuildingElement, TreeElement, WallElement, IndustryElement, SurfaceSlope,
} from './elements.js';
import { TrackElement, RoadElement, SignalElement, StationElement, StationType } from './transportElements.js';
import { TILE_SIZE, toTileSpace } from './world.js';

/** ElementType -> element class. */
export const ELEMENT_CLASSES = Object.freeze({
  [ElementType.surface]: SurfaceElement, [ElementType.track]: TrackElement, [ElementType.station]: StationElement,
  [ElementType.signal]: SignalElement, [ElementType.building]: BuildingElement, [ElementType.tree]: TreeElement,
  [ElementType.wall]: WallElement, [ElementType.road]: RoadElement, [ElementType.industry]: IndustryElement,
});

/** A read-only view of one tile's element list (C++ World::Tile). Iterable. */
export class Tile {
  /** @param {{x:number,y:number}} pos tile coords @param {?Array} list element array (null = off-map) */
  constructor(pos, list) { this.pos = pos; this._list = list; }
  isNull() { return this._list === null; }
  size() { return this._list ? this._list.length : 0; }
  [Symbol.iterator]() { return (this._list || [])[Symbol.iterator](); }
  /** @returns {Array} copy of the elements, bottom to top */
  elements() { return this._list ? this._list.slice() : []; }
  at(i) { return this._list ? this._list[i] || null : null; }
  indexOf(el) { return this._list ? this._list.indexOf(el) : -1; }
  /** @returns {?SurfaceElement} */
  surface() { for (const e of this) if (e instanceof SurfaceElement) return e; return null; }
  /**
   * Station element of a train station piece (Tile::trainStation): the first StationElement after
   * the matching TrackElement.
   * @returns {?StationElement}
   */
  trainStation(trackId, direction, baseZ) {
    let trackFound = false;
    for (const e of this) {
      if (trackFound && e instanceof StationElement) return e;
      if (!(e instanceof TrackElement)) continue;
      trackFound = e.baseZ() === baseZ && e.rotation() === direction && e.trackId() === trackId && e.hasStationElement();
    }
    return null;
  }
  /**
   * Station element of a road station piece (Tile::roadStation): any number of road elements may sit
   * between the matching road element and its StationElement.
   * @returns {?StationElement}
   */
  roadStation(roadId, direction, baseZ) {
    let trackFound = false;
    for (const e of this) {
      if (trackFound && e instanceof StationElement) return e;
      if (!(e instanceof RoadElement)) { trackFound = false; continue; }
      if (e.baseZ() !== baseZ) { trackFound = false; continue; }
      if (e.rotation() !== direction || e.roadId() !== roadId || !e.hasStationElement()) continue;
      trackFound = true;
    }
    return null;
  }
}

/** The map: `width` x `height` tiles of ordered element lists. */
export class TileManager {
  /**
   * @param {number} width tiles @param {number} height tiles
   * @param {{roadObjectIdIsUsableByAllCompanies?:number, roadObjectIdIsAnyRoadTypeCompatible?:number}} [gameState]
   *   the two GameState bitmasks Track.cpp reads (defaults: all road objects usable by everyone, none "any type")
   */
  constructor(width, height, gameState = {}) {
    this.width = width; this.height = height;
    this.tiles = Array.from({ length: width * height }, () => []);
    this.gameState = { roadObjectIdIsUsableByAllCompanies: 0xffffffff, roadObjectIdIsAnyRoadTypeCompatible: 0, ...gameState };
  }

  /** Map with one flat surface element per tile at `baseZ` smallZ (default 4 = z 16, the lowest buildable). */
  static createFlat(width, height, baseZ = 4, gameState) {
    const tm = new TileManager(width, height, gameState);
    for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) tm.insertElementAtTile(ElementType.surface, tx, ty, baseZ, 0xf);
    return tm;
  }

  /** Map size in world units. */
  get mapWidth() { return this.width * TILE_SIZE; }
  get mapHeight() { return this.height * TILE_SIZE; }
  /** True if world (x,y) is on the map (World::validCoords). */
  validCoords(pos) { return pos.x >= 0 && pos.y >= 0 && pos.x < this.mapWidth && pos.y < this.mapHeight; }
  /** drawableCoords: the map border tile ring is not buildable. */
  drawableCoords(pos) {
    const ok = (c, size) => c >= TILE_SIZE && c < size - TILE_SIZE - 1;
    return ok(pos.x, this.mapWidth) && ok(pos.y, this.mapHeight);
  }

  /** @returns {Tile} tile containing world Pos2/Pos3 (TileManager::get(Pos2)); null tile when off-map */
  get(pos) { const t = toTileSpace(pos); return this.getTile(t.x, t.y); }
  /** @returns {Tile} TileManager::get(TilePos2) */
  getTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return new Tile({ x: tx, y: ty }, null);
    return new Tile({ x: tx, y: ty }, this.tiles[ty * this.width + tx]);
  }

  _relink(list, tx, ty) {
    for (let i = 0; i < list.length; i++) { list[i].list = list; list[i].tx = tx; list[i].ty = ty; list[i].setLastFlag(i === list.length - 1); }
  }

  _insertAt(el, tx, ty, index) {
    const list = this.tiles[ty * this.width + tx];
    list.splice(index, 0, el);
    this._relink(list, tx, ty);
    return el;
  }

  _make(type, baseZ, occupiedQuarter) {
    const el = new ELEMENT_CLASSES[type]();
    el.setBaseZ(baseZ); el.setClearZ(baseZ); el.setOccupiedQuarter(occupiedQuarter);
    return el;
  }

  /** insertElement by tile coords. Placed after every element with baseZ <= `baseZ`. */
  insertElementAtTile(type, tx, ty, baseZ, occupiedQuarter) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return null;
    const list = this.tiles[ty * this.width + tx];
    let i = 0;
    while (i < list.length && baseZ >= list[i].baseZ()) i++;
    return this._insertAt(this._make(type, baseZ, occupiedQuarter), tx, ty, i);
  }

  /**
   * TileManager::insertElement. New element: clearZ = baseZ, given occupied quarter, `last` flag maintained.
   * @param {number} type ElementType @param {{x:number,y:number}} pos world Pos2 @param {number} baseZ smallZ
   * @param {number} occupiedQuarter
   * @returns {?TileElement} null if off-map
   */
  insertElement(type, pos, baseZ, occupiedQuarter) {
    const t = toTileSpace(pos);
    return this.insertElementAtTile(type, t.x, t.y, baseZ, occupiedQuarter);
  }

  /** TileManager::insertElementRoad: like insertElement but stops before a road StationElement at the same baseZ. */
  insertElementRoad(pos, baseZ, occupiedQuarter) {
    const t = toTileSpace(pos);
    if (t.x < 0 || t.y < 0 || t.x >= this.width || t.y >= this.height) return null;
    const list = this.tiles[t.y * this.width + t.x];
    let i = 0;
    while (i < list.length && baseZ >= list[i].baseZ()
      && !(list[i].baseZ() === baseZ && list[i] instanceof StationElement && list[i].stationType() === StationType.roadStation)) i++;
    return this._insertAt(this._make(ElementType.road, baseZ, occupiedQuarter), t.x, t.y, i);
  }

  /** TileManager::insertElementAfterNoReorg: insert directly after `after` (must be in this map). */
  insertElementAfterNoReorg(after, type, baseZ, occupiedQuarter) {
    const list = after.list;
    if (!list) return null;
    return this._insertAt(this._make(type, baseZ, occupiedQuarter), after.tx, after.ty, list.indexOf(after) + 1);
  }

  /** TileManager::removeElement. @returns {boolean} true if the element was found */
  removeElement(el) {
    const list = el.list;
    if (!list) return false;
    const i = list.indexOf(el);
    if (i < 0) return false;
    list.splice(i, 1);
    this._relink(list, el.tx, el.ty);
    el.list = null;
    return true;
  }

  /** TileManager::getHeight: {landHeight, waterHeight} in world z at world (x,y). */
  getHeight(pos) {
    const height = { landHeight: 16, waterHeight: 0 };
    if (pos.x < 0 || pos.y < 0 || pos.x >= this.mapWidth - 1 || pos.y >= this.mapHeight - 1) return height;
    const surf = this.get(pos).surface();
    if (!surf) return height;
    height.waterHeight = surf.waterHeight();
    height.landHeight = surf.baseHeight();
    const slope = surf.slopeCorners();
    const xl = pos.x & 0x1f, yl = pos.y & 0x1f;
    const U = SurfaceSlope.CornerUp, S = SurfaceSlope.SideUp, D = SurfaceSlope.CornerDown, V = SurfaceSlope.Valley;
    if (slope === U.north || slope === U.east || slope === U.south || slope === U.west) height.landHeight += oneCornerUp(xl, yl, slope);
    else if (slope === S.northeast || slope === S.southeast || slope === S.northwest || slope === S.southwest) height.landHeight += oneSideUp(xl, yl, slope);
    else if (slope === D.north || slope === D.east || slope === D.south || slope === D.west) height.landHeight += oneCornerDown(xl, yl, slope, surf.isSlopeDoubleHeight());
    else if (slope === V.northsouth || slope === V.westeast) height.landHeight += valley(xl, yl, slope);
    return height;
  }
}

const K = 31; // local kTileSize in TileManager.cpp's height helpers
function oneCornerUp(xl, yl, slope) {
  const U = SurfaceSlope.CornerUp;
  let quad = 0;
  if (slope === U.north) quad = xl + yl - K; else if (slope === U.east) quad = xl - yl;
  else if (slope === U.south) quad = K - yl - xl; else if (slope === U.west) quad = yl - xl;
  return quad > 0 ? Math.trunc(quad / 2) : 0;
}
function oneSideUp(xl, yl, slope) {
  const S = SurfaceSlope.SideUp;
  if (slope === S.northeast) return Math.trunc(xl / 2) + 1;
  if (slope === S.southeast) return Math.trunc((K - yl) / 2);
  if (slope === S.northwest) return Math.trunc(yl / 2) + 1;
  if (slope === S.southwest) return Math.trunc((K - xl) / 2);
  return 0;
}
function oneCornerDown(xl, yl, slope, isDoubleHeight) {
  const D = SurfaceSlope.CornerDown;
  let quadExtra = 0, quad = 0;
  if (slope === D.west) { quadExtra = xl + K - yl; quad = xl - yl; }
  else if (slope === D.south) { quadExtra = xl + yl; quad = xl + yl - K - 1; }
  else if (slope === D.east) { quadExtra = K - xl + yl; quad = yl - xl; }
  else if (slope === D.north) { quadExtra = (K - xl) + (K - yl); quad = K - yl - xl - 1; }
  return isDoubleHeight ? Math.trunc(quadExtra / 2) + 1 : Math.trunc(quad / 2) + 16;
}
function valley(xl, yl, slope) {
  let quad = 0;
  if (slope === SurfaceSlope.Valley.westeast) { if (xl + yl > K + 1) quad = K - xl - yl; }
  else if (slope === SurfaceSlope.Valley.northsouth) quad = xl - yl;
  return quad > 0 ? Math.trunc(quad / 2) : 0;
}

const cornerDownMask = (up) => {
  const U = SurfaceSlope.CornerUp, D = SurfaceSlope.CornerDown;
  return up === U.north ? D.south : up === U.south ? D.north : up === U.west ? D.east : up === U.east ? D.west : 0;
};
/** TileManager::getSurfaceCornerDownHeight (smallZ). @param {SurfaceElement} surface */
export function getSurfaceCornerDownHeight(surface, cornerMask) {
  let baseZ = surface.baseZ();
  if (surface.slope() & cornerMask) {
    baseZ += 4;
    if (surface.isSlopeDoubleHeight() && surface.slopeCorners() === cornerDownMask(cornerMask)) baseZ += 4;
  }
  return baseZ;
}
/** TileManager::getSurfaceCornerHeight (smallZ). @param {SurfaceElement} surface */
export function getSurfaceCornerHeight(surface) {
  let baseZ = surface.baseZ();
  if (surface.slope()) { baseZ += 4; if (surface.isSlopeDoubleHeight()) baseZ += 4; }
  return baseZ;
}
