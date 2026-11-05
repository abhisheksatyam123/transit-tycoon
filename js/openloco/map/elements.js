/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: include/OpenLoco/Map/TileElement.h, SurfaceElement.h, BuildingElement.h, TreeElement.h,
 *         WallElement.h, IndustryElement.h (accessors identical, camelCase, same byte layout).
 * Every element is an 8-byte Uint8Array view: [0]=_0, [1]=_flags, [2]=baseZ, [3]=clearZ, [4..7]=type specific.
 * C++ keeps type/isLast in a separate TileElementEntry; here the element carries its type (class) and the
 * `last` flag lives in _flags bit 7 (the original ElementFlags::last), maintained by TileManager.
 */

/** ElementType (TileElement.h). */
export const ElementType = Object.freeze({
  surface: 0, track: 1, station: 2, signal: 3, building: 4, tree: 5, wall: 6, road: 7, industry: 8,
});
export const TILE_ELEMENT_SIZE = 8;
/** ElementFlags (TileElement.h). */
export const ElementFlags = Object.freeze({ ghost: 1 << 4, aiAllocated: 1 << 5, flag6: 1 << 6, last: 1 << 7 });

/** SurfaceSlope (SurfaceElement.h). */
export const SurfaceSlope = (() => {
  const all = 0x0f, north = 1, east = 2, south = 4, west = 8;
  return Object.freeze({
    flat: 0, doubleHeight: 1 << 4, requiresHeightAdjustment: 1 << 5,
    CornerUp: Object.freeze({ all, north, east, south, west }),
    CornerDown: Object.freeze({ west: all & ~west, south: all & ~south, east: all & ~east, north: all & ~north }),
    SideUp: Object.freeze({ northeast: north | east, southeast: south | east, northwest: north | west, southwest: south | west }),
    Valley: Object.freeze({ westeast: east | west, northsouth: north | south }),
  });
})();

/** @param {Uint8Array} b @param {number} i @param {number} mask @param {number} v value already shifted */
export const setMasked = (b, i, mask, v) => { b[i] = (b[i] & ~mask & 0xff) | (v & mask); };
const bit = (b, i, mask) => (b[i] & mask) !== 0;
const setBit = (b, i, mask, state) => { b[i] = state ? (b[i] | mask) : (b[i] & ~mask & 0xff); };

/** Base of all elements (C++ TileElement). */
export class TileElement {
  /** @param {Uint8Array} [bytes] 8-byte backing store (copied by reference) */
  constructor(bytes) {
    this.bytes = bytes || new Uint8Array(TILE_ELEMENT_SIZE);
    if (this.bytes.length !== TILE_ELEMENT_SIZE) throw new Error('TileElement needs 8 bytes');
    /** @type {?TileElement[]} owning tile list (set by TileManager) */
    this.list = null;
    /** Tile coordinates (set by TileManager). */
    this.tx = -1; this.ty = -1;
  }

  /** @returns {number} ElementType of this class */
  type() { return this.constructor.kElementType; }
  /** C++ _flags (includes occupiedQuarter, ghost, aiAllocated, flag6, last). */
  flags() { return this.bytes[1]; }
  baseZ() { return this.bytes[2]; }
  baseHeight() { return this.bytes[2] * 4; }
  clearZ() { return this.bytes[3]; }
  clearHeight() { return this.bytes[3] * 4; }
  setBaseZ(v) { this.bytes[2] = v & 0xff; }
  setClearZ(v) { this.bytes[3] = v & 0xff; }
  occupiedQuarter() { return this.bytes[1] & 0xf; }
  setOccupiedQuarter(v) { setMasked(this.bytes, 1, 0xf, v); }
  isGhost() { return bit(this.bytes, 1, ElementFlags.ghost); }
  setGhost(s) { setBit(this.bytes, 1, ElementFlags.ghost, s); }
  isAiAllocated() { return bit(this.bytes, 1, ElementFlags.aiAllocated); }
  setAiAllocated(s) { setBit(this.bytes, 1, ElementFlags.aiAllocated, s); }
  isFlag6() { return bit(this.bytes, 1, ElementFlags.flag6); }
  setFlag6(s) { setBit(this.bytes, 1, ElementFlags.flag6, s); }
  isLast() { return bit(this.bytes, 1, ElementFlags.last); }
  setLastFlag(s) { setBit(this.bytes, 1, ElementFlags.last, s); }
  /** Raw 8 bytes. */
  rawData() { return this.bytes; }

