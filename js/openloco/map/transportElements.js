/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: include/OpenLoco/Map/TrackElement.h, RoadElement.h, SignalElement.h, StationElement.h,
 *         src/Map/RoadElement.cpp (constructor), src/Map/Track/Track.cpp (TrackElement constructor),
 *         src/Map/Tile.cpp (StationElement::stationType). Bit layout identical to the C++.
 * Not ported: RoadElement::tick, animation updates (need game state/ObjectManager).
 */
import { TileElement, ElementType, setMasked } from './elements.js';

const bit = (b, i, mask) => (b[i] & mask) !== 0;
const setBit = (b, i, mask, s) => { b[i] = s ? (b[i] | mask) : (b[i] & ~mask & 0xff); };

/** StationType (World/Station.h). */
export const StationType = Object.freeze({ trainStation: 0, roadStation: 1, airport: 2, docks: 3 });
/** CompanyId::neutral / null. */
export const COMPANY_NEUTRAL = 15;
export const COMPANY_NULL = 0xff;
/** StationId::null. */
export const STATION_NULL = 0xffff;

/** TrackElement. */
export class TrackElement extends TileElement {
  static kElementType = ElementType.track;
  /**
   * Same arguments as the C++ constructor. `bridge` is a bridge object id or null/undefined.
   * @param {{baseZ:number,clearZ:number,direction:number,quarterTile:number,sequenceIndex:number,trackObjId:number,trackId:number,bridge?:?number,owner:number,mods?:number}} a
   */
  static create(a) {
    const e = new TrackElement();
    const b = e.bytes, hasBridge = a.bridge !== null && a.bridge !== undefined;
    b[0] = a.direction & 3;
    e.setBaseZ(a.baseZ); e.setClearZ(a.clearZ);
    b[1] = a.quarterTile & 0xf;
    b[4] = (a.trackId & 0x3f) | (hasBridge ? 0x80 : 0);
    b[5] = (a.sequenceIndex & 0xf) | ((a.trackObjId & 0xf) << 4);
    b[6] = hasBridge ? (a.bridge << 5) & 0xff : 0;
    b[7] = (a.owner & 0xf) | (((a.mods || 0) << 4) & 0xff);
    return e;
  }
  hasStationElement() { return bit(this.bytes, 0, 0x80); }
  setHasStationElement(s) { setBit(this.bytes, 0, 0x80, s); }
  hasSignal() { return bit(this.bytes, 0, 0x40); }
  setHasSignal(s) { setBit(this.bytes, 0, 0x40, s); }
  rotation() { return this.bytes[0] & 3; }
  setRotation(r) { setMasked(this.bytes, 0, 3, r); }
  trackId() { return this.bytes[4] & 0x3f; }
  setTrackId(id) { setMasked(this.bytes, 4, 0x3f, id); }
  hasBridge() { return bit(this.bytes, 4, 0x80); }
  setHasBridge(s) { setBit(this.bytes, 4, 0x80, s); }
  hasGhostMods() { return bit(this.bytes, 4, 0x40); }
  setHasGhostMods(s) { setBit(this.bytes, 4, 0x40, s); }
  trackObjectId() { return this.bytes[5] >> 4; }
  setTrackObjectId(id) { setMasked(this.bytes, 5, 0xf0, (id & 0xf) << 4); }
  sequenceIndex() { return this.bytes[5] & 0xf; }
  setSequenceIndex(i) { setMasked(this.bytes, 5, 0xf, i); }
  hasLevelCrossing() { return bit(this.bytes, 6, 0x10); }
  setHasLevelCrossing(s) { setBit(this.bytes, 6, 0x10, s); }
  bridge() { return this.bytes[6] >> 5; }
  setBridgeObjectId(id) { setMasked(this.bytes, 6, 0xe0, (id & 7) << 5); }
  owner() { return this.bytes[7] & 0xf; }
  setOwner(o) { setMasked(this.bytes, 7, 0xf, o); }
  hasMod(mod) { return (this.bytes[7] & (1 << (4 + mod))) !== 0; }
  mods() { return this.bytes[7] >> 4; }
  setMod(mod, s) { setBit(this.bytes, 7, 1 << (4 + mod), s); }
}

