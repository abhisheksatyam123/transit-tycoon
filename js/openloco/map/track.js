/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/Map/Track/Track.cpp, include/OpenLoco/Map/Track/Track.h
 * (getTrackConnections[Ai], getRoadConnections[OneWay|AiAllocated], validateTrackIsSignalCompatible).
 * getTrackConnectionEnd / getRoadConnectionEnd live in ../connection.js and are re-exported here.
 * GameState bitmasks come from `tm.gameState`; RoadObject::isOneWay is the injected `isOneWayRoad(objId)`.
 */
import { getTrackPiece, getRoadPiece, getUnkTrack, getUnkRoad } from '../trackData.js';
import { AdditionalTaDFlags, NULL_TAD } from '../trackEnum.js';
import { getTrackConnectionEnd, getRoadConnectionEnd } from '../connection.js';
import { TrackElement, RoadElement, SignalElement, StationElement, STATION_NULL } from './transportElements.js';
import { rotatePos2 } from './world.js';

export { getTrackConnectionEnd, getRoadConnectionEnd, NULL_TAD };

/** @typedef {{connections:number[], hasLevelCrossing:boolean, stationId:number}} TrackConnections  stationId STATION_NULL when none */
/** @typedef {{connections:number[], stationId:number, stationObjectId:number, roadObjectId:number}} RoadConnections  roadObjectId 0xff when none */

const u8 = (v) => Math.trunc(v) & 0xff;

function bridgeAndMods(tad, el, queryMods) {
  if (el.hasBridge()) tad |= (el.bridge() << 9) | AdditionalTaDFlags.hasBridge;
  if ((queryMods & el.mods()) !== 0) tad |= AdditionalTaDFlags.hasMods;
  return tad;
}

function signalFlag(tad, el) {
  if (el.hasSignal()) {
    const s = el.next();
    if (s instanceof SignalElement && !s.isAiAllocated() && !s.isGhost()) tad |= AdditionalTaDFlags.hasSignal;
  }
  return tad;
}

/** Track.cpp getElTrackConnection. */
function getElTrackConnection(elTrack, nextRotation, baseZ, queryMods) {
  if (elTrack.sequenceIndex() === 0) {
    const tad = (elTrack.trackId() << 3) | elTrack.rotation();
    if (nextRotation === getUnkTrack(tad).rotationBegin) {
      const piece = getTrackPiece(elTrack.trackId());
      if (baseZ === u8(elTrack.baseZ() - Math.trunc(piece[0].z / 4))) return signalFlag(bridgeAndMods(tad, elTrack, queryMods), elTrack);
    }
  }
  if (!elTrack.isFlag6()) return NULL_TAD;
  const tad = (elTrack.trackId() << 3) | (1 << 2) | elTrack.rotation();
  if (nextRotation !== getUnkTrack(tad).rotationBegin) return NULL_TAD;
  const prevBaseZ = elTrack.baseZ() - Math.trunc((getTrackPiece(elTrack.trackId())[elTrack.sequenceIndex()].z + getUnkTrack(tad).pos[2]) / 4);
  if (prevBaseZ !== baseZ) return NULL_TAD;
  return signalFlag(bridgeAndMods(tad, elTrack, queryMods), elTrack);
}

function trackConnectionsImpl(tm, pos, nextRotation, company, trackObjectId, requiredMods, queryMods, ai) {
  const result = { connections: [], hasLevelCrossing: false, stationId: STATION_NULL };
  const baseZ = u8(pos.z / 4);
  for (const el of tm.get(pos)) {
    if (!(el instanceof TrackElement)) continue;
    if (el.owner() !== company || el.trackObjectId() !== trackObjectId) continue;
    if ((el.mods() & requiredMods) !== requiredMods) continue;
    if (ai ? !el.isAiAllocated() : (el.isGhost() || el.isAiAllocated())) continue;
    const c = getElTrackConnection(el, nextRotation, baseZ, queryMods);
    if (c === NULL_TAD) continue;
    result.connections.push(c);
    if (el.hasStationElement()) {
      const st = el.next();
      if (st instanceof StationElement && (ai || (!st.isAiAllocated() && !st.isGhost()))) result.stationId = st.stationId();
    }
    if (el.hasLevelCrossing()) result.hasLevelCrossing = true;
  }
  return result;
}

/**
 * getTrackConnections: all track pieces on the tile at `nextTrackPos` that connect to a piece arriving with
 * `nextRotation`. Call getTrackConnectionEnd first for the arguments.
 * @param {import('./tileManager.js').TileManager} tm
 * @param {{x:number,y:number,z:number}} nextTrackPos world units
 * @param {number} nextRotation @param {number} company @param {number} trackObjectId
 * @param {number} [requiredMods] @param {number} [queryMods]
 * @returns {TrackConnections}
 */
export function getTrackConnections(tm, nextTrackPos, nextRotation, company, trackObjectId, requiredMods = 0, queryMods = 0) {
  return trackConnectionsImpl(tm, nextTrackPos, nextRotation, company, trackObjectId, requiredMods, queryMods, false);
}
/** getTrackConnectionsAi: same, but only aiAllocated preview pieces. @returns {TrackConnections} */
export function getTrackConnectionsAi(tm, nextTrackPos, nextRotation, company, trackObjectId, requiredMods = 0, queryMods = 0) {
  return trackConnectionsImpl(tm, nextTrackPos, nextRotation, company, trackObjectId, requiredMods, queryMods, true);
}