  /** Following element in the same tile, or null (TileElementEntry::next). */
  next() { return this.list ? this.list[this.list.indexOf(this) + 1] || null : null; }
  /** Preceding element in the same tile, or null (TileElementEntry::prev). */
  prev() { const i = this.list ? this.list.indexOf(this) : -1; return i > 0 ? this.list[i - 1] : null; }
  /** C++ entry.as<T>(): this if it is a T, else null. @param {Function} cls */
  as(cls) { return this instanceof cls && this.type() === cls.kElementType ? this : null; }
}

/** SurfaceElement. */
export class SurfaceElement extends TileElement {
  static kElementType = ElementType.surface;
  /** Same arguments as the C++ constructor. */
  static create(baseZ, clearZ, quarterTile, highTypeFlag) {
    const e = new SurfaceElement();
    e.setBaseZ(baseZ); e.setClearZ(clearZ); e.bytes[1] = quarterTile & 0xff; e.setIsIndustrialFlag(!!highTypeFlag);
    return e;
  }
  isSlopeDoubleHeight() { return bit(this.bytes, 4, SurfaceSlope.doubleHeight); }
  slopeCorners() { return this.bytes[4] & 0x0f; }
  slope() { return this.bytes[4] & 0x1f; }
  setSlope(s) { this.bytes[4] = s & 0x1f; } // C++ clears the snow bits too
  snowCoverage() { return (this.bytes[4] & 0xe0) >> 5; }
  setSnowCoverage(c) { this.bytes[4] = (this.bytes[4] & ~0xe0 & 0xff) | ((c << 5) & 0xe0); }
  water() { return this.bytes[5] & 0x1f; }
  waterHeight() { return (this.bytes[5] & 0x1f) * 16; }
  setWater(level) { this.bytes[5] = (this.bytes[5] & 0xe0) | (level & 0x1f); }
  getUpdateTimer() { return (this.bytes[5] & 0xe0) >> 5; }
  setUpdateTimer(v) { this.bytes[5] = (this.bytes[5] & 0x1f) | ((v << 5) & 0xe0); }
  terrain() { return this.bytes[6] & 0x1f; }
  setTerrain(t) { setMasked(this.bytes, 6, 0x1f, t); }
  getGrowthStage() { return this.bytes[6] >> 5; }
  setGrowthStage(v) { this.bytes[6] = (this.bytes[6] & 0x1f) | ((v << 5) & 0xe0); }
  industryId() { return this.bytes[7]; }
  variation() { return this.bytes[7]; }
  setIndustry(id) { this.bytes[7] = id & 0xff; }
  setVariation(v) { this.bytes[7] = v & 0xff; }
  hasType6Flag() { return bit(this.bytes, 0, 0x40); }
  setType6Flag(s) { setBit(this.bytes, 0, 0x40, s); }
  isIndustrial() { return bit(this.bytes, 0, 0x80); }
  setIsIndustrialFlag(s) { setBit(this.bytes, 0, 0x80, s); }
}

