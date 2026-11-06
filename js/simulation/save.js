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
  const stations = packStations(state.stations);
  return JSON.stringify({ ...state, map: { ...state.map, tiles }, traffic: tr, stations });
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

/** Car keys in creation order (see traffic.js spawnCars). */
const CAR_KEYS = ['id', 'townId', 'path', 'i', 't', 'speed', 'wait', 'born', 'kind', 'color'];
const CAR_INT_KEYS = ['id', 'townId', 'i', 'wait', 'born', 'color'];

/**
 * Columnar cars: one array per field (no per-car key names), paths concatenated as Int32 base64.
 * Derived scratch fields (keys starting with `_`, rebuilt by every traffic tick) are dropped.
 * Falls back to the plain array when any car does not have the expected shape.
 */
function packCars(cars) {
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
  for (const c of cars) {
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
  col.path = bytesToB64(Uint8Array.from(bytes));
  return col;
}

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

function packTraffic(tr) {
  const pk = (a) => (Array.isArray(a) ? (packRuns(a) ?? a) : a);
  const out = { ...tr, load: pk(tr.load), jam: pk(tr.jam), cars: packCars(tr.cars) };
  if (tr.acc) out.acc = { ...tr.acc, samples: pk(tr.acc.samples), blocked: pk(tr.acc.blocked) };
  return out;
}

/** Station cargo parcels {amount,sourceX,sourceY,sinceTick} -> columns (int fields, zigzag deltas). */
const PARCEL_KEYS = ['amount', 'sourceX', 'sourceY', 'sinceTick'];
function packParcels(list) {
  if (!Array.isArray(list) || list.length === 0) return list;
  for (const p of list) {
    const keys = Object.keys(p);
    if (keys.length !== 4 || PARCEL_KEYS.some((k) => !Number.isSafeInteger(p[k]))) return list;
  }
  const bytes = [];
  const cols = PARCEL_KEYS.map(() => 0);
  for (const p of list) {
    for (let j = 0; j < 4; j++) { const v = p[PARCEL_KEYS[j]]; putVarint(bytes, zigzag(v - cols[j])); cols[j] = v; }
  }
  return { fmt: 'parcels-v1', n: list.length, d: bytesToB64(Uint8Array.from(bytes)) };
}

function unpackParcels(p) {
  const buf = b64ToBytes(p.d), cols = [0, 0, 0, 0], out = new Array(p.n);
  let q = 0;
  const getVarint = () => {
    let v = 0, mul = 1, b;
    do { b = buf[q++]; v += (b & 127) * mul; mul *= 128; } while (b & 128);
    return v;
  };
  for (let i = 0; i < p.n; i++) {
    const o = {};
    for (let j = 0; j < 4; j++) { cols[j] += unzigzag(getVarint()); o[PARCEL_KEYS[j]] = cols[j]; }
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
      if (v && typeof v === 'object' && !Array.isArray(v) && v.fmt === 'parcels-v1') st.cargo[k] = unpackParcels(v);
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
