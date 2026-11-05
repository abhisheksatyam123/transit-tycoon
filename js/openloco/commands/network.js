/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/Vehicles/Routing.cpp (LocationOfInterest(+HashSet), findAllUsableTrackInNetwork, findAllUsableRoadInNetwork,
 *         findAllTracksFilterTransform, findAllRoadsFilterTransform with searchFlags = none, applyTrackModToTrack,
 *         removeTrackModToTrack, applyRoadModToRoad, removeRoadModToTrack, apply/removeTrack|RoadModsToTrackNetwork).
 * The visited hash set becomes a JS Set with the same capacity rule (4096 slots, 100 kept free => 3996 entries);
 * the iteration order (stack, LIFO) is identical. Deviation: the C++ element search leaves `elTrack` pointing at the last
 * visited (non-matching) track when nothing matches; here an unmatched piece ends the walk of that sequence (null).
 * Road mods use 2 bits only (C++ clears 4 bits in removeRoadMod, harmless there).
 */
import { getTrackPiece, getRoadPiece, getUnkTrack, getUnkRoad, getTrackMiscData, getRoadMiscData } from '../trackData.js';
import { AdditionalTaDFlags, ModSection } from '../trackEnum.js';
import { getTrackConnectionEnd, getRoadConnectionEnd } from '../connection.js';
import { getTrackConnections, getRoadConnections } from '../map/track.js';
import { ROTATION_OFFSET } from '../trackEnum.js';
import { REVERSE_ROTATION, rotatePos2 } from '../map/world.js';
import { Flags, hasFlags, getInflationAdjustedCost, scaleByPieceCost } from './gameCommands.js';
import { getObject } from './objects.js';
import { findTrackPiece, findRoadPiece, bit } from './common.js';

export const MOD_HASHSET_SIZE = 0x1000;
const MAX_ENTRIES = MOD_HASHSET_SIZE - 100;
const keyOf = (i) => `${i.loc.x},${i.loc.y},${i.loc.z},${i.tad},${i.company},${i.type}`;

/** Position of the far end of a piece (loc + coordinates.pos - rotationOffset[rotationEnd] when < 12). */
function endLoc(loc, size) {
  let l = { x: loc.x + size.pos[0], y: loc.y + size.pos[1], z: loc.z + size.pos[2] };
  if (size.rotationEnd < 12) { const o = ROTATION_OFFSET[size.rotationEnd]; l = { x: l.x - o.x, y: l.y, z: l.z }; l.y -= o.y; }
  return l;
}
export { endLoc };

function search(start, company, type, isRoad, filter) {
  const results = { reachable: new Set(), count: 0, hasDeadEnd: false };
  const tryAdd = (i) => {
    const k = keyOf(i);
    if (results.reachable.has(k)) return false;
    if (results.count >= MAX_ENTRIES) return false;
    results.reachable.add(k); results.count++; return true;
  };
  const getCoord = isRoad ? getUnkRoad : getUnkTrack;
  const conn = (loc, rot) => (isRoad ? getRoadConnections(startTm, loc, rot, company, type, 0, 0) : getTrackConnections(startTm, loc, rot, company, type, 0, 0));
  const mask = isRoad ? AdditionalTaDFlags.basicRaDWithSignalMask : AdditionalTaDFlags.basicTaDWithSignalMask;
  const queue = [{ loc: start.loc, tad: start.tad, company, type }];
  const startTm = start.tm;
  while (queue.length) {
    const initial = queue.pop();
    const endPos = isRoad ? getRoadConnectionEnd(initial.loc, initial.tad) : getTrackConnectionEnd(initial.loc, initial.tad);
    const tc = conn(endPos.nextPos, endPos.nextRotation);
    if (tc.connections.length) {
      for (const c of tc.connections) {
        const i = { loc: endPos.nextPos, tad: c & mask, company: initial.company, type: initial.type };
        if (tryAdd(i) && !filter(i)) queue.push(i);
      }
    } else results.hasDeadEnd = true;
    const size = getCoord(initial.tad);
    const nextLoc = endLoc(initial.loc, size);
    const tc2 = conn(nextLoc, REVERSE_ROTATION[size.rotationEnd]);
    for (const c of tc2.connections) {
      const i = { loc: nextLoc, tad: c & mask, company: initial.company, type: initial.type };
      if (tryAdd(i) && !filter(i)) queue.push(i);
    }
  }
  return { ...results, tryAdd };
}

