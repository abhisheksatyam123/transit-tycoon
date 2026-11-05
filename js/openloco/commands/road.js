/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/GameCommands/Road/CreateRoad.cpp (createRoad 0x00475FBC). Clearance callbacks live in roadClear.js.
 * args: {pos, rotation, roadId, roadObjectId, mods=0, unkFlags=0, bridge=0xff}.
 * Not ported: checkFreeElementsAndReorganise, company observation/emotion, construction sound, scenario "madeAnyChanges", invalidation.
 * Station label/mode recalculation is ctx.stations.recalculateStation. Building clearing is ctx.hooks.clearBuilding (see common.js).
 */
import { getRoadPiece, getRoadMiscData, getTrackMiscData } from '../trackData.js';
import { CommonTraitFlags } from '../trackEnum.js';
import { QuarterTile } from '../quarterTile.js';
import { ElementType } from '../map/elements.js';
import { ElementPositionFlags } from '../map/tileClearance.js';
import { toTileSpace } from '../map/world.js';
import { COMPANY_NEUTRAL, Flags, FAILURE, hasFlags, defineCommand, setPosition, setErrorText, getInflationAdjustedCost, scaleByPieceCost } from './gameCommands.js';
import { getObject, RoadObjectFlags } from './objects.js';
import { NO_BRIDGE, bit, rotl4bit, piecePos, isBridgeRequired, clearAt, removeAllWallsOnTileBelow, removeSurfaceIndustryAtHeight,
  setTerrainStyleAsClearedAtHeight } from './common.js';
import { roadClearFunction } from './roadClear.js';

/** requiresAdditional{Left,Right,Straight1,Straight2} of the 0x47656B junction-addition block. u = roadIdUnk, r0..r3 = rotation bits. */
const needsLeft = (u, r0, r1, r2, r3) => !!(((u[0] & r0) && ((u[0] & r3) || (u[0] & r1) || (u[1] & r1) || (u[2] & r2)))
  || ((u[0] & r2) && (u[0] & r3)) || ((u[0] & r3) && ((u[2] & r0) || (u[1] & r3)))
  || ((u[2] & r0) && ((u[1] & r1) || (u[2] & r2))) || ((u[1] & r3) && ((u[1] & r1) || (u[2] & r2)))
  || ((u[0] & r1) && (u[2] & r0)));
const needsRight = (u, r0, r1, r2, r3) => !!(((u[0] & r2) && ((u[2] & r2) || (u[1] & r1)))
  || ((u[1] & r0) && ((u[1] & r2) || (u[2] & r3))) || ((u[2] & r1) && ((u[1] & r2) || (u[2] & r3)))
  || ((u[0] & r1) && ((u[0] & r2) || (u[1] & r3))));
const needsStraight1 = (u, r0, r1, r2, r3) => !!(((u[1] & r0) && ((u[1] & r1) || (u[2] & r2)))
  || ((u[2] & r0) && ((u[1] & r1) || (u[2] & r2))) || ((u[1] & r3) && ((u[1] & r1) || (u[2] & r2)))
  || ((u[1] & r0) && ((u[1] & r2) || (u[2] & r3))) || ((u[2] & r1) && ((u[1] & r2) || (u[2] & r3)))
  || ((u[2] & r1) && (u[1] & r1)));
const needsStraight2 = (u, r0, r1, r2) => !!((u[2] & r1) && (u[2] & r2));