/** BuildingElement (accessors needed for clearance + adapter; _6 is little-endian uint16). */
export class BuildingElement extends TileElement {
  static kElementType = ElementType.building;
  rotation() { return this.bytes[0] & 3; }
  setRotation(r) { setMasked(this.bytes, 0, 3, r); }
  isMiscBuilding() { return bit(this.bytes, 0, 0x40); }
  setIsMiscBuilding(s) { setBit(this.bytes, 0, 0x40, s); }
  isConstructed() { return bit(this.bytes, 0, 0x80); }
  setConstructed(s) { setBit(this.bytes, 0, 0x80, s); }
  objectId() { return this.bytes[4]; }
  setObjectId(id) { this.bytes[4] = id & 0xff; }
  sequenceIndex() { return this.bytes[5] & 3; }
  setSequenceIndex(i) { setMasked(this.bytes, 5, 3, i); }
  unk5u() { return this.bytes[5] >> 5; }
  setUnk5u(v) { this.bytes[5] = (this.bytes[5] & 0x1f) | ((v << 5) & 0xe0); }
  _u16() { return this.bytes[6] | (this.bytes[7] << 8); }
  _setU16(v) { this.bytes[6] = v & 0xff; this.bytes[7] = (v >> 8) & 0xff; }
  colour() { return this._u16() >> 11; }
  setColour(c) { this._setU16((this._u16() & 0x7ff) | ((c & 0x1f) << 11)); }
  variation() { return (this._u16() >> 6) & 0x1f; }
  setVariation(v) { this._setU16((this._u16() & ~0x07c0 & 0xffff) | ((v & 0x1f) << 6)); }
  age() { return this._u16() & 0x3f; }
  setAge(a) { this._setU16((this._u16() & ~0x3f & 0xffff) | (a & 0x3f)); }
}

/** TreeElement. */
export class TreeElement extends TileElement {
  static kElementType = ElementType.tree;
  treeObjectId() { return this.bytes[4]; }
  setTreeObjectId(t) { this.bytes[4] = t & 0xff; }
  rotation() { return this.bytes[0] & 3; }
  setRotation(r) { setMasked(this.bytes, 0, 3, r); }
  quadrant() { return (this.bytes[0] >> 6) & 3; }
  setQuadrant(q) { setMasked(this.bytes, 0, 0xc0, (q & 3) << 6); }
  growth() { return this.bytes[5] & 0xf; }
  setGrowth(g) { setMasked(this.bytes, 5, 0xf, g); }
}

/** WallElement. */
export class WallElement extends TileElement {
  static kElementType = ElementType.wall;
  wallObjectId() { return this.bytes[4]; }
  setWallObjectId(id) { this.bytes[4] = id & 0xff; }
  rotation() { return this.bytes[0] & 3; }
  setRotation(r) { setMasked(this.bytes, 0, 3, r); }
  getSlopeFlags() { return (this.bytes[0] & 0xc0) >> 6; }
  setSlopeFlags(f) { setMasked(this.bytes, 0, 0xc0, (f << 6) & 0xc0); }
  getPrimaryColour() { return this.bytes[6] & 0x1f; }
  setPrimaryColour(c) { setMasked(this.bytes, 6, 0x1f, c); }
}

/** IndustryElement (kIndustryElement* masks: rotation 0x03, constructed 0x80, sequence 0x03 of _5). */
export class IndustryElement extends TileElement {
  static kElementType = ElementType.industry;
  industryId() { return this.bytes[4]; }
  setIndustryId(id) { this.bytes[4] = id & 0xff; }
  rotation() { return this.bytes[0] & 3; }
  setRotation(r) { setMasked(this.bytes, 0, 3, r); }
  isConstructed() { return bit(this.bytes, 0, 0x80); }
  setIsConstructed(s) { setBit(this.bytes, 0, 0x80, s); }
  sequenceIndex() { return this.bytes[5] & 3; }
  setSequenceIndex(i) { setMasked(this.bytes, 5, 3, i); }
  sectionProgress() { return (this.bytes[5] & 0xe0) >> 5; }
  setSectionProgress(v) { setMasked(this.bytes, 5, 0xe0, (v << 5) & 0xe0); }
  buildingType() { return (this.bytes[6] | (this.bytes[7] << 8)) >> 6 & 0x1f; }
  setBuildingType(t) {
    const v = ((this.bytes[6] | (this.bytes[7] << 8)) & ~0x07c0 & 0xffff) | ((t & 0x1f) << 6);
    this.bytes[6] = v & 0xff; this.bytes[7] = v >> 8;
  }
}