/** Add the reversed direction of `interest` to the visited set so each piece is visited once. */
function addReverse(results, interest, isRoad) {
  const size = (isRoad ? getUnkRoad : getUnkTrack)(interest.tad);
  results.tryAdd({ ...interest, loc: endLoc(interest.loc, size), tad: interest.tad ^ 4 });
}

/** Piece start of an interest (moves to the far end when the direction is reversed). */
function startOf(interest, isRoad) {
  return (interest.tad & 4) ? endLoc(interest.loc, (isRoad ? getUnkRoad : getUnkTrack)(interest.tad)) : interest.loc;
}

/**
 * Shared per-piece mod worker. `apply` true = create; false = remove.
 * @returns {boolean} filter result (true = stop walking: block section boundary with a signal)
 */
function modPiece(ctx, interest, flags, results, modSection, objType, modIds, acc, apply, isRoad) {
  const tm = ctx.tm;
  if (results) addReverse(results, interest, isRoad);
  const nMods = isRoad ? 2 : 4;
  const baseObj = getObject(ctx, isRoad ? 'road' : 'track', objType);
  const table = isRoad ? 'roadExtra' : 'trackExtra';
  const id = interest.tad >> 3 & (isRoad ? 0xf : 0x3f);
  const rotation = interest.tad & 3;
  const misc = isRoad ? getRoadMiscData(id) : getTrackMiscData(id);
  let placementFailure = false;
  if (apply) {
    for (let i = 0; i < nMods; i++) {
      if (!(modIds & bit(i))) continue;
      const extra = getObject(ctx, table, baseObj.mods[i]);
      const pieces = isRoad ? extra.roadPieces : extra.trackPieces;
      if ((pieces & misc.compatibleFlags) !== misc.compatibleFlags) { placementFailure = true; break; }
    }
  }
  if (!placementFailure) {
    const start = startOf(interest, isRoad);
    for (const piece of (isRoad ? getRoadPiece(id) : getTrackPiece(id))) {
      const r = rotatePos2({ x: piece.x, y: piece.y }, rotation);
      const loc = { x: start.x + r.x, y: start.y + r.y, z: start.z + piece.z };
      const el = isRoad ? findRoadPiece(tm, loc, rotation, piece.index, objType, id) : findTrackPiece(tm, loc, rotation, piece.index, objType, id);
      if (!el) break;
      if (piece.index === 0) {
        if (apply) acc.allPlacementsFailed = false;
        for (let i = 0; i < nMods; i++) {
          if (!(modIds & bit(i))) continue;
          if (apply === !!(el.mods() & bit(i))) continue; // create: skip present; remove: skip absent
          const extra = getObject(ctx, table, baseObj.mods[i]);
          const f = apply ? extra.buildCostFactor : extra.sellCostFactor;
          acc.cost += scaleByPieceCost(getInflationAdjustedCost(ctx, f, extra.costIndex, 10), misc.costFactor);
        }
      }
      if (hasFlags(flags, Flags.apply)) {
        if (hasFlags(flags, Flags.ghost)) {
          if (ctx.controllingCompanyId === interest.company) el.setHasGhostMods(apply);
        } else {
          for (let i = 0; i < nMods; i++) if (modIds & bit(i)) el.setMod(i, apply);
        }
      }
    }
  }
  return modSection === ModSection.block ? !!(interest.tad & AdditionalTaDFlags.hasSignal) : false;
}

/**
 * applyTrackModsToTrackNetwork / applyRoadModsToTrackNetwork / remove...: modifies the pieces of the network section.
 * @returns {{cost:number, allPlacementsFailed:boolean, networkTooComplex:boolean}}
 */
export function modsToNetwork(ctx, { pos, tad, company, objType, flags, modSection, modIds, apply, isRoad }) {
  const acc = { cost: 0, allPlacementsFailed: true };
  const interest = { loc: pos, tad, company, type: objType };
  if (modSection === ModSection.single) {
    modPiece(ctx, interest, flags, null, modSection, objType, modIds, acc, apply, isRoad);
    return { ...acc, networkTooComplex: false };
  }
  let res;
  const filter = (i) => modPiece(ctx, i, flags, res, modSection, objType, modIds, acc, apply, isRoad);
  res = search({ loc: pos, tad, tm: ctx.tm }, company, objType, isRoad, filter);
  return { ...acc, networkTooComplex: res.count >= MAX_ENTRIES };
}
