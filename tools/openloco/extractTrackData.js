// Generates js/openloco/trackData.js from OpenLoco's track data tables.
// (MIT, https://github.com/OpenLoco/OpenLoco — see js/openloco/README.md)
// Run: bun tools/openloco/extractTrackData.js [--print]
// The script fails loudly (non-zero exit) if any table does not parse to the
// expected number of entries, so a silent partial port cannot ship.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = '/home/abhi/project/city_sim/scratchpad/openloco/src/OpenLoco/src/Map/Track/TrackData.cpp';
const OUT = join(root, 'js/openloco/trackData.js');
const src = readFileSync(SRC, 'utf8');

function block(re, label) {
  const m = src.match(re);
  if (!m) throw new Error('block not found: ' + label);
  return m[1];
}

function expect(label, actual, wanted) {
  if (actual !== wanted) throw new Error(`${label}: expected ${wanted} entries, parsed ${actual}`);
}

/** rotl8 — matches std::rotl on uint8_t. */
const rotl8 = (v, n) => ((v << n) | (v >> (8 - n))) & 0xff;
const genConn = (v) => [rotl8(v, 0), rotl8(v, 2), rotl8(v, 4), rotl8(v, 6)];

const PREVIEW_FLAG_BITS = { unk0: 1, unk1: 2, unk2: 4, unk3: 8, unk4: 16, unused: 64, diagonal: 128 };
const COMMON_FLAG_BITS = {
  slope: 1 << 0, steepSlope: 1 << 1, curveSlope: 1 << 2, diagonal: 1 << 3, verySmallCurve: 1 << 4,
  smallCurve: 1 << 5, curve: 1 << 6, largeCurve: 1 << 7, sBendCurve: 1 << 8, oneSided: 1 << 9, junction: 1 << 11,
};
const TRACK_FLAG_BITS = {
  diagonal: 1 << 0, largeCurve: 1 << 1, normalCurve: 1 << 2, smallCurve: 1 << 3, verySmallCurve: 1 << 4,
  slope: 1 << 5, steepSlope: 1 << 6, oneSided: 1 << 7, slopedCurve: 1 << 8, sBend: 1 << 9, junction: 1 << 10,
};
const ROAD_FLAG_BITS = {
  smallCurve: 1 << 0, verySmallCurve: 1 << 1, slope: 1 << 2, steepSlope: 1 << 3, unk4: 1 << 4, turnaround: 1 << 5, junction: 1 << 6,
};

function parseFlags(expr, bits, label) {
  const parts = expr.split('|').map((s) => s.trim());
  let flags = 0;
  for (const p of parts) {
    const m = p.match(/^\w+::(\w+)$/);
    if (!m) throw new Error(`${label}: bad flag expression: ${p}`);
    if (m[1] === 'none') continue;
    if (!(m[1] in bits)) throw new Error(`${label}: unknown flag ${p}`);
    flags |= bits[m[1]];
  }
  return flags;
}

