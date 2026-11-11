/**
 * Save/load: the whole game is the JSON-serialisable `state` object.
 */
import { SAVE_VERSION } from './constants.js';
import { createTraffic } from './traffic.js';
import { LM3D, moscowLoaded } from './scenarios/moscowRegistry.js';
import { ensureGoals } from './goals.js';

/** Yield to the caller every this many tiles / cars (the driver decides whether to yield to the event loop). */
const TILE_CHUNK = 1024;
const CAR_CHUNK = 8;
/** Max main-thread time per slice of an async save (ms). The sync path ignores it. */
export const SAVE_SLICE_MS = 8;

/** Output is flushed to the sink in pieces of about this many chars (streamed saves; SV). */
export const SAVE_CHUNK_CHARS = 512 * 1024;

/**
 * Serialise state to a JSON string (synchronous: one run of the shared generator, see serializeStateSteps).
 * Random worlds keep the classic format (byte-identical). Scenario (real-map) saves pack the
 * big arrays: tiles become a dictionary of distinct tile JSONs + run-length coded indices, and
 * traffic per-tile arrays become run-length coded binary (format tag `rle: 1`).
 * @param {object} state
 * @returns {string}
 */
export function serializeState(state) {
  const sink = new Sink();
  drainSync(serializeStateSteps(state, sink));
  return sink.take();
}

/**
 * Time-sliced serialisation for the browser: the same generator as serializeState, driven in slices of
 * about SAVE_SLICE_MS with a yield to the event loop between slices. The output is byte-identical to
 * serializeState. The caller must not mutate `state` until the promise resolves (the game loop holds).
 *
 * Streaming: with `onChunk`, the output is handed over in pieces (about SAVE_CHUNK_CHARS each, in order;
 * their concatenation is the serializeState string) and the promise resolves with the total length.
 * Without it the promise resolves with the whole string.
 * @param {object} state
 * @param {{maxSliceMs?:number, maxStepMs?:number, slices?:number, totalMs?:number, sliceMs?:number}} [stats] filled in when given
 * @param {(chunk:string)=>void} [onChunk]
 * @returns {Promise<string|number>}
 */
export async function serializeStateAsync(state, stats, onChunk) {
  const sliceMs = SAVE_SLICE_MS;
  const t0 = performance.now();
  let maxSlice = 0, slices = 0, maxStep = 0, total = 0;
  const sink = new Sink();
  const gen = serializeStateSteps(state, sink);
  const flush = () => {
    if (sink.len < SAVE_CHUNK_CHARS && !sink.done) return;
    const all = sink.take();
    // hand over at most SAVE_CHUNK_CHARS per piece (bounded postMessage copies)
    for (let i = 0; i < all.length; i += SAVE_CHUNK_CHARS) {
      const piece = all.length <= SAVE_CHUNK_CHARS ? all : all.slice(i, i + SAVE_CHUNK_CHARS);
      total += piece.length;
      if (onChunk) onChunk(piece); else sink.keep.push(piece);
    }
  };
  let sliceStart = performance.now();
  for (;;) {
    const ts = performance.now();
    const r = gen.next();
    maxStep = Math.max(maxStep, performance.now() - ts);
    if (r.done) {
      sink.done = true;
      flush();
      const end = performance.now();
      maxSlice = Math.max(maxSlice, end - sliceStart);
      slices++;
      if (stats) Object.assign(stats, { maxSliceMs: maxSlice, maxStepMs: maxStep, slices, totalMs: end - t0, sliceMs });
      return onChunk ? total : sink.keep.join('');
    }
    flush();
    const now = performance.now();
    if (now - sliceStart >= sliceMs) {
      maxSlice = Math.max(maxSlice, now - sliceStart);
      slices++;
      await nextTurn();
      sliceStart = performance.now();
    }
  }
}

/** Collects the output fragments of the generator; take() returns and clears what it has so far. */
class Sink {
  constructor() { this.parts = []; this.len = 0; this.keep = []; this.done = false; }
  write(str) { this.parts.push(str); this.len += str.length; }
  take() { const s = this.parts.join(''); this.parts = []; this.len = 0; return s; }
}

/** Run a generator to completion. */
function drainSync(gen) {
  for (;;) {
    if (gen.next().done) return;
  }
}

