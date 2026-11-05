/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/GameCommands/Track/CreateTrainStation.cpp (0x0048BB20) and RemoveTrainStation.cpp (0x0048C402).
 * Create args: {pos, rotation, trackId, trackObjectId, index, type: stationObjectId}. Remove args: {pos, rotation, trackId, index, type: trackObjectId}.
 * Stations come from `ctx.stations` (see stationManager.js). The "last placed station id" is kept in ctx.returnState.
 * Deviation: RemoveTrainStation.cpp subtracts stationObj->height (big Z) from clearZ where Create adds height/4; here Remove
 * subtracts height/4 so create+remove round-trips. Not ported: label update, sub_48D794, viewport invalidation, cargo recalcs.
 */
import { getTrackPiece, getTrackMiscData, getUnkTrack } from '../trackData.js';
import { QuarterTile } from '../quarterTile.js';
import { ElementType } from '../map/elements.js';
import { StationElement, StationType, STATION_NULL } from '../map/transportElements.js';
import { ClearFuncResult } from '../map/tileClearance.js';
import { getTrackConnections, getTrackConnectionEnd, getTrackConnectionsAi } from '../map/track.js';
import { ROTATION_OFFSET } from '../map/world.js';
import { Flags, FAILURE, hasFlags, defineCommand, setPosition, setErrorText, getInflationAdjustedCost, scaleByPieceCost,
  checkCompanyCompatibility } from './gameCommands.js';
import { getObject } from './objects.js';
import { MAX_STATION_TILES } from './stationManager.js';
import { findTrack, piecePos, pieceStart, clearAt } from './common.js';

const lookup = (tm, pos, rotation, objId, trackId, index) => findTrack(tm, pos,
  (e) => e.baseHeight() === pos.z && e.rotation() === rotation && e.trackId() === trackId && e.trackObjectId() === objId && e.sequenceIndex() === index);

function findNearbyStationOnTrack(ctx, pos, tad, objId, ai) {
  const conns = ai ? getTrackConnectionsAi : getTrackConnections;
  const co = ctx.updatingCompanyId;
  { const e = getTrackConnectionEnd(pos, tad); const tc = conns(ctx.tm, e.nextPos, e.nextRotation, co, objId, 0, 0);
    if (tc.stationId !== STATION_NULL) return { id: tc.stationId, isPhysicallyAttached: true }; }
  {
    const size = getUnkTrack(tad);
    let tail = { x: pos.x + size.pos[0], y: pos.y + size.pos[1], z: pos.z + size.pos[2] };
    if (size.rotationEnd < 12) { const o = ROTATION_OFFSET[size.rotationEnd]; tail = { x: tail.x - o.x, y: tail.y - o.y, z: tail.z }; }
    const e = getTrackConnectionEnd(tail, tad ^ 4);
    const tc = conns(ctx.tm, e.nextPos, e.nextRotation, co, objId, 0, 0);
    if (tc.stationId !== STATION_NULL) return { id: tc.stationId, isPhysicallyAttached: true };
  }
  return ctx.stations.findNearbyStation(pos, co);
}

/** validateNearbyStation -> {result:'okay'|'new'|'failure', id}. */
function validateNearbyStation(ctx, pos, tad, objId, flags) {
  const ai = hasFlags(flags, Flags.aiAllocated);
  const near = findNearbyStationOnTrack(ctx, pos, tad, objId, ai);
  if (near.id === STATION_NULL) return { result: 'new', id: STATION_NULL };
  const st = ctx.stations.get(near.id);
  if (st.stationTileSize >= MAX_STATION_TILES) {
    if (near.isPhysicallyAttached) { setErrorText(ctx, 'station_too_large'); return { result: 'failure', id: STATION_NULL }; }
    return { result: 'new', id: STATION_NULL };
  }
  if (!ai && ctx.stations.exceedsStationSize(st, pos)) {
    if (near.isPhysicallyAttached) { setErrorText(ctx, 'station_too_spread_out'); return { result: 'failure', id: STATION_NULL }; }
    return { result: 'new', id: STATION_NULL };
  }
  return { result: 'okay', id: near.id };
}

const clearAiReservation = (ref) => (el) => {
  if (el instanceof StationElement) return el.stationType() === StationType.trainStation ? ClearFuncResult.noCollision : ClearFuncResult.collision;
  if (el.type() === ElementType.track && el === ref) return ClearFuncResult.noCollision;
  return ClearFuncResult.collision;
};
const clearCollideSurface = (el) => (el.type() === ElementType.surface ? ClearFuncResult.collision : ClearFuncResult.noCollision);

