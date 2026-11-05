/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/GameCommands/Road/CreateRoadStation.cpp (0x0048C708) and RemoveRoadStation.cpp (0x0048D2AC).
 * Create args: {pos, rotation, roadId, roadObjectId, index, type: roadStationObjectId}. Remove args: {pos, rotation, roadId, index, roadObjectId}.
 * Deviations: element ranges use list indices instead of pointers; RemoveRoadStation subtracts height/4 from clearZ (the C++ subtracts
 * the raw height, inconsistent with Create). Not ported: emotion event, label updates, viewport invalidation, cargo recalculation.
 */
import { getRoadPiece, getRoadMiscData, getUnkRoad } from '../trackData.js';
import { QuarterTile } from '../quarterTile.js';
import { ElementType } from '../map/elements.js';
import { RoadElement, StationElement, StationType, STATION_NULL } from '../map/transportElements.js';
import { ClearFuncResult } from '../map/tileClearance.js';
import { getRoadConnections, getRoadConnectionEnd } from '../map/track.js';
import { ROTATION_OFFSET } from '../map/world.js';
import { Flags, FAILURE, hasFlags, defineCommand, setPosition, setErrorText, getInflationAdjustedCost, scaleByPieceCost,
  checkCompanyCompatibility } from './gameCommands.js';
import { getObject, RoadObjectFlags, RoadStationFlags } from './objects.js';
import { MAX_STATION_TILES, getStationElement } from './stationManager.js';
import { findRoad, piecePos, pieceStart, clearAt } from './common.js';

const lookup = (tm, pos, rotation, objId, roadId, index) => findRoad(tm, pos,
  (e) => e.baseHeight() === pos.z && e.rotation() === rotation && e.roadId() === roadId && e.roadObjectId() === objId && e.sequenceIndex() === index);

function findNearbyStationOnRoad(ctx, pos, tad, objId) {
  const co = ctx.updatingCompanyId;
  { const e = getRoadConnectionEnd(pos, tad); const rc = getRoadConnections(ctx.tm, e.nextPos, e.nextRotation, co, objId, 0, 0);
    if (rc.stationId !== STATION_NULL && ctx.stations.get(rc.stationId).owner === co) return { id: rc.stationId, isPhysicallyAttached: true }; }
  {
    const size = getUnkRoad(tad);
    let tail = { x: pos.x + size.pos[0], y: pos.y + size.pos[1], z: pos.z + size.pos[2] };
    if (size.rotationEnd < 12) { const o = ROTATION_OFFSET[size.rotationEnd]; tail = { x: tail.x - o.x, y: tail.y - o.y, z: tail.z }; }
    const e = getRoadConnectionEnd(tail, tad ^ 4);
    const rc = getRoadConnections(ctx.tm, e.nextPos, e.nextRotation, co, objId, 0, 0);
    if (rc.stationId !== STATION_NULL && ctx.stations.get(rc.stationId).owner === co) return { id: rc.stationId, isPhysicallyAttached: true };
  }
  return ctx.stations.findNearbyStation(pos, co);
}
function validateNearbyStation(ctx, pos, tad, objId) {
  const near = findNearbyStationOnRoad(ctx, pos, tad, objId);
  if (near.id === STATION_NULL) return { result: 'new', id: STATION_NULL };
  const st = ctx.stations.get(near.id);
  if (st.stationTileSize >= MAX_STATION_TILES || ctx.stations.exceedsStationSize(st, pos)) {
    if (near.isPhysicallyAttached) { setErrorText(ctx, 'station_too_large'); return { result: 'failure', id: STATION_NULL }; }
    return { result: 'new', id: STATION_NULL };
  }
  return { result: 'okay', id: near.id };
}
function elRoadIsJunctionAi(tm, pos, rotation) {
  for (const e of tm.get(pos)) {
    if (!(e instanceof RoadElement) || e.baseHeight() !== pos.z || e.isGhost()) continue;
    if (e.roadId() !== 0) return true;
    if ((e.rotation() - rotation) & 1) return true;
  }
  return false;
}
const collideSurface = (el) => (el.type() === ElementType.surface ? ClearFuncResult.collision : ClearFuncResult.noCollision);
/** Road elements of a tile at height z as list indices [first, last] (C++ keeps the first and the last matching). */
function roadRange(tm, pos, z) {
  const list = tm.get(pos).elements();
  let first = -1, last = -1;
  list.forEach((e, i) => { if (e instanceof RoadElement && e.baseHeight() === z) { if (first < 0) first = i; last = i; } });
  return { list, first, last };
}