function addJunctionPieces(ctx, args, flags, roadIdUnk, validMods, companyId, hasBridgeBit) {
  const tm = ctx.tm;
  const place = (rotation, roadId) => {
    removeSurfaceIndustryAtHeight(ctx, args.pos);
    setTerrainStyleAsClearedAtHeight(tm, args.pos);
    const el = tm.insertElement(ElementType.road, args.pos, Math.trunc(args.pos.z / 4), 0xf);
    if (!el) return;
    el.setClearZ(Math.trunc(args.pos.z / 4) + 8);
    el.setRotation(rotation & 3); el.setRoadObjectId(args.roadObjectId); el.setSequenceIndex(0); el.setRoadId(roadId); el.setOwner(companyId);
    for (let i = 0; i < 2; i++) if (validMods & bit(i)) el.setMod(i, true);
    el.setBridgeObjectId(args.bridge ?? NO_BRIDGE); el.setHasBridge(hasBridgeBit);
    el.setFlag6(true); el.setGhost(hasFlags(flags, Flags.ghost)); el.setAiAllocated(hasFlags(flags, Flags.aiAllocated));
  };
  for (let i = 0; i < 4; i++) {
    const r0 = bit(i), r1 = bit((i + 1) & 3), r2 = bit((i + 2) & 3), r3 = bit((i + 3) & 3);
    const u = roadIdUnk;
    if (needsLeft(u, r0, r1, r2, r3) && !(u[2] & r1)) { const p = !(u[1] & r0); u[1] |= r0; if (p) place(i, 1); }
    if (needsRight(u, r0, r1, r2, r3) && !(u[1] & r0)) { const p = !(u[2] & r1); u[2] |= r1; if (p) place(i + 1, 2); }
    if (needsStraight1(u, r0, r1, r2, r3) && !(u[0] & r2)) { const p = !(u[0] & r0); u[0] |= r0; if (p) place(i, 0); }
    if (needsStraight2(u, r0, r1, r2) && !(u[0] & r2)) { const p = !(u[0] & r0); u[0] |= r0; if (p) place(i, 0); }
  }
}

