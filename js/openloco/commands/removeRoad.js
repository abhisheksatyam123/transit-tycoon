/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/GameCommands/Road/RemoveRoad.cpp (removeRoad 0x004775A5, roadRemoveCost 0x00477A10).
 * args: {pos, rotation, roadId, sequenceIndex, objectId}. Returns the removal (sell) cost as a positive number like the C++.
 * The road-station sub-command runs through doCommand with the same flags. Not ported: removal sound, madeAnyChanges, invalidation.
 */
import { getRoadPiece, getRoadMiscData } from '../trackData.js';
import { RoadElement } from '../map/transportElements.js';
import { COMPANY_NEUTRAL, Flags, FAILURE, hasFlags, defineCommand, setPosition, doCommand, checkCompanyCompatibility,
  getInflationAdjustedCost, scaleByPieceCost } from './gameCommands.js';
import { getObject, RoadObjectFlags } from './objects.js';
import { findRoad, piecePos, pieceStart, setLevelCrossingFlags } from './common.js';
import { removeRoadStationCommand } from './roadStation.js';

/** getRoadElement of RemoveRoad.cpp (matches ghost/ai flags exactly; ghost needs the same owner). */
function getRoadElement(ctx, args, pos, seq, flags) {
  const baseZ = Math.trunc(pos.z / 4);
  const companyId = ctx.editorMode ? COMPANY_NEUTRAL : ctx.updatingCompanyId;
  for (const e of ctx.tm.get(pos)) {
    if (!(e instanceof RoadElement) || e.baseZ() !== baseZ || e.rotation() !== args.rotation || e.sequenceIndex() !== seq
      || e.roadObjectId() !== args.objectId || e.roadId() !== args.roadId || e.isGhost() !== hasFlags(flags, Flags.ghost)
      || e.isAiAllocated() !== hasFlags(flags, Flags.aiAllocated)) continue;
    if (hasFlags(flags, Flags.ghost) && e.owner() !== companyId) return null;
    return e;
  }
  return null;
}

/** OverlapRoads: first run of consecutive road elements at pos.z/4 (the C++ range). */
function overlapRoads(tm, pos) {
  const out = [];
  for (const e of tm.get(pos)) {
    if (!(e instanceof RoadElement) || e.baseZ() !== Math.trunc(pos.z / 4)) { if (out.length) break; continue; }
    out.push(e);
  }
  return out;
}

function roadRemoveCost(ctx, args, piece0, roadStart, flags) {
  const el = getRoadElement(ctx, args, piecePos(roadStart, piece0, args.rotation), piece0.index, flags);
  if (!el) return 0;
  const obj = getObject(ctx, 'road', el.roadObjectId());
  const misc = getRoadMiscData(args.roadId);
  let total = 0;
  if (el.owner() !== COMPANY_NEUTRAL) total += scaleByPieceCost(getInflationAdjustedCost(ctx, obj.sellCostFactor, obj.costIndex, 10), misc.costFactor);
  if (!(obj.flags & RoadObjectFlags.anyRoadTypeCompatible)) {
    for (let i = 0; i < 2; i++) {
      if (el.hasMod(i)) {
        const extra = getObject(ctx, 'roadExtra', obj.mods[i]);
        total += scaleByPieceCost(getInflationAdjustedCost(ctx, extra.sellCostFactor, extra.costIndex, 10), misc.costFactor);
      }
    }
  }
  return total;
}

function removeRoad(ctx, args, flags) {
  setPosition(ctx, args.pos);
  const tm = ctx.tm;
  let el = getRoadElement(ctx, args, args.pos, args.sequenceIndex, flags);
  if (!el) return FAILURE;
  const owner = el.owner();
  if (!checkCompanyCompatibility(ctx, owner)) return FAILURE;
  let total = 0;
  if (el.hasStationElement()) {
    const others = overlapRoads(tm, args.pos).some((o) => o !== el && o.hasStationElement());
    if (!others) {
      const st = tm.get(args.pos).roadStation(el.roadId(), el.rotation(), el.baseZ());
      if (st && !st.isGhost()) {
        const r = doCommand(ctx, removeRoadStationCommand, { pos: args.pos, rotation: args.rotation, roadId: args.roadId, index: args.sequenceIndex, roadObjectId: args.objectId }, flags);
        if (!r.ok) return FAILURE;
        total += r.cost;
      }
    }
  }
  let removeBridge = false, bridgeId = -1;
  const pieces = getRoadPiece(args.roadId);
  const roadStart = pieceStart(args.pos, pieces[args.sequenceIndex], args.rotation);
  const pieceCost = roadRemoveCost(ctx, args, pieces[0], roadStart, flags);
  for (const piece of pieces) {
    const loc = piecePos(roadStart, piece, args.rotation);
    const pe = getRoadElement(ctx, args, loc, piece.index, flags);
    if (!pe) continue;
    if (pe.hasBridge()) { removeBridge = overlapRoads(tm, args.pos).length === 1; bridgeId = pe.bridge(); }
    if (!hasFlags(flags, Flags.apply)) continue;
    tm.removeElement(pe);
    setLevelCrossingFlags(tm, loc);
  }
  total += pieceCost;
  if (removeBridge && owner !== COMPANY_NEUTRAL) {
    const b = getObject(ctx, 'bridge', bridgeId);
    total += scaleByPieceCost(getInflationAdjustedCost(ctx, b.sellCostFactor, b.costIndex, 10), getRoadMiscData(args.roadId).costFactor);
  }
  return total;
}
export const removeRoadCommand = defineCommand(removeRoad, 'removeRoad');
