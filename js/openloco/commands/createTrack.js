/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/GameCommands/Track/CreateTrack.cpp (createTrack 0x0049BB98, clearFunction 0x0049C275, clearTrack 0x0049C4FF,
 *         clearRoad 0x0049C401, isBridgeRequired). Same validation order, error ids and cost formula; see gameCommands.js
 *         for the result/ctx conventions. args: {pos:{x,y,z}, rotation, trackId, trackObjectId, mods=0, unkFlags=0, bridge=0xff}.
 * Not ported: checkFreeElementsAndReorganise, sounds, company observation/emotion, viewport invalidation.
 * Building clearing is delegated to ctx.hooks.clearBuilding (see common.js).
 */
import { getTrackPiece, getTrackMiscData } from '../trackData.js';
import { CommonTraitFlags, TrackTraitFlags } from '../trackEnum.js';
import { QuarterTile } from '../quarterTile.js';
import { ElementType } from '../map/elements.js';
import { TrackElement, RoadElement, StationElement, StationType, SignalElement } from '../map/transportElements.js';
import { ClearFuncResult, ElementPositionFlags } from '../map/tileClearance.js';
import { toTileSpace } from '../map/world.js';
import {
  Flags, FAILURE, hasFlags, defineCommand, setPosition, setErrorText, getInflationAdjustedCost, scaleByPieceCost,
  checkCompanyCompatibility,
} from './gameCommands.js';
import { getObject } from './objects.js';
import {
  NO_BRIDGE, bit, rotl4bit, piecePos, isBridgeRequired, clearAt, removeAllWallsOnTileBelow, removeSurfaceIndustryAtHeight,
  setTerrainStyleAsClearedAtHeight, clearTreeCollision, clearBuildingCollision,
} from './common.js';

const SLOPES = CommonTraitFlags.slope | CommonTraitFlags.steepSlope;
const collisionSet = (ctx, id) => { setErrorText(ctx, id); return ClearFuncResult.collisionErrorSet; };

function clearTrack(ctx, el, a, rs) {
  const target = getTrackPiece(el.trackId())[el.sequenceIndex()];
  const nw = getTrackPiece(a.trackId)[a.index];
  if (!(target.connectFlags[el.rotation()] & nw.connectFlags[a.rotation])) return ClearFuncResult.noCollision;
  if (a.unkFlags & 4) return collisionSet(ctx, 'junctions_not_possible');
  if (!checkCompanyCompatibility(ctx, el.owner())) return ClearFuncResult.collisionErrorSet;
  if ((getTrackMiscData(el.trackId()).flags & SLOPES) || (getTrackMiscData(a.trackId).flags & SLOPES)) return collisionSet(ctx, 'junction_must_be_entirely_level');
  const targetObj = getObject(ctx, 'track', el.trackObjectId());
  const trackObj = getObject(ctx, 'track', a.trackObjectId);
  if (el.baseHeight() !== a.pos.z) return collisionSet(ctx, 'string_id_in_the_way_wrong_height_for_junction');
  if (el.hasSignal()) return collisionSet(ctx, 'signal_in_the_way');
  if (el.hasStationElement()) return collisionSet(ctx, 'station_in_the_way');
  if (!((a.rotation ^ el.rotation()) & 1)) {
    if ((getTrackMiscData(el.trackId()).flags ^ getTrackMiscData(a.trackId).flags) & CommonTraitFlags.oneSided) return collisionSet(ctx, 'track_combination_not_possible');
  }
  if (el.hasBridge()) {
    if (el.bridge() !== a.bridgeId) return collisionSet(ctx, 'bridge_types_must_match');
    if (getObject(ctx, 'bridge', a.bridgeId).disabledTrackCfg & CommonTraitFlags.junction) return collisionSet(ctx, 'bridge_not_suitable_for_junction');
  }
  if (el.trackObjectId() === a.trackObjectId) {
    if (el.trackId() === a.trackId && el.rotation() === a.rotation && el.sequenceIndex() === a.index) return collisionSet(ctx, 'already_built_here');
    const misc = getTrackMiscData(el.trackId());
    if (misc.reverseTrackId === a.trackId && ((misc.reverseRotation + el.rotation()) & 3) === a.rotation && a.isLastIndex && el.sequenceIndex() === 0) {
      return collisionSet(ctx, 'already_built_here');
    }
    if (!(targetObj.trackPieces & TrackTraitFlags.junction)) return collisionSet(ctx, 'junctions_not_possible');
  } else if (!(targetObj.compatibleTracks & bit(a.trackObjectId)) && !(trackObj.compatibleTracks & bit(el.trackObjectId()))) {
    return collisionSet(ctx, 'unable_to_cross_or_create_junction_with_string');
  }
  rs.junction = true;
  return ClearFuncResult.noCollision;
}