function createRoad(ctx, args, flags) {
  const { tm } = ctx;
  setPosition(ctx, args.pos);
  const bridgeArg = args.bridge ?? NO_BRIDGE;
  const rs = { posFlags: ElementPositionFlags.none, f73: 0, maxHeightDiff: 0 };
  const companyId = ctx.editorMode ? COMPANY_NEUTRAL : ctx.updatingCompanyId;
  const roadObj = getObject(ctx, 'road', args.roadObjectId);
  const misc = getRoadMiscData(args.roadId);
  let validMods = args.mods || 0;
  for (let i = 0; i < 2; i++) {
    if (validMods & bit(i)) {
      const extra = getObject(ctx, 'roadExtra', roadObj.mods[i]);
      if ((misc.compatibleFlags & extra.roadPieces) !== misc.compatibleFlags) validMods &= ~bit(i);
    }
  }
  if (args.pos.z & 0xf) return FAILURE;

  let totalCost = scaleByPieceCost(getInflationAdjustedCost(ctx, roadObj.buildCostFactor, roadObj.costIndex, 10), misc.costFactor);
  for (let i = 0; i < 2; i++) {
    if (validMods & bit(i)) {
      const extra = getObject(ctx, 'roadExtra', roadObj.mods[i]);
      totalCost += scaleByPieceCost(getInflationAdjustedCost(ctx, extra.buildCostFactor, extra.costIndex, 10), misc.costFactor);
    }
  }
  const addCost = (n) => { totalCost += n; };
  const pieces = getRoadPiece(args.roadId);
  let hasStation = false, stationId = 0xffff;
  const roadIdUnk = new Array(16).fill(0);
  roadIdUnk[args.roadId] |= bit(args.rotation);
  const gs = tm.gameState;

  for (const piece of pieces) {
    const loc = piecePos(args.pos, piece, args.rotation);
    const qt = QuarterTile.fromRaw(piece.quarterTile).rotate(args.rotation);
    const unk = rotl4bit(piece.flags & 0xf, args.rotation);
    if (loc.z < 16) { setErrorText(ctx, 'error_too_low'); return FAILURE; }
    const baseZ = Math.trunc(loc.z / 4);
    let clearZ = baseZ + Math.trunc((piece.clearZ + 32) / 4);
    rs.f73 &= ~2;
    if (tm.validCoords(loc)) {
      const surf = tm.get(loc).surface();
      if (surf.water()) rs.f73 |= 128;
      if (isBridgeRequired(baseZ, surf, piece, unk)) {
        rs.f73 |= 3;
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

    const a = { pos: loc, rotation: args.rotation, roadId: args.roadId, bridgeId: bridgeArg, roadObjectId: args.roadObjectId,
      index: piece.index, isLastIndex: piece.index === pieces.length - 1, flags, unkFlags: args.unkFlags || 0 };
    const ls = { hasLevelCrossing: false, levelCrossingObjId: 0xff, hasStation: false, stationId: 0xffff, roadIdUnk, f73: rs.f73 };
    const r = clearAt(ctx, loc, baseZ, clearZ, qt, (el) => roadClearFunction(ctx, el, a, ls, addCost));
    rs.f73 = ls.f73;
    hasStation = hasStation || ls.hasStation;
    if (ls.stationId !== 0xffff) stationId = ls.stationId;
    if (!r.ok) return FAILURE;
    const lcId = ls.levelCrossingObjId === 0xff ? ctx.currentDefaultLevelCrossingType : ls.levelCrossingObjId;
    if (ls.hasLevelCrossing) {
      const lc = getObject(ctx, 'levelCrossing', lcId);
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
    const el = tm.insertElementRoad(loc, baseZ, qt.getBaseQuarterOccupied());
    if (!el) return FAILURE;
    el.setClearZ(clearZ); el.setRotation(args.rotation); el.setRoadObjectId(args.roadObjectId); el.setSequenceIndex(piece.index);
    el.setRoadId(args.roadId); el.setOwner(companyId);
    for (let i = 0; i < 2; i++) if (validMods & bit(i)) el.setMod(i, true);
    if ((gs.roadObjectIdIsAnyRoadTypeCompatible & bit(args.roadObjectId)) && companyId !== COMPANY_NEUTRAL) el.setUnk7_40(true);
    el.setBridgeObjectId(bridgeArg); el.setHasBridge(!!(rs.f73 & 2));
    if (ls.hasLevelCrossing && !hasFlags(flags, Flags.aiAllocated)) { el.setHasLevelCrossing(true); el.setLevelCrossingObjectId(lcId); }
    else { el.setHasLevelCrossing(false); el.setLevelCrossingObjectId(0); }
    el.setHasStationElement(hasStation);
    el.setFlag6(piece.index === pieces.length - 1);
    el.setGhost(hasFlags(flags, Flags.ghost)); el.setAiAllocated(hasFlags(flags, Flags.aiAllocated));
  }

  if (hasFlags(flags, Flags.apply) && !hasFlags(flags, Flags.aiAllocated | Flags.ghost) && (roadIdUnk[0] & 0x80)
    && (roadObj.flags & RoadObjectFlags.allowsJunctions)) {
    addJunctionPieces(ctx, args, flags, roadIdUnk, validMods, companyId, !!(rs.f73 & 2));
  }
  if ((rs.f73 & 1) && !(rs.f73 & 64)) {
    const b = getObject(ctx, 'bridge', bridgeArg);
    let cost = scaleByPieceCost(getInflationAdjustedCost(ctx, b.baseCostFactor + rs.maxHeightDiff * b.heightCostFactor, b.costIndex, 10), misc.costFactor);
    if (rs.f73 & 128) cost *= 2;
    totalCost += cost;
  }
  if ((rs.posFlags & ElementPositionFlags.underground) && !(rs.f73 & 64)) {
    // CreateRoad.cpp reads getTrackMiscData(roadId) here (not getRoadMiscData); kept as is.
    totalCost += scaleByPieceCost(getInflationAdjustedCost(ctx, roadObj.tunnelCostFactor, 2, 8), getTrackMiscData(args.roadId).costFactor);
  }
  if (hasFlags(flags, Flags.apply) && hasStation && ctx.stations) ctx.stations.recalculateStation(stationId);
  return totalCost;
}
export const createRoadCommand = defineCommand(createRoad, 'createRoad');
