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
