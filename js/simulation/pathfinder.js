/**
 * A* pathfinder over the rail or road graph using a binary heap.
 * Depot tiles are endpoints only: they may be the start or a goal but are never passed through.
 */
import { DIRS, OPPOSITE } from './constants.js';

/** Minimal binary min-heap of node indices keyed by an external score array. */
class MinHeap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const a = this.items, k = this.keys;
    let i = a.length;
    a.push(item); k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      a[i] = a[p]; k[i] = k[p];
      i = p;
    }
    a[i] = item; k[i] = key;
  }
  pop() {
    const a = this.items, k = this.keys;
    const top = a[0];
    const lastItem = a.pop(), lastKey = k.pop();
    const n = a.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lastKey;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (r < n && k[r] < mk) { m = r; mk = k[r]; }
        if (m === i) break;
        a[i] = a[m]; k[i] = k[m];
        i = m;
      }
      a[i] = lastItem; k[i] = lastKey;
    }
    return top;
  }
}

/**
 * Find a path on a layer from start to any goal tile.
 * @param {{width:number,height:number,tiles:object[]}} map
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}[]} goals
 * @param {'rail'|'road'} layer
 * @param {{maxNodes?:number, avoidFirst?:{x:number,y:number}}} [opts]
 * @returns {{x:number,y:number}[]|null} tiles from start to goal inclusive
 */
export function findPath(map, start, goals, layer, opts = {}) {
  if (!goals || goals.length === 0) return null;
  const { width, height, tiles } = map;
  const n = width * height;
  const startIdx = start.y * width + start.x;
  const goalSet = new Set();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of goals) {
    goalSet.add(g.y * width + g.x);
    if (g.x < minX) minX = g.x;
    if (g.x > maxX) maxX = g.x;
    if (g.y < minY) minY = g.y;
    if (g.y > maxY) maxY = g.y;
  }
  if (goalSet.has(startIdx)) return [{ x: start.x, y: start.y }];
  const h = (x, y) => (x < minX ? minX - x : x > maxX ? x - maxX : 0) + (y < minY ? minY - y : y > maxY ? y - maxY : 0);
  const sc = scratchFor(n);
  const gen = ++sc.gen;
  const { g, came, closed, seen } = sc;
  const heap = new MinHeap();
  seen[startIdx] = gen;
  g[startIdx] = 0;
  came[startIdx] = -1;
  heap.push(startIdx, h(start.x, start.y));
  const maxNodes = opts.maxNodes ?? n;
  const avoid = opts.avoidFirst ? opts.avoidFirst.y * width + opts.avoidFirst.x : -1;
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur] === gen) continue;
    if (goalSet.has(cur)) return reconstruct(came, cur, width);
    closed[cur] = gen;
    if (++expanded > maxNodes) break;
    const cx = cur % width, cy = (cur - cx) / width;
    const tile = tiles[cur];
    if (cur !== startIdx && isDepot(tile)) continue; // depots are endpoints only
    const bits = tile[layer];
    if (!bits) continue;
    for (let i = 0; i < 4; i++) {
      const d = DIRS[i];
      if (!(bits & d.bit)) continue;
      const nx = cx + d.dx, ny = cy + d.dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (closed[ni] === gen) continue;
      if (cur === startIdx && ni === avoid) continue;
      const nt = tiles[ni];
      if (!(nt[layer] & OPPOSITE[d.bit])) continue;
      // turning costs a little more so straight routes are preferred
      const prev = came[cur];
      let step = 1;
      if (prev >= 0 && prev !== cur - (ni - cur)) step = 1.2;
      const ng = g[cur] + step;
      if (seen[ni] !== gen || ng < g[ni]) {
        seen[ni] = gen;
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + h(nx, ny));
      }
    }
  }
  return null;
}

/** Reusable per-map search buffers; `gen` stamps avoid clearing 76k entries per call. */
let scratch = null;
function scratchFor(n) {
  if (!scratch || scratch.g.length !== n) {
    scratch = { gen: 0, g: new Float64Array(n), came: new Int32Array(n), closed: new Uint32Array(n), seen: new Uint32Array(n) };
  }
  return scratch;
}

function isDepot(tile) {
  return tile.building !== null && tile.building !== undefined && tile.building.type === 'depot';
}

function reconstruct(came, end, width) {
  const out = [];
  let c = end;
  while (c >= 0) {
    const x = c % width;
    out.push({ x, y: (c - x) / width });
    c = came[c];
  }
  return out.reverse();
}