// ---- PreviewTrack pieces ------------------------------------------------
function parsePieces(kind) {
  const re = new RegExp(`const std::array<PreviewTrack, (\\d+)> (${kind}\\d+) = \\{([\\s\\S]*?)\\};`, 'g');
  const pieces = {};
  for (const m of src.matchAll(re)) {
    const declared = +m[1], name = m[2], body = m[3];
    const tiles = [];
    const tileRe = /PreviewTrack\{\s*(\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*QuarterTile\{\s*(0b[01]+|\d+),\s*(0b[01]+|\d+)\s*\},\s*([^,]+(?:\|\s*[^,]+)*),\s*generateConnections\(\s*(0x[0-9A-Fa-f]+)\s*\)\s*\}/g;
    for (const t of body.matchAll(tileRe)) {
      const num = (s) => (s.startsWith('0b') ? parseInt(s.slice(2), 2) : +s);
      tiles.push({
        index: +t[1], x: +t[2], y: +t[3], z: +t[4], clearZ: +t[5],
        quarterTile: num(t[6]) | (num(t[7]) << 4),
        flags: parseFlags(t[8], PREVIEW_FLAG_BITS, `${name} tile ${t[1]}`),
        connectFlags: genConn(parseInt(t[9], 16)),
      });
    }
    expect(name, tiles.length, declared);
    pieces[name] = tiles;
  }
  return pieces;
}

function parsePieceOrder(kind, count) {
  const re = new RegExp(`std::array<std::span<const PreviewTrack>, \\d+> ${kind}Pieces = \\{ \\{([\\s\\S]*?)\\} \\};`);
  const body = block(re, kind + 'Pieces');
  const order = [...body.matchAll(new RegExp(`(${kind}Piece\\d+)`, 'g'))].map((m) => m[1]);
  expect(kind + 'Pieces', order.length, count);
  return order;
}

const trackPiecesByName = parsePieces('trackPiece');
const roadPiecesByName = parsePieces('roadPiece');
const TRACK_PIECES = parsePieceOrder('track', 44).map((n) => trackPiecesByName[n]);
const ROAD_PIECES = parsePieceOrder('road', 10).map((n) => roadPiecesByName[n]);

// ---- TrackCoordinates (getUnkTrack / getUnkRoad) ------------------------
function parseCoordinates(name, count) {
  const body = block(new RegExp(`std::array<TrackCoordinates, \\d+> ${name} = \\{ \\{([\\s\\S]*?)\\} \\};`), name);
  const out = [];
  for (const m of body.matchAll(/\{\s*(\d+),\s*(\d+),\s*\{\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\}\s*\}/g)) {
    out.push({ rotationBegin: +m[1], rotationEnd: +m[2], pos: [+m[3], +m[4], +m[5]] });
  }
  expect(name, out.length, count);
  return out;
}
const ROAD_COORDINATES = parseCoordinates('kRoadCoordinates', 80);
const TRACK_COORDINATES = parseCoordinates('kTrackCoordinates', 352);

// ---- Misc data -----------------------------------------------------------
function parseMiscData(type, name, count, flagBits, extra) {
  const re = new RegExp(`std::array<${type}, \\d+> ${name} = \\{([\\s\\S]*?)\\n    \\};`);
  const body = block(re, name);
  const entries = [];
  for (const m of body.matchAll(new RegExp(type + '\\{([\\s\\S]*?)\\},', 'g'))) {
    const fields = {};
    for (const f of m[1].matchAll(/\.(\w+)\s*=\s*([^,}]+?)\s*(?:[,}]|$)/g)) fields[f[1]] = f[2].trim();
    const num = (v) => (v.startsWith('0x') ? parseInt(v, 16) : +v);
    const entry = {
      costFactor: num(fields.costFactor),
      flags: parseFlags(fields.flags, COMMON_FLAG_BITS, name),
      curveSpeedFraction: num(fields.curveSpeedFraction),
      unkWeighting: num(fields.unkWeighting),
    };
    if (fields.reverseTrackId !== undefined) {
      entry.reverseTrackId = num(fields.reverseTrackId);
      entry.reverseRotation = num(fields.reverseRotation);
      entry.signalHeightOffsetLeft = num(fields.signalHeightOffsetLeft);
      entry.signalHeightOffsetRight = num(fields.signalHeightOffsetRight);
      entry.compatibleFlags = parseFlags(fields.compatibleFlags, TRACK_FLAG_BITS, name);
      entry.sparkDirection = fields.sparkDirection === 'true';
    } else {
      entry.reverseRoadId = num(fields.reverseRoadId);
      entry.reverseRotation = num(fields.reverseRotation);
      entry.reverseLane = num(fields.reverseLane);
      entry.compatibleFlags = parseFlags(fields.compatibleFlags, ROAD_FLAG_BITS, name);
    }
    entries.push(entry);
  }
  expect(name, entries.length, count);
  return entries;
}
const TRACK_MISC_DATA = parseMiscData('TrackMiscData', '_miscData', 44, COMMON_FLAG_BITS);
const ROAD_MISC_DATA = parseMiscData('RoadMiscData', '_roadMiscData', 10, COMMON_FLAG_BITS);