function createTrainStation(ctx, args, flags) {
  setPosition(ctx, args.pos);
  const rs = ctx.returnState || (ctx.returnState = {});
  rs.lastPlacedTrackRoadStationId = STATION_NULL;
  let updateReg = false;
  const trackObj = getObject(ctx, 'track', args.trackObjectId);
  const stationObj = getObject(ctx, 'trainStation', args.type);
  const compat = getTrackMiscData(args.trackId).compatibleFlags;
  if (((trackObj.stationTrackPieces & stationObj.trackPieces & compat) >>> 0) !== (compat >>> 0)) {
    setErrorText(ctx, 'track_road_unsuitable_for_station'); return FAILURE;
  }
  const tm = ctx.tm;
  const initial = lookup(tm, args.pos, args.rotation, args.trackObjectId, args.trackId, args.index);
  let index = args.index;
  if (!initial) {
    if (hasFlags(flags, Flags.apply) || !hasFlags(flags, Flags.aiAllocated)) return FAILURE;
    index = 0;
  } else if (!checkCompanyCompatibility(ctx, initial.owner())) return FAILURE;

  const pieces = getTrackPiece(args.trackId);
  const trackStart = pieceStart(args.pos, pieces[index], args.rotation);
  const tad = (args.trackId << 3) | args.rotation;
  if (hasFlags(flags, Flags.ghost) && hasFlags(flags, Flags.apply)) {
    rs.lastConstructedAdjoiningStationPos = { x: trackStart.x, y: trackStart.y };
    rs.lastConstructedAdjoiningStation = findNearbyStationOnTrack(ctx, trackStart, tad, args.trackObjectId, false).id;
  }
  if (!hasFlags(flags, Flags.ghost)) {
    const v = validateNearbyStation(ctx, trackStart, tad, args.trackObjectId, flags);
    if (hasFlags(flags, Flags.apply)) {
      if (v.result === 'new') {
        const id = ctx.stations.allocateNewStation(trackStart, ctx.updatingCompanyId, 0);
        if (id !== STATION_NULL) rs.lastPlacedTrackRoadStationId = id;
      } else if (v.result === 'okay') rs.lastPlacedTrackRoadStationId = v.id;
      updateReg = true;
    } else if (v.result === 'failure') return FAILURE;
    else if (v.result === 'new') {
      const id = ctx.stations.allocateNewStation(trackStart, ctx.updatingCompanyId, 0);
      if (id === STATION_NULL) return FAILURE;
      ctx.stations.deallocateStation(id);
    } else rs.lastPlacedTrackRoadStationId = v.id;
  }

  let total = 0;
  const misc = getTrackMiscData(args.trackId);
  const cost = (factor) => scaleByPieceCost(getInflationAdjustedCost(ctx, factor, stationObj.costIndex, 8), misc.costFactor);
  for (const piece of pieces) {
    const loc = piecePos(trackStart, piece, args.rotation);
    let el = lookup(tm, loc, args.rotation, args.trackObjectId, args.trackId, piece.index);
    if (!el) {
      if (piece.index === 0) total += cost(stationObj.buildCostFactor);
      const baseZ = Math.trunc(loc.z / 4);
      const clearZ = baseZ + 8 + Math.trunc(stationObj.height / 4);
      const qt = new QuarterTile(QuarterTile.fromRaw(pieces[index].quarterTile).getBaseQuarterOccupied(), 0);
      if (!clearAt(ctx, loc, baseZ, clearZ, qt, clearCollideSurface).ok) return FAILURE;
      continue;
    }
    if (el.hasSignal()) { setErrorText(ctx, 'signal_in_the_way'); return FAILURE; }
    if (el.hasLevelCrossing()) { setErrorText(ctx, 'level_crossing_in_the_way'); return FAILURE; }
    const cf = piece.connectFlags[el.rotation()];
    for (const o of tm.get(loc)) {
      if (o.type() !== ElementType.track || o === el || o.baseHeight() !== loc.z || o.isGhost()) continue;
      const op = getTrackPiece(o.trackId())[o.sequenceIndex()];
      if (cf & op.connectFlags[o.rotation()]) { setErrorText(ctx, 'station_cannot_be_built_on_a_junction'); return FAILURE; }
    }
    if (piece.index === 0) {
      let calc = true;
      if (el.hasStationElement()) {
        const st = el.next();
        if (!(st instanceof StationElement)) return FAILURE;
        if (st.objectId() === args.type) calc = false;
        else { const old = getObject(ctx, 'trainStation', st.objectId()); total += scaleByPieceCost(getInflationAdjustedCost(ctx, old.sellCostFactor, old.costIndex, 8), misc.costFactor); }
      }
      if (calc) total += cost(stationObj.buildCostFactor);
    }
    const baseZ = el.baseZ();
    const clearZ = baseZ + 8 + Math.trunc(stationObj.height / 4);
    const qt = new QuarterTile(el.occupiedQuarter(), 0);
    if (!hasFlags(flags, Flags.aiAllocated) && !clearAt(ctx, loc, baseZ + 8, clearZ, qt, clearAiReservation(el)).ok) return FAILURE;
    if (!clearAt(ctx, loc, baseZ, clearZ, qt, clearCollideSurface).ok) return FAILURE;
    if (el.hasStationElement() && hasFlags(flags, Flags.ghost)) { setErrorText(ctx, 'empty'); return FAILURE; }
    if (!hasFlags(flags, Flags.apply)) continue;

    let ns;
    if (el.hasStationElement()) {
      ns = el.next();
      if (!(ns instanceof StationElement)) return FAILURE;
      const old = getObject(ctx, 'trainStation', ns.objectId());
      el.setClearZ(el.clearZ() - Math.trunc(old.height / 4));
      ns.setSequenceIndex(0);
      updateReg = false;
    } else {
      ns = tm.insertElementAfterNoReorg(el, ElementType.station, el.baseZ(), el.occupiedQuarter());
      if (!ns) return FAILURE;
      el = lookup(tm, loc, args.rotation, args.trackObjectId, args.trackId, piece.index);
      if (!el) return FAILURE;
      ns.setRotation(el.rotation()); ns.setGhost(hasFlags(flags, Flags.ghost)); ns.setAiAllocated(hasFlags(flags, Flags.aiAllocated));
      ns.setSequenceIndex(0); ns.setUnk4SLR4(0); ns.setStationType(StationType.trainStation); ns.setBuildingType(0);
      ns.setStationId(hasFlags(flags, Flags.ghost) ? 0 : rs.lastPlacedTrackRoadStationId);
      el.setHasStationElement(true);
    }
    ns.setObjectId(args.type);
    el.setClearZ(el.clearZ() + Math.trunc(stationObj.height / 4));
    ns.setClearZ(el.clearZ());
    ns.setOwner(ctx.updatingCompanyId);
  }
  if (!hasFlags(flags, Flags.ghost) && hasFlags(flags, Flags.apply)) {
    const id = rs.lastPlacedTrackRoadStationId;
    if (updateReg) ctx.stations.addTileToStation(id, trackStart, args.rotation);
    ctx.stations.recalculateStation(id);
  }
  return total;
}
export const createTrainStationCommand = defineCommand(createTrainStation, 'createTrainStation');

