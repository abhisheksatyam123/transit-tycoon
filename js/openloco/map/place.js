/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: the element-insertion part of src/GameCommands/Track/CreateTrack.cpp (~l.400-550) and
 *         src/GameCommands/Road/CreateRoad.cpp (~l.680-860). Only the map writing; no cost, bridge
 *         search, terrain edits or company/ownership rules (later game-command ports add those on top).
 */
import { getTrackPiece, getRoadPiece } from '../trackData.js';
import { QuarterTile } from '../quarterTile.js';
import { ElementType } from './elements.js';
import { TrackElement, RoadElement, StationElement, StationType } from './transportElements.js';
import { rotatePos2 } from './world.js';

/**
 * Insert every element of one track piece sequence (C++ CreateTrack apply loop).
 * @param {import('./tileManager.js').TileManager} tm
 * @param {{x:number,y:number,z:number}} pos world position of piece 0 (tile origin; z multiple of 16)
 * @param {{trackId:number, rotation:number, trackObjectId?:number, owner?:number, mods?:number,
 *   bridge?:?number, hasLevelCrossing?:boolean, ghost?:boolean, aiAllocated?:boolean}} o
 * @returns {TrackElement[]|null} inserted elements by sequence index; null if any piece is off-map
 */
export function placeTrack(tm, pos, o) {
  const pieces = getTrackPiece(o.trackId);
  const out = [];
  for (const piece of pieces) {
    const r = rotatePos2({ x: piece.x, y: piece.y }, o.rotation);
    const loc = { x: pos.x + r.x, y: pos.y + r.y, z: pos.z + piece.z };
    const qt = QuarterTile.fromRaw(piece.quarterTile).rotate(o.rotation);
    const baseZ = Math.trunc(loc.z / 4);
    const clearZ = baseZ + Math.trunc((piece.clearZ + 32) / 4);
    const el = tm.insertElement(ElementType.track, loc, baseZ, qt.getBaseQuarterOccupied());
    if (!el) return null;
    el.setClearZ(clearZ);
    el.setRotation(o.rotation);
    el.setTrackObjectId(o.trackObjectId ?? 0);
    el.setSequenceIndex(piece.index);
    el.setTrackId(o.trackId);
    el.setOwner(o.owner ?? 0);
    for (let i = 0; i < 4; i++) if (((o.mods || 0) >> i) & 1) el.setMod(i, true);
    if (o.bridge !== null && o.bridge !== undefined) { el.setBridgeObjectId(o.bridge); el.setHasBridge(true); }
    el.setHasLevelCrossing(!!o.hasLevelCrossing);
    el.setFlag6(piece.index === pieces.length - 1);
    el.setGhost(!!o.ghost);
    el.setAiAllocated(!!o.aiAllocated);
    out.push(el);
  }
  return out;
}

/**
 * Insert every element of one road piece sequence (C++ CreateRoad apply loop; uses insertElementRoad).
 * @param {import('./tileManager.js').TileManager} tm
 * @param {{x:number,y:number,z:number}} pos
 * @param {{roadId:number, rotation:number, roadObjectId?:number, owner?:number, mods?:number, bridge?:?number,
 *   hasLevelCrossing?:boolean, levelCrossingObjId?:number, hasStation?:boolean, ghost?:boolean, aiAllocated?:boolean}} o
 * @returns {RoadElement[]|null}
 */
export function placeRoad(tm, pos, o) {
  const pieces = getRoadPiece(o.roadId);
  const out = [];
  for (const piece of pieces) {
    const r = rotatePos2({ x: piece.x, y: piece.y }, o.rotation);
    const loc = { x: pos.x + r.x, y: pos.y + r.y, z: pos.z + piece.z };
    const qt = QuarterTile.fromRaw(piece.quarterTile).rotate(o.rotation);
    const baseZ = Math.trunc(loc.z / 4);
    const el = tm.insertElementRoad(loc, baseZ, qt.getBaseQuarterOccupied());
    if (!el) return null;
    el.setClearZ(baseZ + Math.trunc((piece.clearZ + 32) / 4));
    el.setRotation(o.rotation);
    el.setRoadObjectId(o.roadObjectId ?? 0);
    el.setSequenceIndex(piece.index);
    el.setRoadId(o.roadId);
    el.setOwner(o.owner ?? 15);
    for (let i = 0; i < 2; i++) if (((o.mods || 0) >> i) & 1) el.setMod(i, true);
    if (o.bridge !== null && o.bridge !== undefined) { el.setBridgeObjectId(o.bridge); el.setHasBridge(true); }
    if (o.hasLevelCrossing && !o.aiAllocated) { el.setHasLevelCrossing(true); el.setLevelCrossingObjectId(o.levelCrossingObjId || 0); }
    el.setHasStationElement(!!o.hasStation);
    el.setFlag6(piece.index === pieces.length - 1);
    el.setGhost(!!o.ghost);
    el.setAiAllocated(!!o.aiAllocated);
    out.push(el);
  }
  return out;
}

/**
 * Attach a StationElement directly after a track element (CreateTrainStation layout) and set hasStationElement.
 * @param {import('./tileManager.js').TileManager} tm @param {TrackElement} track
 * @returns {StationElement}
 */
export function attachTrainStation(tm, track, { stationId, objectId = 0, owner = 0, sequenceIndex = 0 }) {
  const st = tm.insertElementAfterNoReorg(track, ElementType.station, track.baseZ(), track.occupiedQuarter());
  st.setClearZ(track.clearZ()); st.setRotation(track.rotation()); st.setSequenceIndex(sequenceIndex);
  st.setStationType(StationType.trainStation); st.setStationId(stationId); st.setObjectId(objectId); st.setOwner(owner);
  track.setHasStationElement(true);
  return st;
}

/**
 * Attach a road StationElement after a road element (any number of road elements may sit between, see Tile.roadStation).
 * @param {import('./tileManager.js').TileManager} tm @param {RoadElement} road
 * @returns {StationElement}
 */
export function attachRoadStation(tm, road, { stationId, objectId = 0, owner = 15, sequenceIndex = 0 }) {
  const st = tm.insertElementAfterNoReorg(road, ElementType.station, road.baseZ(), road.occupiedQuarter());
  st.setClearZ(road.clearZ()); st.setRotation(road.rotation()); st.setSequenceIndex(sequenceIndex);
  st.setStationType(StationType.roadStation); st.setStationId(stationId); st.setObjectId(objectId); st.setOwner(owner);
  road.setHasStationElement(true);
  return st;
}