/** Yield to the event loop (a macrotask, so input and rendering run between slices). */
function nextTurn() {
  if (typeof MessageChannel === 'function') {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
      ch.port2.postMessage(0);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
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
  const S = p.s || 1;
  let o = 0;
  for (let q = 0; q < buf.length; q += rec) {
    let v = 0;
    for (let b = w - 1; b >= 0; b--) v = v * 256 + buf[q + b];
    const run = buf[q + w] | (buf[q + w + 1] << 8);
    const val = S === 1 ? v : v / S;
    for (let r = 0; r < run; r++) out[o++] = val;
  }
  if (o !== p.n) throw new Error('Corrupt packed save array');
  return out;
}

/**
 * Fractional arrays (traffic load/jam are rounded to 2-3 decimals): find a power-of-ten scale S so that
 * every v satisfies Math.round(v*S)/S === v exactly, then pack the integers. Null when no scale fits.
 */
function packScaled(arr) {
  for (const S of [1, 10, 100, 1000, 10000]) {
    let ok = true;
    const ints = new Array(arr.length);
    for (let i = 0; i < arr.length && ok; i++) {
      const v = arr[i];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) { ok = false; break; }
      const n = Math.round(v * S);
      if (n / S !== v || !Number.isSafeInteger(n)) ok = false; else ints[i] = n;
    }
    if (ok) {
      const p = packRuns(ints);
      if (p) return S === 1 ? p : { ...p, rle: 2, s: S }; // rle 2 = scaled integers (old builds see an unknown tag)
    }
  }
  return null;
}

/** Packed arrays are objects with `rle: 1`; anything else is a plain (unpacked) array. */
function isPackedRuns(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x) && (x.rle === 1 || x.rle === 2);
}

/** Car keys in creation order (see traffic.js spawnCars). */
const CAR_KEYS = ['id', 'townId', 'path', 'i', 't', 'speed', 'wait', 'born', 'kind', 'color'];
const CAR_INT_KEYS = ['id', 'townId', 'i', 'wait', 'born', 'color'];


function zigzag(d) { return d >= 0 ? d * 2 : -d * 2 - 1; }
function unzigzag(z) { return z % 2 === 0 ? z / 2 : -(z + 1) / 2; }

/** LEB128 unsigned varint (values up to 2^53, so no bitwise overflow). */
function putVarint(out, v) {
  while (v >= 128) { out.push((v % 128) | 128); v = Math.floor(v / 128); }
  out.push(v);
}

/** Inverse of packCars: rebuilds cars with the same key order as the original objects. */
function unpackCars(col) {
  const buf = b64ToBytes(col.path);
  const out = new Array(col.n);
  let p = 0;
  const getVarint = () => {
    let v = 0, mul = 1, b;
    do { b = buf[p++]; v += (b & 127) * mul; mul *= 128; } while (b & 128);
    return v;
  };
  for (let q = 0; q < col.n; q++) {
    const len = col.plen[q], path = new Array(len);
    let prev = 0;
    for (let k = 0; k < len; k++) { prev += unzigzag(getVarint()); path[k] = prev; }
    out[q] = {
      id: col.id[q], townId: col.townId[q], path,
      i: col.i[q], t: col.t[q], speed: col.speed[q], wait: col.wait[q], born: col.born[q],
      kind: col.kinds[col.kind[q]], color: col.color[q],
    };
  }
  return out;
}


/** Station cargo parcels {amount,sourceX,sourceY,sinceTick} -> columns (int fields, zigzag deltas). */
const PARCEL_KEYS = ['amount', 'sourceX', 'sourceY', 'sinceTick'];
function packParcels(list) {
  if (!Array.isArray(list) || list.length === 0) return list;
  // cargodist: parcels may also carry a destination station id (dest), packed as a 5th column (dest+1, 0 = none)
  const withDest = list.some((p) => p && p.dest !== undefined && p.dest !== null);
  // transfer flag (lazy, set only on parcels moved in from another station): parcels-v3 adds a 6th column (0/1)
  const withXfer = list.some((p) => p && p.xfer === true);
  for (const p of list) {
    const keys = Object.keys(p);
    const ok = keys.length === 4 || (withDest && keys.length === 5 && keys.includes('dest') && (p.dest === null || Number.isSafeInteger(p.dest) && p.dest >= 0));
    const okX = !withXfer || keys.every((k) => PARCEL_KEYS.includes(k) || k === 'dest' || k === 'xfer') && (p.xfer === undefined || p.xfer === true || p.xfer === false);
    if (!ok && !(withXfer && okX)) return list;
    if (PARCEL_KEYS.some((k) => !Number.isSafeInteger(p[k]))) return list;
  }
  const bytes = [];
  const cols = PARCEL_KEYS.map(() => 0);
  let dcol = 0;
  for (const p of list) {
    for (let j = 0; j < 4; j++) { const v = p[PARCEL_KEYS[j]]; putVarint(bytes, zigzag(v - cols[j])); cols[j] = v; }
    if (withDest || withXfer) { const v = p.dest == null ? 0 : p.dest + 1; putVarint(bytes, zigzag(v - dcol)); dcol = v; }
    if (withXfer) putVarint(bytes, p.xfer === true ? 1 : 0);
  }
  if (withXfer) return { fmt: 'parcels-v3', n: list.length, d: bytesToB64(Uint8Array.from(bytes)) };
  if (withDest) return { fmt: 'parcels-v2', n: list.length, d: bytesToB64(Uint8Array.from(bytes)) };
  return { fmt: 'parcels-v1', n: list.length, d: bytesToB64(Uint8Array.from(bytes)) };
}