function removeTrainStation(ctx, args, flags) {
  setPosition(ctx, args.pos);
  const tm = ctx.tm;
  let updateReg = true;
  const initial = lookup(tm, args.pos, args.rotation, args.type, args.trackId, args.index);
  if (!initial) return FAILURE;
  if (!checkCompanyCompatibility(ctx, initial.owner())) return FAILURE;
  const pieces = getTrackPiece(args.trackId);
  const trackStart = pieceStart(args.pos, pieces[args.index], args.rotation);
  const misc = getTrackMiscData(args.trackId);
  let foundId = STATION_NULL, total = 0;
  for (const piece of pieces) {
    const loc = piecePos(trackStart, piece, args.rotation);
    const el = lookup(tm, loc, args.rotation, args.type, args.trackId, piece.index);
    if (!el) return FAILURE;
    const st = el.next();
    if (!(st instanceof StationElement)) return FAILURE;
    if (st.isGhost()) updateReg = false;
    foundId = st.stationId();
    const obj = getObject(ctx, 'trainStation', st.objectId());
    if (piece.index === 0) total += scaleByPieceCost(getInflationAdjustedCost(ctx, obj.sellCostFactor, obj.costIndex, 8), misc.costFactor);
    if (hasFlags(flags, Flags.apply)) {
      el.setClearZ(el.clearZ() - Math.trunc(obj.height / 4));
      el.setHasStationElement(false);
      tm.removeElement(st);
    }
  }
  if (updateReg && hasFlags(flags, Flags.apply)) {
    ctx.stations.removeTileFromStation(foundId, trackStart, args.rotation);
    ctx.stations.recalculateStation(foundId);
  }
  return total;
}
export const removeTrainStationCommand = defineCommand(removeTrainStation, 'removeTrainStation');