function createRoadStation(ctx, args, flags) {
  setPosition(ctx, args.pos);
  const tm = ctx.tm;
  const rs = ctx.returnState;
  rs.lastPlacedTrackRoadStationId = STATION_NULL;
  const stationObj = getObject(ctx, 'roadStation', args.type);
  const misc = getRoadMiscData(args.roadId);
  if (((stationObj.roadPieces & misc.compatibleFlags) >>> 0) !== (misc.compatibleFlags >>> 0)) { setErrorText(ctx, 'track_road_unsuitable_for_station'); return FAILURE; }
  const co = ctx.updatingCompanyId;
  if (!hasFlags(flags, Flags.apply) && (stationObj.flags & RoadStationFlags.roadEnd)) {
    const e1 = getRoadConnectionEnd(args.pos, args.rotation);
    if (getRoadConnections(tm, e1.nextPos, e1.nextRotation, co, args.roadObjectId, 0, 0).connections.length) {
      const e2 = getRoadConnectionEnd(args.pos, 4 | args.rotation);
      if (getRoadConnections(tm, e2.nextPos, e2.nextRotation, co, args.roadObjectId, 0, 0).connections.length) {
        setErrorText(ctx, 'station_type_can_only_be_built_at_road_ends'); return FAILURE;
      }
    }
  }
  const initial = lookup(tm, args.pos, args.rotation, args.roadObjectId, args.roadId, args.index);
  let index = args.index, aiNoRoad = false;
  if (!initial) {
    if (hasFlags(flags, Flags.apply) || !hasFlags(flags, Flags.aiAllocated)) return FAILURE;
    index = 0; aiNoRoad = true;
  } else {
    if (hasFlags(flags, Flags.aiAllocated) && initial.hasStationElement()) { setErrorText(ctx, 'empty'); return FAILURE; }
    if (initial.hasStationElement()) {
      const st = getStationElement(tm, args.pos);
      if (!st) { setErrorText(ctx, 'empty'); return FAILURE; }
      if (!checkCompanyCompatibility(ctx, st.owner())) return FAILURE;
    }
  }
  const pieces = getRoadPiece(args.roadId);
  const roadStart = pieceStart(args.pos, pieces[index], args.rotation);
  const tad = (args.roadId << 3) | args.rotation;
  if (hasFlags(flags, Flags.ghost) && hasFlags(flags, Flags.apply)) {
    rs.lastConstructedAdjoiningStationPos = { x: roadStart.x, y: roadStart.y };
    rs.lastConstructedAdjoiningStation = findNearbyStationOnRoad(ctx, roadStart, tad, args.roadObjectId).id;
  }
  let isNewTile = false;
  if (!hasFlags(flags, Flags.ghost)) {
    const v = validateNearbyStation(ctx, roadStart, tad, args.roadObjectId);
    if (hasFlags(flags, Flags.apply)) {
      if (v.result === 'new') { const id = ctx.stations.allocateNewStation(roadStart, co, 0); if (id !== STATION_NULL) rs.lastPlacedTrackRoadStationId = id; }
      else if (v.result === 'okay') rs.lastPlacedTrackRoadStationId = v.id;
      isNewTile = true;
    } else if (v.result === 'failure') return FAILURE;
    else if (v.result === 'new') {
      const id = ctx.stations.allocateNewStation(roadStart, co, 0);
      if (id === STATION_NULL) return FAILURE;
      ctx.stations.deallocateStation(id);
    } else rs.lastPlacedTrackRoadStationId = v.id;
  }

  let total = 0, piece0Rot = args.rotation;
  const cost = (factor, obj) => scaleByPieceCost(getInflationAdjustedCost(ctx, factor, obj.costIndex, 8), misc.costFactor);
  for (const piece of pieces) {
    const loc = piecePos(roadStart, piece, args.rotation);
    if (aiNoRoad) {
      if (elRoadIsJunctionAi(tm, loc, args.rotation)) { setErrorText(ctx, 'station_cannot_be_built_on_a_junction'); return FAILURE; }
    } else {
      const er = lookup(tm, loc, args.rotation, args.roadObjectId, args.roadId, piece.index);
      if (!er) return FAILURE;
      if (er.hasSignalElement()) { setErrorText(ctx, 'signal_in_the_way'); return FAILURE; }
      if (er.hasLevelCrossing()) { setErrorText(ctx, 'level_crossing_in_the_way'); return FAILURE; }
      if (er.roadId() === 0) {
        if (elRoadIsJunctionAi(tm, loc, args.rotation)) { setErrorText(ctx, 'station_cannot_be_built_on_a_junction'); return FAILURE; }
      } else {
        const cf = piece.connectFlags[er.rotation()];
        for (const o of tm.get(loc)) {
          if (!(o instanceof RoadElement) || o === er || o.baseHeight() !== loc.z || o.isGhost()) continue;
          const op = getRoadPiece(o.roadId())[o.sequenceIndex()];
          if (cf & op.connectFlags[o.rotation()]) { setErrorText(ctx, 'station_cannot_be_built_on_a_junction'); return FAILURE; }
        }
      }
    }
    let anyOk = false, first = null, last = null;
    for (const er of tm.get(loc).elements()) {
      if (!(er instanceof RoadElement) || er.baseHeight() !== loc.z) continue;
      const ro = getObject(ctx, 'road', er.roadObjectId());
      if ((stationObj.flags & RoadStationFlags.roadEnd) && !(ro.flags & RoadObjectFlags.isRoad)) { setErrorText(ctx, 'station_not_compatible_with_string_id'); return FAILURE; }
      if ((ro.flags & (RoadObjectFlags.anyRoadTypeCompatible | RoadObjectFlags.allowUseByAllCompanies)) || checkCompanyCompatibility(ctx, er.owner())) anyOk = true;
      if (stationObj.mods.includes(er.roadObjectId()) || ro.stations.includes(args.type)) { last = er; if (!first) first = er; continue; }
      setErrorText(ctx, 'wrong_type_of_station_for_string_id'); return FAILURE;
    }
    if (!anyOk && !aiNoRoad) return FAILURE;
    if (piece.index === 0) {
      let calc = true;
      if (!aiNoRoad && last.hasStationElement()) {
        const st = last.next();
        if (!(st instanceof StationElement)) return FAILURE;
        if (st.objectId() === args.type) calc = false;
        else { const old = getObject(ctx, 'roadStation', st.objectId()); total += cost(old.sellCostFactor, old); }
      }
      if (calc) total += cost(stationObj.buildCostFactor, stationObj);
    }
    const baseZ = Math.trunc(roadStart.z / 4); // vanilla uses roadStart.z (kept)
    const clearZ = baseZ + 8 + Math.trunc(stationObj.height / 4);
    const qt = new QuarterTile(0xf, 0);
    const list = tm.get(loc).elements();
    const i0 = first ? list.indexOf(first) : -1, i1 = last ? list.indexOf(last) : -1;
    const clearFunc0 = (el) => {
      if (el instanceof StationElement) { if (el.stationType() === StationType.roadStation) return ClearFuncResult.noCollision; }
      else if (el instanceof RoadElement && i0 >= 0 && i1 >= 0) { const i = list.indexOf(el); if (i > i0 && i <= i1) return ClearFuncResult.noCollision; }
      return ClearFuncResult.collision;
    };
    if (!clearAt(ctx, loc, baseZ + 8, clearZ, qt, clearFunc0).ok) return FAILURE;
    if (!hasFlags(flags, Flags.aiAllocated) && !clearAt(ctx, loc, baseZ, clearZ, qt, collideSurface).ok) return FAILURE;
    if (!aiNoRoad && last.hasStationElement() && hasFlags(flags, Flags.ghost)) { setErrorText(ctx, 'empty'); return FAILURE; }
    if (!hasFlags(flags, Flags.apply)) continue;

    let ns;
    const roadsAt = () => tm.get(loc).elements().filter((e) => e instanceof RoadElement && e.baseHeight() === loc.z);
    let rds = roadsAt().filter((e) => first && list.indexOf(e) >= i0 && list.indexOf(e) <= i1);
    if (last.hasStationElement()) {
      ns = last.next();
      if (!(ns instanceof StationElement)) return FAILURE;
      const old = getObject(ctx, 'roadStation', ns.objectId());
      for (const e of rds) e.setClearZ(e.clearZ() - Math.trunc(old.height / 4));
      isNewTile = false;
    } else {
      ns = tm.insertElementAfterNoReorg(last, ElementType.station, last.baseZ(), last.occupiedQuarter());
      if (!ns) return FAILURE;
      rds = roadsAt();
      const lastRoad = rds[rds.length - 1];
      if (piece.index === 0) piece0Rot = lastRoad.rotation();
      ns.setRotation(lastRoad.rotation()); ns.setGhost(hasFlags(flags, Flags.ghost)); ns.setAiAllocated(hasFlags(flags, Flags.aiAllocated));
      ns.setSequenceIndex(0); ns.setUnk4SLR4(0); ns.setStationType(StationType.roadStation); ns.setBuildingType(0);
      ns.setStationId(hasFlags(flags, Flags.ghost) ? 0 : rs.lastPlacedTrackRoadStationId);
      for (const e of rds) e.setHasStationElement(true);
    }
    ns.setObjectId(args.type);
    for (const e of rds) e.setClearZ(e.clearZ() + Math.trunc(stationObj.height / 4));
    ns.setClearZ(rds[0].clearZ());
    ns.setOwner(co);
  }
  if (!hasFlags(flags, Flags.ghost) && hasFlags(flags, Flags.apply)) {
    const id = rs.lastPlacedTrackRoadStationId;
    if (isNewTile) ctx.stations.addTileToStation(id, roadStart, piece0Rot);
    ctx.stations.recalculateStation(id);
  }
  return total;
}
export const createRoadStationCommand = defineCommand(createRoadStation, 'createRoadStation');