function unpackParcels(p) {
  const buf = b64ToBytes(p.d), cols = [0, 0, 0, 0], out = new Array(p.n);
  const withXfer = p.fmt === 'parcels-v3';
  const withDest = p.fmt === 'parcels-v2' || withXfer;
  let q = 0, dcol = 0;
  const getVarint = () => {
    let v = 0, mul = 1, b;
    do { b = buf[q++]; v += (b & 127) * mul; mul *= 128; } while (b & 128);
    return v;
  };
  for (let i = 0; i < p.n; i++) {
    const o = {};
    for (let j = 0; j < 4; j++) { cols[j] += unzigzag(getVarint()); o[PARCEL_KEYS[j]] = cols[j]; }
    if (withDest) {
      dcol += unzigzag(getVarint());
      o.dest = dcol === 0 ? null : dcol - 1;
    }
    if (withXfer && getVarint() === 1) o.xfer = true;
    out[i] = o;
  }
  return out;
}

/** Packs station cargo (per-cargo-type parcel lists) in every station. */
function packStations(stations) {
  if (!Array.isArray(stations)) return stations;
  return stations.map((st) => {
    if (!st || !st.cargo || typeof st.cargo !== 'object') return st;
    const cargo = {};
    for (const k of Object.keys(st.cargo)) cargo[k] = packParcels(st.cargo[k]);
    return { ...st, cargo };
  });
}

function unpackStations(stations) {
  if (!Array.isArray(stations)) return stations;
  for (const st of stations) {
    if (!st || !st.cargo || typeof st.cargo !== 'object') continue;
    for (const k of Object.keys(st.cargo)) {
      const v = st.cargo[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && (v.fmt === 'parcels-v1' || v.fmt === 'parcels-v2' || v.fmt === 'parcels-v3')) st.cargo[k] = unpackParcels(v);
    }
  }
  return stations;
}

function unpackTraffic(tr) {
  const up = (a) => (isPackedRuns(a) ? unpackRuns(a) : a);
  if (tr.cars && tr.cars.fmt === 'cars-col-v1') tr.cars = unpackCars(tr.cars);
  if (tr.load !== undefined) tr.load = up(tr.load);
  if (tr.jam !== undefined) tr.jam = up(tr.jam);
  if (tr.acc) { tr.acc.samples = up(tr.acc.samples); tr.acc.blocked = up(tr.acc.blocked); }
  return tr;
}

function* packCarsSteps(cars) {
  if (!Array.isArray(cars) || cars.length === 0) return cars;
  for (const c of cars) {
    const keys = Object.keys(c).filter((k) => k[0] !== '_');
    if (keys.length !== CAR_KEYS.length || keys.some((k, j) => k !== CAR_KEYS[j])) return cars;
    if (!Array.isArray(c.path) || !c.path.every((v) => Number.isSafeInteger(v) && v >= 0)) return cars;
    if (CAR_INT_KEYS.some((k) => !Number.isInteger(c[k])) || typeof c.t !== 'number' || typeof c.speed !== 'number'
      || typeof c.kind !== 'string') return cars;
  }
  const kinds = [], kindIdx = new Map();
  const col = { fmt: 'cars-col-v1', n: cars.length, plen: [], path: null };
  for (const k of ['id', 'townId', 'i', 't', 'speed', 'wait', 'born', 'color']) col[k] = [];
  col.kind = [];
  let total = 0;
  for (const c of cars) total += c.path.length;
  const bytes = [];
  let ci = 0;
  for (const c of cars) {
    if (++ci % CAR_CHUNK === 0) yield;
    for (const k of ['id', 'townId', 'i', 't', 'speed', 'wait', 'born', 'color']) col[k].push(c[k]);
    let ki = kindIdx.get(c.kind);
    if (ki === undefined) { ki = kinds.length; kinds.push(c.kind); kindIdx.set(c.kind, ki); }
    col.kind.push(ki);
    col.plen.push(c.path.length);
    // path: first tile absolute, then zigzag varint deltas (neighbouring tiles are close indices)
    let prev = 0;
    for (const v of c.path) { putVarint(bytes, zigzag(v - prev)); prev = v; }
  }
  col.kinds = kinds;
  yield;
  col.path = bytesToB64(Uint8Array.from(bytes));
  yield;
  return col;
}