// ---- RoadUnkNextTo tables -------------------------------------------------
function parseUnkNextTo() {
  const tables = {};
  const re = /std::array<RoadUnkNextTo, \d+> (\w+) = \{([\s\S]*?)\};/g;
  for (const m of src.matchAll(re)) {
    const body = m[2];
    const entries = [];
    for (const t of body.matchAll(/RoadUnkNextTo\{\s*\.pos = \{\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\},\s*\.rotation = (\d+),?\s*\},/g)) {
      entries.push({ pos: [+t[1], +t[2], +t[3]], rotation: +t[4] });
    }
    if (!entries.length) throw new Error(`${m[1]}: no entries parsed`);
    tables[m[1]] = entries;
  }
  const aliases = {};
  for (const m of src.matchAll(/std::array<RoadUnkNextTo, \d+> (\w+) = (\w+);/g)) aliases[m[1]] = m[2];
  const spanBody = block(/std::array<std::span<const RoadUnkNextTo>, \d+> kRoadUnkNextTo = \{([\s\S]*?)\};/, 'kRoadUnkNextTo');
  const order = [...spanBody.matchAll(/(\w+)/g)].map((m) => m[1]).filter((n) => n.endsWith('UnkNextTo'));
  expect('kRoadUnkNextTo', order.length, 20);
  return order.map((n) => {
    const resolved = aliases[n] ?? n;
    if (!tables[resolved]) throw new Error(`kRoadUnkNextTo references missing table ${n}`);
    return tables[resolved];
  });
}
const ROAD_UNK_NEXT_TO = parseUnkNextTo();

// ---- Flat byte/int tables --------------------------------------------------
function parseByteTable(name, count) {
  const body = block(new RegExp(`std::array<uint8_t, \\d+> ${name} = \\{ \\{([\\s\\S]*?)\\} \\};`), name);
  const vals = [...body.matchAll(/0x[0-9A-Fa-f]{2}/g)].map((m) => parseInt(m[0], 16));
  expect(name, vals.length, count);
  return vals;
}
function parseIntTable(name, count) {
  const body = block(new RegExp(`std::array<int8_t, \\d+> ${name} = \\{ \\{([\\s\\S]*?)\\} \\};`), name);
  const vals = [...body.matchAll(/^\s*(-?\d+),/gm)].map((m) => +m[1]);
  expect(name, vals.length, count);
  return vals;
}
const ROAD_OCCUPATION_MASKS = parseByteTable('kRoadOccupationMasks', 128);
const CURVATURE_DEGREES = parseIntTable('kCurvatureDegrees', 88);

