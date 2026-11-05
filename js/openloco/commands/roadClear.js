/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/GameCommands/Road/CreateRoad.cpp (clearFunction 0x00476D40, clearTrack 0x00476EC4, clearRoad 0x00476FAB,
 *         roadTraitAndCompatbilityCheck 0x0047744C, finalJunctionChecks 0x004773FE).
 * The per-piece accumulator `ls` replaces RoadClearFunctionResult merging + the legacy return state:
 *   ls = {hasLevelCrossing, levelCrossingObjId(0xff), hasStation, stationId, roadIdUnk[16], f73 (flags_1136073 bits)}.
 */
import { getRoadPiece, getRoadMiscData } from '../trackData.js';
import { CommonTraitFlags, RoadTraitFlags } from '../trackEnum.js';
import { ElementType } from '../map/elements.js';
import { TrackElement, RoadElement, StationElement, StationType } from '../map/transportElements.js';
import { ClearFuncResult } from '../map/tileClearance.js';
import { Flags, hasFlags, setErrorText, checkCompanyCompatibility } from './gameCommands.js';
import { getObject, RoadObjectFlags } from './objects.js';
import { clearTreeCollision, clearBuildingCollision, bit } from './common.js';

const SLOPES = CommonTraitFlags.slope | CommonTraitFlags.steepSlope;
const err = (ctx, id) => { setErrorText(ctx, id); return ClearFuncResult.collisionErrorSet; };

function clearTrack(ctx, el, a, ls) {
  if (el.hasBridge()) {
    ls.bridgeSeen = el.bridge();
    if (getObject(ctx, 'bridge', el.bridge()).disabledTrackCfg & CommonTraitFlags.junction) return err(ctx, 'bridge_not_suitable_for_junction');
  }
  const trackObj = getObject(ctx, 'track', el.trackObjectId());
  const roadObj = getObject(ctx, 'road', a.roadObjectId);
  if (!(trackObj.compatibleRoads & bit(a.roadObjectId)) && !(roadObj.compatibleTracks & bit(el.trackObjectId()))) {
    return err(ctx, 'unable_to_cross_or_create_junction_with_string');
  }
  if (el.hasSignal()) return err(ctx, 'signal_in_the_way');
  if (el.hasStationElement()) return err(ctx, 'station_in_the_way');
  if (el.hasBridge() && el.bridge() !== a.bridgeId) return err(ctx, 'bridge_types_must_match');
  if (el.trackId() !== 0 || a.roadId !== 0 || !((el.rotation() - a.rotation) & 1) || el.baseHeight() !== a.pos.z) {
    return err(ctx, 'level_crossing_only_possible_with_straight_road_and_track_at_same_level');
  }
  ls.hasLevelCrossing = true;
  ls.f73 |= 4;
  if (!hasFlags(a.flags, Flags.aiAllocated | Flags.ghost) && hasFlags(a.flags, Flags.apply)) el.setHasLevelCrossing(true);
  return ClearFuncResult.noCollision;
}

/** Tram on top of road etc. */
function isPotentialOverlayRoad(el, a) {
  if (el.roadId() === a.roadId && el.rotation() === a.rotation && el.sequenceIndex() === a.index) return true;
  const m = getRoadMiscData(el.roadId());
  return m.reverseRoadId === a.roadId && (el.rotation() ^ 2) === a.rotation && (m.reverseLane - 1 - el.sequenceIndex()) === a.index;
}

function getRoadStationElement(tm, pos) {
  const baseZ = Math.trunc(pos.z / 4);
  for (const e of tm.get(pos)) {
    if (e instanceof StationElement && e.baseZ() === baseZ && e.stationType() === StationType.roadStation) return e;
  }
  return null;
}

function traitAndCompat(ctx, el, a, target, nw) {
  if (el.roadObjectId() === a.roadObjectId) {
    if (!(target.roadPieces & RoadTraitFlags.junction)) { setErrorText(ctx, 'junctions_not_possible'); return false; }
  } else if (!(target.compatibleRoads & bit(a.roadObjectId)) && !(nw.compatibleRoads & bit(el.roadObjectId()))) {
    setErrorText(ctx, 'unable_to_cross_or_create_junction_with_string'); return false;
  }
  return true;
}
function finalJunctionChecks(ctx, el, a, target, nw) {
  if (getRoadPiece(a.roadId).length > 1 || getRoadPiece(el.roadId()).length > 1) { setErrorText(ctx, 'junction_not_possible'); return false; }
  return traitAndCompat(ctx, el, a, target, nw);
}
function aiUnkCheck(ctx, el, a) {
  if (!(a.unkFlags & 0x30) || !hasFlags(a.flags, Flags.aiAllocated) || el.isAiAllocated()) return false;
  return !!((a.unkFlags & 0x10) || el.owner() === ctx.updatingCompanyId);
}