/** RoadElement. */
export class RoadElement extends TileElement {
  static kElementType = ElementType.road;
  /** C++ RoadElement(baseZ, clearZ). */
  static create(baseZ, clearZ) {
    const e = new RoadElement();
    e.setBaseZ(baseZ); e.setClearZ(clearZ);
    return e;
  }
  rotation() { return this.bytes[0] & 3; }
  setRotation(r) { setMasked(this.bytes, 0, 3, r); }
  roadId() { return this.bytes[4] & 0xf; }
  setRoadId(id) { setMasked(this.bytes, 4, 0xf, id); }
  hasGhostMods() { return bit(this.bytes, 4, 0x40); }
  setHasGhostMods(s) { setBit(this.bytes, 4, 0x40, s); }
  hasBridge() { return bit(this.bytes, 4, 0x80); }
  setHasBridge(s) { setBit(this.bytes, 4, 0x80, s); }
  laneOccupation() { return (this.bytes[4] & 0x30) >> 4; }
  setLaneOccupation(v) { setMasked(this.bytes, 4, 0x30, (v & 3) << 4); }
  roadObjectId() { return this.bytes[5] >> 4; }
  setRoadObjectId(id) { setMasked(this.bytes, 5, 0xf0, (id & 0xf) << 4); }
  sequenceIndex() { return this.bytes[5] & 3; }
  setSequenceIndex(i) { setMasked(this.bytes, 5, 3, i); }
  levelCrossingObjectId() { return (this.bytes[5] >> 2) & 3; }
  setLevelCrossingObjectId(id) { setMasked(this.bytes, 5, 0b1100, (id & 3) << 2); }
  streetLightStyle() { return (this.bytes[5] >> 2) & 3; }
  setStreetLightStyle(s) { setMasked(this.bytes, 5, 0b1100, (s & 3) << 2); }
  levelCrossingAnimationFrame() { return this.bytes[6] & 0xf; }
  setLevelCrossingAnimationFrame(v) { setMasked(this.bytes, 6, 0xf, v); }
  bridge() { return this.bytes[6] >> 5; }
  setBridgeObjectId(id) { setMasked(this.bytes, 6, 0xe0, (id << 5) & 0xe0); }
  hasStationElement() { return bit(this.bytes, 0, 0x80); }
  setHasStationElement(s) { setBit(this.bytes, 0, 0x80, s); }
  hasSignalElement() { return bit(this.bytes, 0, 0x40); }
  isLevelCrossingClosed() { return bit(this.bytes, 7, 1 << 4); }
  setLevelCrossingClosed(s) { setBit(this.bytes, 7, 1 << 4, s); }
  hasLevelCrossing() { return bit(this.bytes, 7, 1 << 5); }
  setHasLevelCrossing(s) { setBit(this.bytes, 7, 1 << 5, s); }
  hasUnk7_40() { return bit(this.bytes, 7, 1 << 6); }
  setUnk7_40(s) { setBit(this.bytes, 7, 1 << 6, s); }
  hasUnk7_80() { return bit(this.bytes, 7, 1 << 7); }
  setUnk7_80(s) { setBit(this.bytes, 7, 1 << 7, s); }
  hasMod(mod) { return (this.bytes[7] & (1 << (mod + 6))) !== 0; }
  mods() { return this.bytes[7] >> 6; }
  setMods(m) { setMasked(this.bytes, 7, 0xc0, (m & 3) << 6); }
  setMod(mod, v) { setBit(this.bytes, 7, 1 << (mod + 6), v); }
  owner() { return this.bytes[7] & 0xf; }
  setOwner(o) { setMasked(this.bytes, 7, 0xf, o); }
}

