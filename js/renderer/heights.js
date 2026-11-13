/**
 * Terrain heights, OpenTTD vertex model (landscape.cpp: one height per tile = its N corner).
 * Vertex (cx,cy) is the N corner of tile (cx,cy); the E/S/W corners of tile (x,y) are the N corners
 * of tiles (x+1,y), (x+1,y+1), (x,y+1). So tile (x,y) corners are [h(x,y), h(x+1,y), h(x+1,y+1), h(x,y+1)]
 * in screen order [N,E,S,W]. A vertex touching any water tile is at sea level 0, so water stays flat
 * and land next to water gets a shore slope. Out-of-map vertices clamp to the edge tile.
 * Rendering only; the simulation is untouched.
 *
 * Screen: tile (x,y) top corner N = (x,y) screen top, E = (x+1,y) right, S bottom, W left.
 */
import { HEIGHT_STEP } from './iso.js';
import { airportType, airportTypeId } from '../simulation/airportTypes.js';

/** Largest airport footprint side (airportTypes.js: international is 7x7); scan padding for area-scoped flatten. */
const MAX_AIRPORT_SPAN = 8;

/** Clamp v into [lo, hi]. @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Heights {
  /**
   * @param {{width:number,height:number,tiles:any[]}} map
   */
  constructor(map) {
    /** @type {{width:number,height:number,tiles:any[]}} */
    this.map = map;
    this.W = map.width;
    this.H = map.height;
    /** row stride of the corner grid */
    this.cw = this.W + 1;
    /** @type {Float32Array} vertex heights in levels, index cy*(W+1)+cx */
    this.data = new Float32Array((this.W + 1) * (this.H + 1));
    this.rebuild();
  }

  /** Recompute all vertex heights from the current tile heights/terrain. */
  rebuild() {
    for (let cy = 0; cy <= this.H; cy++) for (let cx = 0; cx <= this.W; cx++) this.vertex(cx, cy);
    this.flattenAirports();
  }

  /**
   * Airport footprints are drawn on one flat level: the highest vertex of the footprint (OpenTTD levels
   * airports; the simulation still allows a 1-level step). Only the render vertices change; the sim
   * heights are untouched. Each footprint is found from its airport tiles (origin = tile minus dx,dy).
   * @param {{x0:number,y0:number,x1:number,y1:number}} [area] when given, only airports whose footprint
   *   can intersect the refreshed area are rescanned/reflattened (lazy, area-scoped). The scan window is
   *   widened by the largest airport footprint so a footprint touching the area is never missed.
   */
  flattenAirports(area) {
    const { W, H, map } = this;
    const origins = new Map();
    let x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1;
    if (area) {
      const pad = MAX_AIRPORT_SPAN;
      x0 = Math.max(0, Math.min(area.x0, area.x1) - pad);
      y0 = Math.max(0, Math.min(area.y0, area.y1) - pad);
      x1 = Math.min(W - 1, Math.max(area.x0, area.x1) + pad);
      y1 = Math.min(H - 1, Math.max(area.y0, area.y1) + pad);
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const b = map.tiles[y * W + x].building;
      if (!b || b.type !== 'station' || b.kind !== 'airport') continue;
      const ox = x - (b.dx | 0), oy = y - (b.dy | 0);
      origins.set(oy * W + ox, { ox, oy, type: airportType(airportTypeId(b)) });
    }
    for (const { ox, oy, type } of origins.values()) {
      let top = -Infinity;
      for (let cy = oy; cy <= oy + type.h; cy++) for (let cx = ox; cx <= ox + type.w; cx++) top = Math.max(top, this.cornerH(cx, cy));
      for (let cy = oy; cy <= oy + type.h; cy++) for (let cx = ox; cx <= ox + type.w; cx++) this.data[cy * this.cw + cx] = top;
    }
  }

  /** Recompute one vertex from its four surrounding tiles. */
  vertex(cx, cy) {
    const { W, H, cw, data } = this;
    const tiles = this.map.tiles;
    let water = false;
    for (let dy = -1; dy <= 0 && !water; dy++) {
      for (let dx = -1; dx <= 0; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const u = tiles[y * W + x];
        if (u.terrain !== 'water') continue;
        if (!u.river && !u.canal) { water = true; break; } // flowing rivers (tile.river) keep the terrain vertex heights
      }
    }
    const t = tiles[clamp(cy, 0, H - 1) * W + clamp(cx, 0, W - 1)];
    // sea and lakes sit at sea level 0; flowing rivers follow the terrain (drawn as sloped water)
    data[cy * cw + cx] = water ? 0 : t.height;
  }

  /**
   * Recompute the vertices touched by tile rectangle x0..x1, y0..y1 (after terraforming).
   * Tile (x,y) feeds vertices (x..x+1, y..y+1), so the range is widened by one vertex on the far side.
   */
  refreshArea(x0, y0, x1, y1) {
    for (let cy = Math.max(0, y0); cy <= Math.min(this.H, y1 + 1); cy++) {
      for (let cx = Math.max(0, x0); cx <= Math.min(this.W, x1 + 1); cx++) this.vertex(cx, cy);
    }
    this.flattenAirports({ x0, y0, x1, y1 });
  }

  /**
   * Height of a vertex (coordinates clamped to the grid).
   * @param {number} cx
   * @param {number} cy
   * @returns {number}
   */
  cornerH(cx, cy) {
    return this.data[clamp(cy, 0, this.H) * this.cw + clamp(cx, 0, this.W)];
  }

  /**
   * Corner heights of a tile.
   * @param {number} x
   * @param {number} y
   * @returns {number[]} [hN, hE, hS, hW]
   */
  tileCorners(x, y) {
    return [this.cornerH(x, y), this.cornerH(x + 1, y), this.cornerH(x + 1, y + 1), this.cornerH(x, y + 1)];
  }

  /**
   * Mean height of a tile (centre of its surface), or -1 when out of bounds.
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  centerH(x, y) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return -1;
    const c = this.tileCorners(x, y);
    return (c[0] + c[1] + c[2] + c[3]) / 4;
  }

  /**
   * Surface height at float tile coordinates (integer = tile centre). Coordinates outside the map
   * are clamped to the edge tile. Linear within each of the two triangles of the tile.
   * @param {number} fx
   * @param {number} fy
   * @returns {number} height in levels (>= 0)
   */
  surfaceH(fx, fy) {
    const x = clamp(Math.floor(fx + 0.5), 0, this.W - 1);
    const y = clamp(Math.floor(fy + 0.5), 0, this.H - 1);
    const t = this.map.tiles[y * this.W + x];
    if (t && t.bridgeDeck !== undefined) return t.bridgeDeck; // deck height for vehicles on it (also over track)
    if (t && t.aqueduct && t.aqueduct.role === 'deck') return t.aqueduct.level;
    const u = clamp(fx - x, -0.5, 0.5);
    const v = clamp(fy - y, -0.5, 0.5);
    const hN = this.cornerH(x, y), hE = this.cornerH(x + 1, y);
    const hS = this.cornerH(x + 1, y + 1), hW = this.cornerH(x, y + 1);
    if (u >= v) {
      return hN + (hE - hN) * (u + 0.5) + (hS - hE) * (v + 0.5);
    }
    return hN + (hS - hW) * (u + 0.5) + (hW - hN) * (v + 0.5);
  }

  /**
   * Screen y offset (pixels) for a level value.
   * @param {number} h
   * @returns {number}
   */
  pxOffset(h) {
    return h * HEIGHT_STEP;
  }
}