// ---- Emit -------------------------------------------------------------------
const J = (v) => JSON.stringify(v);
const header = `/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Generated by tools/openloco/extractTrackData.js from src/Map/Track/TrackData.cpp — DO NOT EDIT BY HAND.
 * Source data © OpenLoco contributors (research-reversed from Locomotion; no original game assets are included).
 * Regenerate: bun tools/openloco/extractTrackData.js
 */
`;
const out = `${header}
/** World units per tile edge (Locomotion geometry uses 32; heights use 16 per half level). */
export const WORLD_UNITS_PER_TILE = 32;

/** PreviewTrack flags used by the tables below. */
export const PREVIEW_TRACK_FLAGS = /* @__PURE__ */ Object.freeze({ none: 0, unk0: 1, unk1: 2, unk2: 4, unk3: 8, unk4: 16, unused: 64, diagonal: 128 });

/** CommonTraitFlags (Track/Road misc data .flags). */
export const COMMON_TRAIT_FLAGS = /* @__PURE__ */ Object.freeze(${J(COMMON_FLAG_BITS)});

/** TrackTraitFlags (Track misc data .compatibleFlags). */
export const TRACK_TRAIT_FLAGS = /* @__PURE__ */ Object.freeze(${J(TRACK_FLAG_BITS)});

/** RoadTraitFlags (Road misc data .compatibleFlags). */
export const ROAD_TRAIT_FLAGS = /* @__PURE__ */ Object.freeze(${J(ROAD_FLAG_BITS)});

/**
 * PreviewTrack tables, indexed by piece id (TRACK_PIECES[trackId], ROAD_PIECES[roadId]).
 * quarterTile is the raw QuarterTile byte (low nibble = tile quarters, high nibble = z quarters);
 * connectFlags[rotation] is the connection mask for that rotation (see generateConnections in the source).
 */
export const TRACK_PIECES = /* @__PURE__ */ Object.freeze(${J(TRACK_PIECES)});

export const ROAD_PIECES = /* @__PURE__ */ Object.freeze(${J(ROAD_PIECES)});

/** TrackCoordinates for trackAndDirection (index = trackId << 3 | rotation | (reversed << 2)). */
export const TRACK_COORDINATES = /* @__PURE__ */ Object.freeze(${J(TRACK_COORDINATES)});

/** TrackCoordinates for road trackAndDirection (index = roadId << 3 | rotation | (reversed << 2)). */
export const ROAD_COORDINATES = /* @__PURE__ */ Object.freeze(${J(ROAD_COORDINATES)});

/** TrackMiscData per track id. */
export const TRACK_MISC_DATA = /* @__PURE__ */ Object.freeze(${J(TRACK_MISC_DATA)});

/** RoadMiscData per road id. */
export const ROAD_MISC_DATA = /* @__PURE__ */ Object.freeze(${J(ROAD_MISC_DATA)});

/** RoadUnkNextTo tables indexed by trackAndDirection / 4 (lane section lookup used by the road AI). */
export const ROAD_UNK_NEXT_TO = /* @__PURE__ */ Object.freeze(${J(ROAD_UNK_NEXT_TO)});

/** Lane occupation mask lookup; upper nibble holds the 2-bit lane occupation mask. */
export const ROAD_OCCUPATION_MASKS = /* @__PURE__ */ Object.freeze(${J(ROAD_OCCUPATION_MASKS)});

/** Curvature degree per (trackId << 1 | reversed); see getCurvatureDegree. */
export const CURVATURE_DEGREES = /* @__PURE__ */ Object.freeze(${J(CURVATURE_DEGREES)});

function lookup(table, index, name, what) {
  if (!Number.isInteger(index) || index < 0 || index >= table.length) {
    throw new RangeError(\`\${name}: \${what} out of range (got \${index}, max \${table.length - 1})\`);
  }
  return table[index];
}

/** @param {number} trackId @returns {ReadonlyArray<object>} tiles the track piece occupies. */
export function getTrackPiece(trackId) { return lookup(TRACK_PIECES, trackId, 'getTrackPiece', 'trackId'); }
/** @param {number} roadId @returns {ReadonlyArray<object>} tiles the road piece occupies. */
export function getRoadPiece(roadId) { return lookup(ROAD_PIECES, roadId, 'getRoadPiece', 'roadId'); }
/** @param {number} trackAndDirection @returns {{rotationBegin:number, rotationEnd:number, pos:[number,number,number]}} */
export function getUnkTrack(trackAndDirection) { return lookup(TRACK_COORDINATES, trackAndDirection, 'getUnkTrack', 'trackAndDirection'); }
/** @param {number} trackAndDirection @returns {{rotationBegin:number, rotationEnd:number, pos:[number,number,number]}} */
export function getUnkRoad(trackAndDirection) { return lookup(ROAD_COORDINATES, trackAndDirection, 'getUnkRoad', 'trackAndDirection'); }
/** @param {number} trackId */
export function getTrackMiscData(trackId) { return lookup(TRACK_MISC_DATA, trackId, 'getTrackMiscData', 'trackId'); }
/** @param {number} roadId */
export function getRoadMiscData(roadId) { return lookup(ROAD_MISC_DATA, roadId, 'getRoadMiscData', 'roadId'); }
/** @param {number} trackAndDirection */
export function getRoadUnkNextTo(trackAndDirection) {
  return lookup(ROAD_UNK_NEXT_TO, Math.floor(trackAndDirection / 4), 'getRoadUnkNextTo', 'trackAndDirection / 4');
}
/** @param {number} index */
export function getRoadOccupationMask(index) { return lookup(ROAD_OCCUPATION_MASKS, index, 'getRoadOccupationMask', 'index'); }
/** @param {number} index */
export function getCurvatureDegree(index) { return lookup(CURVATURE_DEGREES, index, 'getCurvatureDegree', 'index'); }
`;
writeFileSync(OUT, out);
console.log('wrote', OUT);
if (process.argv.includes('--print')) {
  console.log('TRACK_PIECES', TRACK_PIECES.length, 'ROAD_PIECES', ROAD_PIECES.length,
    'TRACK_COORDS', TRACK_COORDINATES.length, 'ROAD_COORDS', ROAD_COORDINATES.length,
    'TRACK_MISC', TRACK_MISC_DATA.length, 'ROAD_MISC', ROAD_MISC_DATA.length,
    'UNK_NEXT_TO', ROAD_UNK_NEXT_TO.length, 'OCC_MASKS', ROAD_OCCUPATION_MASKS.length,
    'CURVATURE', CURVATURE_DEGREES.length);
}