/** One side (bytes 4,5 or 6,7) of a SignalElement (C++ SignalElement::Side). */
export class SignalSide {
  /** @param {Uint8Array} bytes element bytes @param {number} off 4 (left) or 6 (right) */
  constructor(bytes, off) { this.b = bytes; this.o = off; }
  hasSignal() { return bit(this.b, this.o, 0x80); }
  setHasSignal(s) { setBit(this.b, this.o, 0x80, s); }
  isOccupied() { return bit(this.b, this.o, 1 << 6); }
  setIsOccupied(s) { setBit(this.b, this.o, 1 << 6, s); }
  getUnk4() { return (this.b[this.o] >> 4) & 3; }
  setUnk4(v) { setMasked(this.b, this.o, 0x30, (v & 3) << 4); }
  signalObjectId() { return this.b[this.o] & 0xf; }
  setSignalObjectId(id) { setMasked(this.b, this.o, 0xf, id); }
  frame() { return this.b[this.o + 1] & 0xf; }
  setFrame(f) { setMasked(this.b, this.o + 1, 0xf, f); }
  allLights() { return this.b[this.o + 1] >> 4; }
  setAllLights(l) { setMasked(this.b, this.o + 1, 0xf0, (l << 4) & 0xf0); }
  hasRedLight() { return bit(this.b, this.o + 1, 0x40); }
  hasRedLight2() { return bit(this.b, this.o + 1, 0x10); }
  hasGreenLight() { return bit(this.b, this.o + 1, 0x80); }
  hasGreenLight2() { return bit(this.b, this.o + 1, 0x20); }
}

/** SignalElement. */
export class SignalElement extends TileElement {
  static kElementType = ElementType.signal;
  constructor(bytes) { super(bytes); this._left = new SignalSide(this.bytes, 4); this._right = new SignalSide(this.bytes, 6); }
  rotation() { return this.bytes[0] & 3; }
  setRotation(r) { setMasked(this.bytes, 0, 3, r); }
  isLeftGhost() { return bit(this.bytes, 0, 0x80); }
  setLeftGhost(s) { setBit(this.bytes, 0, 0x80, s); }
  isRightGhost() { return bit(this.bytes, 0, 0x40); }
  setRightGhost(s) { setBit(this.bytes, 0, 0x40, s); }
  getLeft() { return this._left; }
  getRight() { return this._right; }
}

/** StationElement (_stationId is little-endian uint16 at bytes 6..7). */
export class StationElement extends TileElement {
  static kElementType = ElementType.station;
  owner() { return this.bytes[4] & 0xf; }
  setOwner(o) { setMasked(this.bytes, 4, 0xf, o); }
  setUnk4SLR4(v) { setMasked(this.bytes, 4, 0xf0, (v & 0xf) << 4); }
  objectId() { return this.bytes[5] & 0x1f; }
  setObjectId(id) { setMasked(this.bytes, 5, 0x1f, id); }
  /** @returns {number} StationType */
  stationType() { return this.bytes[5] >> 5; }
  setStationType(t) { setMasked(this.bytes, 5, 0xe0, (t & 7) << 5); }
  rotation() { return this.bytes[0] & 3; }
  setRotation(r) { setMasked(this.bytes, 0, 3, r); }
  sequenceIndex() { return (this.bytes[0] >> 6) & 3; }
  setSequenceIndex(i) { setMasked(this.bytes, 0, 0xc0, (i & 3) << 6); }
  _u16() { return this.bytes[6] | (this.bytes[7] << 8); }
  _setU16(v) { this.bytes[6] = v & 0xff; this.bytes[7] = (v >> 8) & 0xff; }
  /** 10-bit station id (0x3FF = null-ish; STATION_NULL is only used in query results). */
  stationId() { return this._u16() & 0x3ff; }
  setStationId(id) { this._setU16((this._u16() & ~0x3ff & 0xffff) | (id & 0x3ff)); }
  buildingType() { return (this._u16() & 0xfc00) >> 10; }
  setBuildingType(t) { this._setU16((this._u16() & ~0xfc00 & 0xffff) | ((t & 0x3f) << 10)); }
}