function clearRoad(ctx, el, a, ls) {
  const gs = ctx.tm.gameState;
  if (!el.isGhost() && !el.isAiAllocated()) ls.f73 |= 64;
  if (el.hasBridge()) ls.bridgeSeen = el.bridge();
  const tp = getRoadPiece(el.roadId())[el.sequenceIndex()];
  const np = getRoadPiece(a.roadId)[a.index];
  if (!(tp.connectFlags[el.rotation()] & np.connectFlags[a.rotation])) return ClearFuncResult.noCollision;
  const target = getObject(ctx, 'road', el.roadObjectId());
  const nw = getObject(ctx, 'road', a.roadObjectId);
  if (hasFlags(a.flags, Flags.aiAllocated) && (a.unkFlags & 0x10) && (target.flags & RoadObjectFlags.isOneWay)) return err(ctx, 'junctions_not_possible');
  if (!(gs.roadObjectIdIsUsableByAllCompanies & bit(el.roadObjectId())) || !(gs.roadObjectIdIsUsableByAllCompanies & bit(a.roadObjectId))) {
    if (!checkCompanyCompatibility(ctx, el.owner())) return ClearFuncResult.collisionErrorSet;
  }
  let confirmedOverlay = false;
  const aiUnk = aiUnkCheck(ctx, el, a);
  const elMisc = getRoadMiscData(el.roadId());
  if (el.baseHeight() === a.pos.z && (elMisc.flags & SLOPES) && isPotentialOverlayRoad(el, a)) {
    ls.f73 |= 32;
    if (el.roadObjectId() !== a.roadObjectId || aiUnk) confirmedOverlay = true;
  }
  if (!confirmedOverlay) {
    if ((elMisc.flags & SLOPES) || (getRoadMiscData(a.roadId).flags & SLOPES)) return err(ctx, 'junction_must_be_entirely_level');
    if (el.baseHeight() !== a.pos.z) return err(ctx, 'string_id_in_the_way_wrong_height_for_junction');
  }
  if (el.hasLevelCrossing()) ls.levelCrossingObjId = el.levelCrossingObjectId();
  if (el.hasSignalElement()) return err(ctx, 'signal_in_the_way');
  if (el.hasStationElement()) {
    if (a.roadId !== 0 || (a.rotation !== el.rotation() && a.rotation !== (el.rotation() ^ 2))) return err(ctx, 'station_in_the_way');
    const st = getRoadStationElement(ctx.tm, a.pos);
    if (st) {
      ls.stationId = st.stationId();
      if (nw.stations.includes(st.objectId())) ls.hasStation = true;
      if (!ls.hasStation && getObject(ctx, 'roadStation', st.objectId()).mods.includes(a.roadObjectId)) ls.hasStation = true;
      if (!ls.hasStation) return err(ctx, 'station_in_the_way');
    }
  }
  const isExact = a.roadId === el.roadId() && a.rotation === el.rotation() && a.index === el.sequenceIndex();
  const isReverseExact = !isExact && elMisc.reverseRoadId === a.roadId
    && ((elMisc.reverseRotation + el.rotation()) & 3) === a.rotation && elMisc.reverseLane === getRoadMiscData(a.roadId).reverseLane;
  const isConnectable = (el.sequenceIndex() === 0 && a.isLastIndex) || (el.sequenceIndex() !== 0 && el.isFlag6() && a.index === 0)
    || (el.sequenceIndex() !== 0 && !el.isFlag6() && el.sequenceIndex() === a.index);
  if (el.hasBridge()) {
    if (el.bridge() !== a.bridgeId) return err(ctx, 'bridge_types_must_match');
    if (getObject(ctx, 'bridge', a.bridgeId).disabledTrackCfg & CommonTraitFlags.junction) {
      if (a.roadObjectId === el.roadObjectId()) return err(ctx, 'bridge_not_suitable_for_junction');
      if (!isExact && (!isReverseExact || !isConnectable)) return err(ctx, 'bridge_not_suitable_for_junction');
    }
  }
  const markUnk = () => {
    if (el.roadObjectId() === a.roadObjectId) { ls.roadIdUnk[el.roadId()] |= bit(el.rotation()); ls.roadIdUnk[0] |= 0x80; }
  };
  const sameObjOverlay = () => {
    ls.f73 |= 32;
    if (el.roadObjectId() === a.roadObjectId) {
      if (aiUnk) {
        if (!finalJunctionChecks(ctx, el, a, target, nw)) return ClearFuncResult.collisionErrorSet;
        markUnk(); return ClearFuncResult.noCollision;
      }
      return err(ctx, 'already_built_here');
    }
    return traitAndCompat(ctx, el, a, target, nw) ? ClearFuncResult.noCollision : ClearFuncResult.collisionErrorSet;
  };
  if (isExact) return sameObjOverlay();
  if (isReverseExact && isConnectable) return sameObjOverlay();
  if (!finalJunctionChecks(ctx, el, a, target, nw)) return ClearFuncResult.collisionErrorSet;
  markUnk();
  return ClearFuncResult.noCollision;
}

export function roadClearFunction(ctx, el, a, ls, addCost) {
  if (el instanceof TrackElement) return clearTrack(ctx, el, a, ls);
  if (el instanceof StationElement) return el.stationType() === StationType.roadStation ? ClearFuncResult.noCollision : ClearFuncResult.collision;
  if (el.type() === ElementType.signal) return ClearFuncResult.noCollision;
  if (el.type() === ElementType.building) { ls.f73 |= 16; return clearBuildingCollision(ctx, el, a.pos, a.flags, addCost); }
  if (el.type() === ElementType.tree) return clearTreeCollision(ctx, el, a.flags, addCost);
  if (el instanceof RoadElement) return clearRoad(ctx, el, a, ls);
  return ClearFuncResult.collision;
}