function roadConnectionsImpl(tm, pos, nextRotation, company, roadObjectId, requiredMods, queryMods, checkOneWay, ai, isOneWayRoad) {
  const result = { connections: [], stationId: STATION_NULL, stationObjectId: 0, roadObjectId: 0xff };
  const baseZ = u8(pos.z / 4);
  const tile = tm.get(pos);
  const { roadObjectIdIsUsableByAllCompanies: usable, roadObjectIdIsAnyRoadTypeCompatible: anyType } = tm.gameState;
  const addStation = (el) => {
    if (!el.hasStationElement()) return true;
    const st = tile.roadStation(el.roadId(), el.rotation(), el.baseZ());
    if (!st) return false;
    if (!st.isAiAllocated() && !st.isGhost()) { result.stationId = st.stationId(); result.stationObjectId = st.objectId(); }
    return true;
  };
  for (const el of tile) {
    if (!(el instanceof RoadElement)) continue;
    if (!((usable >>> el.roadObjectId()) & 1) && el.owner() !== company) continue;
    if (el.roadObjectId() !== roadObjectId) {
      if (roadObjectId !== 0xff) continue;
      if (!((anyType >>> el.roadObjectId()) & 1)) continue;
    }
    if ((el.mods() & requiredMods) !== requiredMods) continue;
    if (ai ? !el.isAiAllocated() : (el.isGhost() || el.isAiAllocated())) continue;
    if (el.sequenceIndex() === 0) {
      let tad = (el.roadId() << 3) | el.rotation();
      if (nextRotation === getUnkRoad(tad).rotationBegin
        && baseZ === u8(el.baseZ() - Math.trunc(getRoadPiece(el.roadId())[0].z / 4))) {
        tad = bridgeAndMods(tad, el, queryMods);
        if (!addStation(el)) continue;
        result.roadObjectId = el.roadObjectId();
        result.connections.push(tad);
      }
    }
    if (!el.isFlag6()) continue;
    let tad = (el.roadId() << 3) | (1 << 2) | el.rotation();
    if (nextRotation !== getUnkRoad(tad).rotationBegin) continue;
    const piece = getRoadPiece(el.roadId());
    if (baseZ !== u8(el.baseZ() - Math.trunc((getUnkRoad(tad).pos[2] + piece[el.sequenceIndex()].z) / 4))) continue;
    if (checkOneWay && isOneWayRoad && isOneWayRoad(el.roadObjectId())) continue;
    tad = bridgeAndMods(tad, el, queryMods);
    if (!addStation(el)) continue;
    result.roadObjectId = el.roadObjectId();
    result.connections.push(tad);
  }
  return result;
}

/**
 * getRoadConnections: road pieces on the tile at `nextTrackPos` connecting to a piece arriving with `nextRotation`.
 * Road elements have `mods()` of 2 bits. `roadObjectId` 0xff = any compatible road type.
 * @param {import('./tileManager.js').TileManager} tm
 * @returns {RoadConnections}
 */
export function getRoadConnections(tm, nextTrackPos, nextRotation, company, roadObjectId, requiredMods = 0, queryMods = 0) {
  return roadConnectionsImpl(tm, nextTrackPos, nextRotation, company, roadObjectId, requiredMods, queryMods, false, false);
}
/**
 * getRoadConnectionsOneWay: as above, but reverse-direction (flag6) pieces of one-way road objects are skipped.
 * @param {(roadObjectId:number)=>boolean} isOneWayRoad RoadObject::hasFlags(isOneWay) lookup
 * @returns {RoadConnections}
 */
export function getRoadConnectionsOneWay(tm, nextTrackPos, nextRotation, company, roadObjectId, requiredMods, queryMods, isOneWayRoad) {
  return roadConnectionsImpl(tm, nextTrackPos, nextRotation, company, roadObjectId, requiredMods || 0, queryMods || 0, true, false, isOneWayRoad);
}
/** getRoadConnectionsAiAllocated. @returns {RoadConnections} */
export function getRoadConnectionsAiAllocated(tm, nextTrackPos, nextRotation, company, roadObjectId, requiredMods = 0, queryMods = 0) {
  return roadConnectionsImpl(tm, nextTrackPos, nextRotation, company, roadObjectId, requiredMods, queryMods, false, true);
}

function getElTrackAt(tm, pos, rotation, trackId, trackObjId, index) {
  for (const el of tm.get(pos)) {
    if (el instanceof TrackElement && el.baseHeight() === pos.z && el.rotation() === rotation
      && el.sequenceIndex() === index && el.trackObjectId() === trackObjId && el.trackId() === trackId) return el;
  }
  return null;
}

/**
 * validateTrackIsSignalCompatible: can signals be placed on the track piece starting at `trackStart`?
 * @param {import('./tileManager.js').TileManager} tm
 * @returns {?string} null on success, else 'empty' (piece missing / has station) or
 *   'signals_cannot_be_built_on_a_junction' (StringIds names)
 */
export function validateTrackIsSignalCompatible(tm, trackStart, rotation, trackId, trackObjId) {
  for (const piece of getTrackPiece(trackId)) {
    const r = rotatePos2({ x: piece.x, y: piece.y }, rotation);
    const trackLoc = { x: trackStart.x + r.x, y: trackStart.y + r.y, z: trackStart.z + piece.z };
    const pieceEl = getElTrackAt(tm, trackLoc, rotation, trackId, trackObjId, piece.index);
    if (!pieceEl) return 'empty';
    if (pieceEl.hasStationElement()) return 'empty';
    const connectFlags = piece.connectFlags[pieceEl.rotation()];
    for (const other of tm.get(trackLoc)) {
      if (!(other instanceof TrackElement) || other === pieceEl) continue;
      if (other.baseZ() !== pieceEl.baseZ() || other.isGhost()) continue;
      const otherFlags = getTrackPiece(other.trackId())[other.sequenceIndex()].connectFlags[other.rotation()];
      if (otherFlags & connectFlags) return 'signals_cannot_be_built_on_a_junction';
    }
  }
  return null;
}