function clearRoad(ctx, el, a, rs) {
  if (el.hasBridge() && (getObject(ctx, 'bridge', el.bridge()).disabledTrackCfg & CommonTraitFlags.junction)) return collisionSet(ctx, 'bridge_not_suitable_for_junction');
  const roadObj = getObject(ctx, 'road', el.roadObjectId());
  const trackObj = getObject(ctx, 'track', a.trackObjectId);
  if (!(roadObj.compatibleTracks & bit(a.trackObjectId)) && !(trackObj.compatibleRoads & bit(el.roadObjectId()))) return collisionSet(ctx, 'unable_to_cross_or_create_junction_with_string');
  if (el.hasSignalElement()) return collisionSet(ctx, 'signal_in_the_way');
  if (el.hasStationElement()) return collisionSet(ctx, 'station_in_the_way');
  if (el.hasBridge() && el.bridge() !== a.bridgeId) return collisionSet(ctx, 'bridge_types_must_match');
  if (el.roadId() !== 0 || a.trackId !== 0 || !((el.rotation() - a.rotation) & 1) || el.baseHeight() !== a.pos.z) {
    return collisionSet(ctx, 'level_crossing_only_possible_with_straight_road_and_track_at_same_level');
  }
  rs.hasLevelCrossing = true;
  if (!hasFlags(a.flags, Flags.aiAllocated | Flags.ghost) && hasFlags(a.flags, Flags.apply)) {
    el.setHasLevelCrossing(true); el.setLevelCrossingObjectId(ctx.currentDefaultLevelCrossingType);
    el.setLevelCrossingClosed(false); el.setLevelCrossingAnimationFrame(0);
  }
  return ClearFuncResult.noCollision;
}

function clearFunction(ctx, el, a, rs, addCost) {
  if (el instanceof TrackElement) return clearTrack(ctx, el, a, rs);
  if (el instanceof StationElement) return el.stationType() === StationType.trainStation ? ClearFuncResult.noCollision : ClearFuncResult.collision;
  if (el instanceof SignalElement) return ClearFuncResult.noCollision;
  if (el.type() === ElementType.building) { rs.building = true; return clearBuildingCollision(ctx, el, a.pos, a.flags, addCost); }
  if (el.type() === ElementType.tree) return clearTreeCollision(ctx, el, a.flags, addCost);
  if (el instanceof RoadElement) return clearRoad(ctx, el, a, rs);
  return ClearFuncResult.collision;
}

