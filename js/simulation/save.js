/**
 * Save/load: the whole game is the JSON-serialisable `state` object.
 */
import { SAVE_VERSION } from './constants.js';
import { createTraffic } from './traffic.js';
import { LM3D } from '../config/landmarks3d.js';
import { ensureGoals } from './goals.js';

/**
 * Serialise state to a JSON string.
 * Random worlds keep the classic format (byte-identical). Scenario (real-map) saves pack the
 * big arrays: tiles become a dictionary of distinct tile JSONs + run-length coded indices, and
 * traffic per-tile arrays become run-length coded binary (format tag `rle: 1`).
 * @param {object} state
 * @returns {string}
 */
export function serializeState(state) {
  if (!state.scenario) return JSON.stringify(state);
  const tiles = Array.isArray(state.map.tiles) ? packTiles(state.map.tiles) : state.map.tiles;
  const tr = state.traffic ? packTraffic(state.traffic) : state.traffic;
  return JSON.stringify({ ...state, map: { ...state.map, tiles }, traffic: tr });
}

/** Pack an array of non-negative integers as run-length pairs in binary (base64). Null if not packable. */
function packRuns(arr) {
  let max = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isInteger(v) || v < 0) return null;
    if (v > max) max = v;
  }
  const w = max < 256 ? 1 : max < 65536 ? 2 : 4;
  const vals = [], runs = [];
  for (let i = 0, n = arr.length; i < n;) {
    const v = arr[i];
    let j = i + 1;
    while (j < n && arr[j] === v && j - i < 65535) j++;
    vals.push(v); runs.push(j - i);
    i = j;
  }
  const rec = w + 2, buf = new Uint8Array(vals.length * rec);
  for (let k = 0, p = 0; k < vals.length; k++, p += rec) {
    let v = vals[k];
    for (let b = 0; b < w; b++) { buf[p + b] = v & 255; v = Math.floor(v / 256); }
    buf[p + w] = runs[k] & 255; buf[p + w + 1] = runs[k] >> 8;
  }
  return { rle: 1, w, n: arr.length, d: bytesToB64(buf) };
}

/** Inverse of packRuns. */
function unpackRuns(p) {
  const buf = b64ToBytes(p.d), w = p.w, rec = w + 2, out = new Array(p.n);
  let o = 0;
  for (let q = 0; q < buf.length; q += rec) {
    let v = 0;
    for (let b = w - 1; b >= 0; b--) v = v * 256 + buf[q + b];
    const run = buf[q + w] | (buf[q + w + 1] << 8);
    for (let r = 0; r < run; r++) out[o++] = v;
  }
  if (o !== p.n) throw new Error('Corrupt packed save array');
  return out;
}

/** Packed arrays are objects with `rle: 1`; anything else is a plain (unpacked) array. */
function isPackedRuns(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x) && x.rle === 1;
}

function packTraffic(tr) {
  const pk = (a) => (Array.isArray(a) ? (packRuns(a) ?? a) : a);
  const out = { ...tr, load: pk(tr.load), jam: pk(tr.jam) };
  if (tr.acc) out.acc = { ...tr.acc, samples: pk(tr.acc.samples), blocked: pk(tr.acc.blocked) };
  return out;
}

function unpackTraffic(tr) {
  const up = (a) => (isPackedRuns(a) ? unpackRuns(a) : a);
  if (tr.load !== undefined) tr.load = up(tr.load);
  if (tr.jam !== undefined) tr.jam = up(tr.jam);
  if (tr.acc) { tr.acc.samples = up(tr.acc.samples); tr.acc.blocked = up(tr.acc.blocked); }
  return tr;
}

/** Tiles -> { format, n, sigs: distinct tile JSON strings, runs: RLE of sig indices }. */
function packTiles(tiles) {
  const ids = new Map(), sigs = [], idx = new Array(tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    const s = JSON.stringify(tiles[i]); // exact by construction, so any tile shape round-trips
    let k = ids.get(s);
    if (k === undefined) { k = sigs.length; sigs.push(s); ids.set(s, k); }
    idx[i] = k;
  }
  return { format: 'tiles-rle-v1', n: tiles.length, sigs, runs: packRuns(idx) };
}

/** Inverse of packTiles: every tile is a fresh object (no shared mutable sub-objects). */
function unpackTiles(p) {
  const idx = unpackRuns(p.runs);
  const sigs = p.sigs;
  // parse each distinct signature once; tiles whose fields are all primitives are shallow-copied from it
  const tpl = sigs.map((s) => JSON.parse(s));
  const flat = tpl.map((t) => Object.values(t).every((v) => v === null || typeof v !== 'object'));
  const out = new Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    const k = idx[i];
    out[i] = flat[k] ? { ...tpl[k] } : JSON.parse(sigs[k]);
  }
  return out;
}

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Tile fields and their defaults (legacy compact-tile saves omit default-valued fields). */
const TILE_DEFAULTS = { terrain: 'grass', height: 0, rail: 0, road: 0, building: null, owner: null };

/** Restore default fields on a legacy compact tile. */
function expandTile(t) {
  return Object.assign({}, TILE_DEFAULTS, t, { building: t.building ?? null, owner: t.owner ?? null });
}

/**
 * Parse and validate a save string (or already-parsed object).
 * @param {string|object} json
 * @returns {object} state
 */
export function parseState(json) {
  const state = typeof json === 'string' ? JSON.parse(json) : structuredClone(json);
  if (state && state.map && state.map.tiles && state.map.tiles.format === 'tiles-rle-v1') {
    state.map.tiles = unpackTiles(state.map.tiles);
  } else if (state && state.map && Array.isArray(state.map.tiles)) {
    state.map.tiles = state.map.tiles.map(expandTile); // legacy compact tiles
  }
  if (state && state.traffic && typeof state.traffic === 'object') unpackTraffic(state.traffic);
  if (!state || typeof state !== 'object' || !state.map || !Array.isArray(state.map.tiles)) {
    throw new Error('Invalid save data');
  }
  if (state.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${state.version}`);
  return migrate(state);
}

/** Fill fields added after a save was written (keeps old saves of the same version loadable). */
function migrate(state) {
  state.news ??= [];
  state.depots ??= [];
  state.company.negativeMonths ??= 0;
  const n = state.map.width * state.map.height;
  if (state.scenario === 'moscow' && !Array.isArray(state.map.lm3dOverlays)) { // draw Moscow monuments added after this save was written
    state.map.lm3dOverlays = Object.values(LM3D)
      .filter((e) => !e.tiles?.length && Array.isArray(e.front) && Number.isInteger(e.front[0]) && Number.isInteger(e.front[1])
        && e.front[0] >= 0 && e.front[1] >= 0 && e.front[0] < state.map.width && e.front[1] < state.map.height)
      .map((e) => ({ id: e.id, x: e.front[0], y: e.front[1] }));
  }
  ensureGoals(state);
  if (!state.traffic) state.traffic = createTraffic(state);
  const tr = state.traffic;
  tr.load ??= [];
  if (tr.load.length !== n) tr.load = new Array(n).fill(0);
  tr.jam ??= [];
  if (tr.jam.length !== n) tr.jam = new Array(n).fill(0);
  tr.acc ??= { samples: new Array(n).fill(0), blocked: new Array(n).fill(0), speedSum: 0, speedN: 0 };
  if (tr.acc.samples.length !== n) tr.acc.samples = new Array(n).fill(0);
  tr.acc.blocked ??= new Array(n).fill(0);
  if (tr.acc.blocked.length !== n) tr.acc.blocked = new Array(n).fill(0);
  return state;
}
