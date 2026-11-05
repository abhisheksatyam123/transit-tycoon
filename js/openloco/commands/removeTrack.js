/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/GameCommands/Track/RemoveTrack.cpp (removeTrack 0x0049C7F2, trackRemoveCost 0x0049CC23).
 * args: {pos, rotation, trackId, index, trackObjectId}. Signal / station sub-commands run through doCommand with the same flags.
 * Result cost is the REMOVAL cost (sell value, positive number = what the caller is charged by OpenLoco; see README).
 */
import { getTrackPiece, getTrackMiscData } from '../trackData.js';
import { Flags, FAILURE, SIGNAL_LEFT, SIGNAL_RIGHT, hasFlags, defineCommand, setPosition, doCommand,
  checkCompanyCompatibility, getInflationAdjustedCost, scaleByPieceCost } from './gameCommands.js';
import { getObject } from './objects.js';
import { findTrack, piecePos, pieceStart, setLevelCrossingFlags } from './common.js';
import { SignalElement } from '../map/transportElements.js';
import { removeSignalCommand } from './signals.js';
import { removeTrainStationCommand } from './trainStation.js';

/** getElTrackAt of RemoveTrack.cpp: also matches ghost/aiAllocated flags exactly. */
function elTrackAt(ctx, args, flags, pos, index) {
  return findTrack(ctx.tm, pos, (e) => e.rotation() === args.rotation && e.baseHeight() === pos.z && e.sequenceIndex() === index
    && e.trackObjectId() === args.trackObjectId && e.trackId() === args.trackId
    && e.isGhost() === hasFlags(flags, Flags.ghost) && e.isAiAllocated() === hasFlags(flags, Flags.aiAllocated)
    && !(e.owner() !== ctx.updatingCompanyId && hasFlags(flags, Flags.ghost)));
}

function trackRemoveCost(ctx, args, piece0, trackStart, flags) {
  const el = elTrackAt(ctx, args, flags, piecePos(trackStart, piece0, args.rotation), piece0.index);
  if (!el) return 0;
  const obj = getObject(ctx, 'track', el.trackObjectId());
  const misc = getTrackMiscData(args.trackId);
  let total = scaleByPieceCost(getInflationAdjustedCost(ctx, obj.sellCostFactor, obj.costIndex, 10), misc.costFactor);
  for (let i = 0; i < 4; i++) {
    if (el.hasMod(i)) {
      const extra = getObject(ctx, 'trackExtra', obj.mods[i]);
      total += scaleByPieceCost(getInflationAdjustedCost(ctx, extra.sellCostFactor, extra.costIndex, 10), misc.costFactor);
    }
  }
  return total;
}

function removeTrack(ctx, args, flags) {
  setPosition(ctx, args.pos);
  const tm = ctx.tm;
  let total = 0;
  let el = elTrackAt(ctx, args, flags, args.pos, args.index);
  if (!el) return FAILURE;
  if (!hasFlags(flags, Flags.ghost) && !checkCompanyCompatibility(ctx, el.owner())) return FAILURE;

  if (el.hasSignal()) {
    let sides = 0;
    const sig = el.next();
    if (sig instanceof SignalElement) {
      if (sig.getLeft().hasSignal()) sides |= SIGNAL_LEFT;
      if (sig.getRight().hasSignal()) sides |= SIGNAL_RIGHT;
    }
    const r = doCommand(ctx, removeSignalCommand, { pos: args.pos, rotation: args.rotation, index: args.index, trackId: args.trackId, trackObjType: args.trackObjectId, flags: sides }, flags);
    if (!r.ok) return FAILURE;
    total += r.cost;
  }
  el = elTrackAt(ctx, args, flags, args.pos, args.index); // pointer refresh in C++
  if (el.hasStationElement()) {
    const r = doCommand(ctx, removeTrainStationCommand, { pos: args.pos, rotation: args.rotation, trackId: args.trackId, index: args.index, type: args.trackObjectId }, flags);
    if (!r.ok) return FAILURE;
    total += r.cost;
  }

  const pieces = getTrackPiece(args.trackId);
  const trackStart = pieceStart(args.pos, pieces[args.index], args.rotation);
  const pieceCost = trackRemoveCost(ctx, args, pieces[0], trackStart, flags);
  let hadBridge = false, bridgeId = -1;
  for (const piece of pieces) {
    const loc = piecePos(trackStart, piece, args.rotation);
    const pe = elTrackAt(ctx, args, flags, loc, piece.index);
    if (!pe) return FAILURE;
    if (pe.hasBridge()) { hadBridge = true; bridgeId = pe.bridge(); }
    if (!hasFlags(flags, Flags.apply)) continue;
    tm.removeElement(pe);
    setLevelCrossingFlags(tm, loc);
  }
  total += pieceCost;
  if (hadBridge) {
    const b = getObject(ctx, 'bridge', bridgeId);
    total += scaleByPieceCost(getInflationAdjustedCost(ctx, b.sellCostFactor, b.costIndex, 10), getTrackMiscData(args.trackId).costFactor);
  }
  return total;
}
export const removeTrackCommand = defineCommand(removeTrack, 'removeTrack');