/** createTrack: place a track piece sequence. @returns cost (or FAILURE) */
function createTrack(ctx, args, flags) {
  const { tm } = ctx;
  setPosition(ctx, args.pos);
  const bridgeArg = args.bridge ?? NO_BRIDGE;
  const company = ctx.updatingCompanyId;
  const rs = { posFlags: ElementPositionFlags.none, bridgeCost: false, bridgeHere: false, maxHeightDiff: 0, water: false };
  const trackObj = getObject(ctx, 'track', args.trackObjectId);
  const misc = getTrackMiscData(args.trackId);
  let validMods = args.mods || 0;
  for (let i = 0; i < 4; i++) {
    if ((args.mods || 0) & bit(i)) {
      const extra = getObject(ctx, 'trackExtra', trackObj.mods[i]);
      if ((misc.compatibleFlags & extra.trackPieces) !== misc.compatibleFlags) validMods &= ~bit(i);
    }
  }
  if (misc.flags & CommonTraitFlags.startsAtHalfHeight) { if ((args.pos.z & 0xf) !== 8) return FAILURE; } else if (args.pos.z & 0xf) return FAILURE;

  let totalCost = scaleByPieceCost(getInflationAdjustedCost(ctx, trackObj.buildCostFactor, trackObj.costIndex, 10), misc.costFactor);
  for (let i = 0; i < 4; i++) {
    if (validMods & bit(i)) {
      const extra = getObject(ctx, 'trackExtra', trackObj.mods[i]);
      totalCost += scaleByPieceCost(getInflationAdjustedCost(ctx, extra.buildCostFactor, extra.costIndex, 10), misc.costFactor);
    }
  }
  const addCost = (n) => { totalCost += n; };
  const pieces = getTrackPiece(args.trackId);

  for (const piece of pieces) {
    const loc = piecePos(args.pos, piece, args.rotation);
    const qt = QuarterTile.fromRaw(piece.quarterTile).rotate(args.rotation);
    const unk = rotl4bit(piece.flags & 0xf, args.rotation);
    if (loc.z < 16) { setErrorText(ctx, 'error_too_low'); return FAILURE; }
    const baseZ = Math.trunc(loc.z / 4);
    let clearZ = baseZ + Math.trunc((piece.clearZ + 32) / 4);
    rs.bridgeHere = false;
    if (tm.validCoords(loc)) {
      const surf = tm.get(loc).surface();
      if (surf.water()) rs.water = true;
      if (isBridgeRequired(baseZ, surf, piece, unk)) {
        rs.bridgeHere = true; rs.bridgeCost = true;
        const heightDiff = Math.trunc((baseZ - surf.baseZ()) / 4);
        if (bridgeArg === NO_BRIDGE) { setErrorText(ctx, 'bridge_needed'); return FAILURE; }
        const bridgeObj = getObject(ctx, 'bridge', bridgeArg);
        if (heightDiff > bridgeObj.maxHeight) { setErrorText(ctx, 'too_far_above_ground_for_bridge_type'); return FAILURE; }
        rs.maxHeightDiff = Math.max(heightDiff, rs.maxHeightDiff);
        if (bridgeObj.disabledTrackCfg & misc.flags) { setErrorText(ctx, 'bridge_type_unsuitable_for_this_configuration'); return FAILURE; }
        clearZ += Math.trunc(bridgeObj.clearHeight / 4);
      }
    }
    if (clearZ > 236) { setErrorText(ctx, 'error_too_high'); return FAILURE; }

    const a = {
      pos: loc, rotation: args.rotation, trackId: args.trackId, unkFlags: args.unkFlags || 0, bridgeId: bridgeArg,
      trackObjectId: args.trackObjectId, index: piece.index, isLastIndex: piece.index === pieces.length - 1, flags,
    };
    const ls = { hasLevelCrossing: false, junction: false, building: false };
    const r = clearAt(ctx, loc, baseZ, clearZ, qt, (el) => clearFunction(ctx, el, a, ls, addCost));
    if (!r.ok) return FAILURE;
    if (ls.hasLevelCrossing) {
      const lc = getObject(ctx, 'levelCrossing', ctx.currentDefaultLevelCrossingType);
      totalCost += getInflationAdjustedCost(ctx, lc.costFactor, lc.costIndex, 10);
    }
    if (hasFlags(flags, Flags.apply) && !hasFlags(flags, Flags.ghost | Flags.aiAllocated)) removeAllWallsOnTileBelow(tm, toTileSpace(loc), baseZ);

    const newGround = r.positionFlags & (ElementPositionFlags.aboveGround | ElementPositionFlags.underground);
    if (rs.posFlags !== ElementPositionFlags.none && (rs.posFlags & newGround) === ElementPositionFlags.none) { setErrorText(ctx, 'cant_build_partly_above_partly_below_ground'); return FAILURE; }
    rs.posFlags = newGround;
    if (r.positionFlags & ElementPositionFlags.partiallyUnderwater) { setErrorText(ctx, 'cant_build_this_underwater'); return FAILURE; }
    if (r.positionFlags & ElementPositionFlags.underwater) { setErrorText(ctx, 'too_close_to_water_surface'); return FAILURE; }
    if (!hasFlags(flags, Flags.apply)) continue;

    if (!hasFlags(flags, Flags.ghost | Flags.aiAllocated)) { removeSurfaceIndustryAtHeight(ctx, loc); setTerrainStyleAsClearedAtHeight(tm, loc); }
    const el = tm.insertElement(ElementType.track, loc, baseZ, qt.getBaseQuarterOccupied());
    if (!el) return FAILURE;
    el.setClearZ(clearZ); el.setRotation(args.rotation); el.setTrackObjectId(args.trackObjectId); el.setSequenceIndex(piece.index);
    el.setTrackId(args.trackId); el.setOwner(company);
    for (let i = 0; i < 4; i++) if (validMods & bit(i)) el.setMod(i, true);
    el.setBridgeObjectId(bridgeArg); el.setHasBridge(rs.bridgeHere);
    el.setHasLevelCrossing(ls.hasLevelCrossing);
    el.setFlag6(piece.index === pieces.length - 1);
    el.setGhost(hasFlags(flags, Flags.ghost)); el.setAiAllocated(hasFlags(flags, Flags.aiAllocated));
  }

  if (rs.bridgeCost) {
    const bridgeObj = getObject(ctx, 'bridge', bridgeArg);
    const heightCost = rs.maxHeightDiff * bridgeObj.heightCostFactor;
    let cost = scaleByPieceCost(getInflationAdjustedCost(ctx, bridgeObj.baseCostFactor + heightCost, bridgeObj.costIndex, 10), misc.costFactor);
    if (rs.water) cost *= 2;
    totalCost += cost;
  }
  if (rs.posFlags & ElementPositionFlags.underground) {
    totalCost += scaleByPieceCost(getInflationAdjustedCost(ctx, trackObj.tunnelCostFactor, 2, 8), misc.costFactor);
  }
  return totalCost;
}
export const createTrackCommand = defineCommand(createTrack, 'createTrack');