function removeRoadStation(ctx, args, flags) {
  setPosition(ctx, args.pos);
  const tm = ctx.tm;
  let updateReg = true;
  const initial = lookup(tm, args.pos, args.rotation, args.roadObjectId, args.roadId, args.index);
  if (!initial || !initial.hasStationElement()) return FAILURE;
  { const r = roadRange(tm, args.pos, args.pos.z); const st = r.list[r.last + 1];
    if (r.first < 0 || !(st instanceof StationElement)) return FAILURE;
    if (!checkCompanyCompatibility(ctx, st.owner())) return FAILURE; }
  const pieces = getRoadPiece(args.roadId);
  const roadStart = pieceStart(args.pos, pieces[args.index], args.rotation);
  const misc = getRoadMiscData(args.roadId);
  let foundId = STATION_NULL, total = 0;
  for (const piece of pieces) {
    const r = roadRange(tm, args.pos, args.pos.z); // C++ re-queries args.pos for every piece
    const st = r.list[r.last + 1];
    if (r.first < 0 || !(st instanceof StationElement)) return FAILURE;
    if (st.isGhost()) updateReg = false;
    foundId = st.stationId();
    const obj = getObject(ctx, 'roadStation', st.objectId());
    if (piece.index === 0) total += scaleByPieceCost(getInflationAdjustedCost(ctx, obj.sellCostFactor, obj.costIndex, 8), misc.costFactor);
    if (hasFlags(flags, Flags.apply)) {
      for (let i = r.first; i <= r.last; i++) {
        const e = r.list[i];
        if (e instanceof RoadElement) { e.setHasStationElement(false); e.setClearZ(e.clearZ() - Math.trunc(obj.height / 4)); }
      }
      tm.removeElement(st);
    }
  }
  if (updateReg && hasFlags(flags, Flags.apply)) {
    ctx.stations.removeTileFromStation(foundId, roadStart, args.rotation);
    ctx.stations.recalculateStation(foundId);
  }
  return total;
}
export const removeRoadStationCommand = defineCommand(removeRoadStation, 'removeRoadStation');