function* packTrafficSteps(tr) {
  const pk = (a) => (Array.isArray(a) ? (packRuns(a) ?? packScaled(a) ?? a) : a);
  const load = pk(tr.load);
  yield;
  const jam = pk(tr.jam);
  yield;
  const cars = yield* packCarsSteps(tr.cars);
  yield;
  const out = { ...tr, load, jam, cars };
  if (tr.acc) {
    const samples = pk(tr.acc.samples);
    yield;
    out.acc = { ...tr.acc, samples, blocked: pk(tr.acc.blocked) };
  }
  return out;
}

/**
 * Classic saves are JSON.stringify(state), but traffic cars carry per-tick scratch fields (`_key`, `_ahead`)
 * that the next tick rebuilds. Drop them exactly as packCarsSteps does (any `_`-prefixed key), so the save
 * does not embed the `_ahead` car copies; nothing else is touched.
 */
function stripCarScratch(state) {
  const tr = state.traffic;
  const cars = tr && tr.cars;
  if (!Array.isArray(cars) || cars.length === 0) return state;
  let scratch = false;
  for (const c of cars) {
    if (!c || typeof c !== 'object') continue;
    for (const k of Object.keys(c)) if (k[0] === '_') { scratch = true; break; }
    if (scratch) break;
  }
  if (!scratch) return state;
  const out = new Array(cars.length);
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (!c || typeof c !== 'object') { out[i] = c; continue; }
    const o = {};
    for (const k of Object.keys(c)) if (k[0] !== '_') o[k] = c[k];
    out[i] = o;
  }
  return { ...state, traffic: { ...tr, cars: out } };
}

/**
 * The one serialisation implementation. A generator: `yield` marks a point where the caller may pause
 * (serializeState runs it to the end; serializeStateAsync pauses on its time budget). Output fragments are
 * written to `sink` in order; their concatenation is the result (for classic saves: JSON.stringify(state)).
 * @param {object} state
 * @param {Sink} sink
 * @returns {Generator<void, void, void>}
 */
export function* serializeStateSteps(state, sink) {
  if (!state.scenario) { sink.write(JSON.stringify(stripCarScratch(state))); return; }
  const tiles = Array.isArray(state.map.tiles) ? yield* packTilesSteps(state.map.tiles) : state.map.tiles;
  const tr = state.traffic ? yield* packTrafficSteps(state.traffic) : state.traffic;
  yield;
  const stations = packStations(state.stations);
  const top = { ...state, map: { ...state.map, tiles }, traffic: tr, stations };
  // Same bytes as JSON.stringify(top): one entry per own key, undefined/function/symbol values omitted.
  // Written key by key so the work can be sliced between keys.
  let first = true;
  sink.write('{');
  for (const k of Object.keys(top)) {
    const v = top[k];
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue;
    sink.write((first ? '' : ',') + JSON.stringify(k) + ':');
    first = false;
    yield* stringifySteps(v, sink);
  }
  sink.write('}');
}

const ELEM_CHUNK = 256;
const STR_CHUNK = 64 * 1024;
/**
 * JSON.stringify(v) written to sink as a generator: large arrays (the packed tile signatures, car columns)
 * are written in element chunks with a yield between them. Byte-identical to JSON.stringify (same rules for
 * undefined/function/symbol values in arrays and objects; objects with toJSON are left to JSON.stringify).
 */
function* stringifySteps(v, sink) {
  if (typeof v === 'string' && v.length > STR_CHUNK) {
    // long packed (base64) strings: JSON-escape in pieces (base64 never needs escaping, so this is exact)
    sink.write('"');
    for (let i = 0; i < v.length; i += STR_CHUNK) {
      const piece = v.slice(i, i + STR_CHUNK);
      sink.write(JSON.stringify(piece).slice(1, -1));
      yield;
    }
    sink.write('"');
    return;
  }
  if (v === null || typeof v !== 'object' || typeof v.toJSON === 'function') { sink.write(JSON.stringify(v)); return; }
  if (Array.isArray(v)) {
    if (v.length <= ELEM_CHUNK) { sink.write(JSON.stringify(v)); return; }
    sink.write('[');
    for (let i = 0; i < v.length; i++) {
      if (i) sink.write(',');
      if (i && i % ELEM_CHUNK === 0) yield;
      const e = v[i];
      if (e === undefined || typeof e === 'function' || typeof e === 'symbol') sink.write('null');
      else yield* stringifySteps(e, sink);
    }
    sink.write(']');
    return;
  }
  // plain object: recurse key by key so a big array nested anywhere below is chunked
  sink.write('{');
  let first = true;
  for (const k of Object.keys(v)) {
    const e = v[k];
    if (e === undefined || typeof e === 'function' || typeof e === 'symbol') continue;
    sink.write((first ? '' : ',') + JSON.stringify(k) + ':');
    first = false;
    yield* stringifySteps(e, sink);
  }
  sink.write('}');
}

/** Tiles -> { format, n, sigs: distinct tile JSON strings, runs: RLE of sig indices }. */
function* packTilesSteps(tiles) {
  const ids = new Map(), sigs = [], idx = new Array(tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    if (i && (i % TILE_CHUNK) === 0) yield;
    const s = JSON.stringify(tiles[i]); // exact by construction, so any tile shape round-trips
    let k = ids.get(s);
    if (k === undefined) { k = sigs.length; sigs.push(s); ids.set(s, k); }
    idx[i] = k;
  }
  yield;
  const runs = packRuns(idx);
  yield;
  return { format: 'tiles-rle-v1', n: tiles.length, sigs, runs };
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
  if (state && Array.isArray(state.stations)) unpackStations(state.stations);
  if (!state || typeof state !== 'object' || !state.map || !Array.isArray(state.map.tiles)) {
    throw new Error('Invalid save data');
  }
  if (state.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${state.version}`);
  const rev = state.revision || 0;
  if (!Number.isInteger(rev) || rev < 0) throw new Error(`Invalid save revision ${state.revision}`);
  if (rev > SAVE_REVISION) {
    throw new Error(`This save was made by a newer version of the game (revision ${rev}, this build reads up to ${SAVE_REVISION})`);
  }
  for (let r = rev; r < SAVE_REVISION; r++) MIGRATIONS[r](state);
  if (SAVE_REVISION) state.revision = SAVE_REVISION;
  return migrate(state);
}

/**
 * Save revision (OpenTTD SaveLoadVersion, simplified): bump SAVE_REVISION when a change needs an explicit
 * conversion of old saves, and append the step to MIGRATIONS (MIGRATIONS[r] upgrades revision r to r + 1).
 * Revision 0 is written as no field at all (lazy), so saves and hashes of existing games stay unchanged.
 * Additive lazy fields need no step: `migrate` below fills their defaults for every save.
 * A save with a higher revision than this build is refused with a clear message instead of loading wrongly.
 */
export const SAVE_REVISION = 0;
/** @type {Array<(state: object) => void>} */
export const MIGRATIONS = [];

/** Fill fields added after a save was written (keeps old saves of the same version loadable). */
function migrate(state) {
  state.news ??= [];
  state.depots ??= [];
  state.company.negativeMonths ??= 0;
  const n = state.map.width * state.map.height;
  if (state.scenario === 'moscow' && !Array.isArray(state.map.lm3dOverlays)) { // draw Moscow monuments added after this save was written
    if (!moscowLoaded()) throw new Error('Moscow data not loaded: await loadMoscowData() before loading this save');
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
  // curveLimit is NO_LIMIT (Infinity) on a straight path (loco/trainRealistic.js); JSON.stringify
  // writes Infinity as null, so restore it here instead of leaving null for numeric readers.
  if (Array.isArray(state.vehicles)) {
    for (const v of state.vehicles) if (v.curveLimit === null) v.curveLimit = Infinity;
  }
  return state;
}
