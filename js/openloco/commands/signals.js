/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/GameCommands/Track/CreateSignal.cpp (0x00488BDB), RemoveSignal.cpp (0x004891E4),
 *         CreateSignalsAuto.cpp, RemoveSignalsAuto.cpp, AutoSignals.h (autoSignalsWalk / autoPlaceSignals).
 * args create: {pos, rotation, trackId, index, type (signal object id), trackObjType, sides (SIGNAL_LEFT|SIGNAL_RIGHT)}
 * args remove: {pos, rotation, trackId, index, trackObjType, flags (sides)}; auto variants add `step` (tiles between signals).
 * Skipped: AnimationManager, Vehicles::sub_4A2AD7 (signal occupancy recompute) -> optional ctx.hooks.onSignalsChanged(pos, tad, company, trackObjType).
 */
import { getTrackPiece } from '../trackData.js';
import { AdditionalTaDFlags } from '../trackEnum.js';
import { getTrackConnectionEnd, getTrackConnections, validateTrackIsSignalCompatible } from '../map/track.js';
import { iterateTrackToJunction } from '../trackIteration.js';
import { ElementType } from '../map/elements.js';
import { SignalElement } from '../map/transportElements.js';
import { Flags, FAILURE, SIGNAL_LEFT, SIGNAL_RIGHT, hasFlags, defineCommand, setPosition, setErrorText, doCommand,
  checkCompanyCompatibility, getInflationAdjustedCost } from './gameCommands.js';
import { getObject } from './objects.js';
import { findTrackPiece, findTrack, piecePos, pieceStart, addPos3 } from './common.js';
import { getUnkTrack } from '../trackData.js';
import { ROTATION_OFFSET } from '../trackEnum.js';
import { REVERSE_ROTATION } from '../map/world.js';

const BOTH = SIGNAL_LEFT | SIGNAL_RIGHT;

function signalCost(ctx, args, piece0, trackStart) {
  const el = findTrackPiece(ctx.tm, piecePos(trackStart, piece0, args.rotation), args.rotation, piece0.index, args.trackObjType, args.trackId);
  if (!el) return 0;
  const obj = getObject(ctx, 'signal', args.type);
  const base = getInflationAdjustedCost(ctx, obj.costFactor, obj.costIndex, 10);
  let total = 0;
  const side = (bitMask, get) => {
    if (!(args.sides & bitMask)) return;
    total += base;
    if (!el.hasSignal()) return;
    const next = el.next();
    if (next instanceof SignalElement && get(next).hasSignal()) {
      const s = get(next);
      if (s.signalObjectId() === args.type) total -= base;
      else { const old = getObject(ctx, 'signal', s.signalObjectId()); total += getInflationAdjustedCost(ctx, old.sellCostFactor, old.costIndex, 10); }
    }
  };
  side(SIGNAL_LEFT, (n) => n.getLeft());
  side(SIGNAL_RIGHT, (n) => n.getRight());
  return total;
}

function createSignal(ctx, args, flags) {
  const { tm } = ctx;
  setPosition(ctx, args.pos);
  const first = findTrackPiece(tm, args.pos, args.rotation, args.index, args.trackObjType, args.trackId);
  if (!first) return FAILURE;
  if (first.hasLevelCrossing()) { setErrorText(ctx, 'level_crossing_in_the_way'); return FAILURE; }
  if (!checkCompanyCompatibility(ctx, first.owner())) return FAILURE;
  const pieces = getTrackPiece(args.trackId);
  const trackStart = pieceStart(args.pos, pieces[args.index], args.rotation);
  const err = validateTrackIsSignalCompatible(tm, trackStart, args.rotation, args.trackId, args.trackObjType);
  if (err) { setErrorText(ctx, err); return FAILURE; }
  const total = signalCost(ctx, args, pieces[0], trackStart);
  let sides = args.sides;
  const ghost = hasFlags(flags, Flags.ghost);
  for (const piece of pieces) {
    const loc = piecePos(trackStart, piece, args.rotation);
    const track = findTrackPiece(tm, loc, args.rotation, piece.index, args.trackObjType, args.trackId);
    if (!track) return FAILURE;
    if (ghost && track.hasSignal()) {
      const s = track.next();
      if (s instanceof SignalElement) { if (s.getLeft().hasSignal()) sides &= ~SIGNAL_LEFT; if (s.getRight().hasSignal()) sides &= ~SIGNAL_RIGHT; }
    }
    if (!hasFlags(flags, Flags.apply)) continue;
    if (!track.hasSignal()) {
      const sig = tm.insertElementAfterNoReorg(track, ElementType.signal, track.baseZ(), track.occupiedQuarter());
      if (!sig) return FAILURE;
      sig.setRotation(track.rotation()); sig.setGhost(ghost); sig.setAiAllocated(hasFlags(flags, Flags.aiAllocated)); sig.setClearZ(track.clearZ());
      sig.bytes.fill(0, 4, 8); // Side{} defaults
      track.setHasSignal(true);
    }
    const sig = track.next();
    if (!(sig instanceof SignalElement)) return FAILURE;
    const put = (bitMask, side, setGhost) => {
      if (!(sides & bitMask)) return;
      if (ghost && side.hasSignal()) return;
      side.setHasSignal(true); setGhost(ghost); side.setSignalObjectId(args.type); side.setFrame(0); side.setAllLights(0);
    };
    put(SIGNAL_LEFT, sig.getLeft(), (g) => sig.setLeftGhost(g));
    put(SIGNAL_RIGHT, sig.getRight(), (g) => sig.setRightGhost(g));
  }
  if (hasFlags(flags, Flags.apply) && !hasFlags(flags, Flags.aiAllocated | Flags.ghost) && ctx.hooks.onSignalsChanged) {
    const tad = args.rotation | (args.trackId << 3);
    const { nextPos, nextRotation } = getTrackConnectionEnd(trackStart, tad);
    const tc = getTrackConnections(tm, nextPos, nextRotation, ctx.updatingCompanyId, args.trackObjType, 0, 0);
    if (tc.connections.length) ctx.hooks.onSignalsChanged(nextPos, tc.connections[0] & AdditionalTaDFlags.basicTaDWithSignalMask, ctx.updatingCompanyId, args.trackObjType);
    const size = getUnkTrack(tad);
    let next = addPos3(trackStart, size.pos);
    if (size.rotationEnd < 12) { const o = ROTATION_OFFSET[size.rotationEnd]; next = { x: next.x - o.x, y: next.y - o.y, z: next.z }; }
    const tc2 = getTrackConnections(tm, next, REVERSE_ROTATION[size.rotationEnd], ctx.updatingCompanyId, args.trackObjType, 0, 0);
    if (tc2.connections.length) ctx.hooks.onSignalsChanged(next, tc2.connections[0] & AdditionalTaDFlags.basicTaDWithSignalMask, ctx.updatingCompanyId, args.trackObjType);
  }
  return total;
}
export const createSignalCommand = defineCommand(createSignal, 'createSignal');

function signalRemoveCost(ctx, args, piece0, trackStart) {
  const el = findTrackPiece(ctx.tm, piecePos(trackStart, piece0, args.rotation), args.rotation, piece0.index, args.trackObjType, args.trackId);
  if (!el) return 0;
  if (!el.hasSignal()) return 0;
  const sig = el.next();
  if (!(sig instanceof SignalElement)) return FAILURE;
  let total = 0;
  for (const [m, s] of [[SIGNAL_LEFT, sig.getLeft()], [SIGNAL_RIGHT, sig.getRight()]]) {
    if ((args.flags & m) && s.hasSignal()) { const o = getObject(ctx, 'signal', s.signalObjectId()); total += getInflationAdjustedCost(ctx, o.sellCostFactor, o.costIndex, 10); }
  }
  return total;
}

function removeSignal(ctx, args, flags) {
  const { tm } = ctx;
  setPosition(ctx, args.pos);
  const first = findTrackPiece(tm, args.pos, args.rotation, args.index, args.trackObjType, args.trackId);
  if (!first || !checkCompanyCompatibility(ctx, first.owner())) return FAILURE;
  const pieces = getTrackPiece(args.trackId);
  const trackStart = pieceStart(args.pos, pieces[args.index], args.rotation);
  const cost = signalRemoveCost(ctx, args, pieces[0], trackStart);
  if (cost === FAILURE) return FAILURE;
  for (const piece of pieces) {
    const loc = piecePos(trackStart, piece, args.rotation);
    const track = findTrackPiece(tm, loc, args.rotation, piece.index, args.trackObjType, args.trackId);
    if (!track) return FAILURE;
    if (!hasFlags(flags, Flags.apply)) continue;
    if (!track.hasSignal()) return 0;
    const sig = track.next();
    if (!(sig instanceof SignalElement)) return FAILURE;
    const ghost = hasFlags(flags, Flags.ghost);
    if (args.flags & SIGNAL_LEFT && (!ghost || sig.isLeftGhost())) { const l = sig.getLeft(); l.setHasSignal(false); l.setAllLights(0); l.setFrame(0); sig.setLeftGhost(false); }
    if (args.flags & SIGNAL_RIGHT && (!ghost || sig.isRightGhost())) { const r = sig.getRight(); r.setHasSignal(false); r.setAllLights(0); r.setFrame(0); sig.setRightGhost(false); }
    sig.setGhost(false);
    if (!sig.getLeft().hasSignal() && !sig.getRight().hasSignal()) { track.setHasSignal(false); tm.removeElement(sig); }
  }
  if (hasFlags(flags, Flags.apply) && !hasFlags(flags, Flags.aiAllocated | Flags.ghost) && ctx.hooks.onSignalsChanged) {
    ctx.hooks.onSignalsChanged(trackStart, (args.trackId << 3) | args.rotation, ctx.updatingCompanyId, args.trackObjType);
  }
  return cost;
}
export const removeSignalCommand = defineCommand(removeSignal, 'removeSignal');

// ---- AutoSignals.h ----
function autoPlaceSignals(ctx, trackStart, tad0, trackObjType, sides, step, initialStep, flags, filterFunc, actionFunc) {
  const result = { cost: 0, failure: false, hasPlaced: false };
  let current = initialStep >= step ? 0 : initialStep;
  iterateTrackToJunction(trackStart, tad0, {
    filter: (pos, tad) => {
      const rotation = tad & 3, trackId = (tad >> 3) & 0x3f;
      const p0 = getTrackPiece(trackId)[0];
      const start = piecePos(pos, p0, rotation);
      const el = findTrack(ctx.tm, start, (e) => e.baseHeight() === start.z && e.rotation() === rotation && e.sequenceIndex() === 0 && e.trackObjectId() === trackObjType && e.trackId() === trackId);
      if (!el) { result.failure = true; return false; }
      if (filterFunc(el)) return false;
      const err = validateTrackIsSignalCompatible(ctx.tm, pos, rotation, trackId, trackObjType);
      if (err) { setErrorText(ctx, err); return false; }
      if (current === 0 && !el.hasLevelCrossing()) {
        let adj = sides;
        if ((tad & 4) && sides !== BOTH) adj ^= BOTH;
        const cost = actionFunc(start, tad, adj, trackObjType, 0, flags);
        if (cost === FAILURE) { result.failure = true; return false; }
        result.hasPlaced = true; result.cost += cost;
      }
      current++;
      if (current >= step) current = 0;
      return true;
    },
    getConnections: (p, r) => getTrackConnections(ctx.tm, p, r, ctx.updatingCompanyId, trackObjType, 0, 0),
  });
  return result;
}

function autoSignalsWalk(ctx, args, flags, sidesIn, filterFunc, actionFunc) {
  const { pos, trackId, rotation, index, trackObjType, step = 1 } = args;
  if (step === 0) return actionFunc(pos, (rotation & 3) | (trackId << 3), sidesIn, trackObjType, index, flags);
  const pieces = getTrackPiece(trackId);
  if (pieces.length < index) return FAILURE;
  const trackStart = pieceStart(pos, pieces[index], rotation);
  let total = 0, hasPlaced = false;
  const fwd = autoPlaceSignals(ctx, trackStart, rotation | (trackId << 3), trackObjType, sidesIn, step, 0, flags, filterFunc, actionFunc);
  if (fwd.failure) return FAILURE;
  total += fwd.cost; hasPlaced = hasPlaced || fwd.hasPlaced;
  let reverseStart = trackStart;
  const size = getUnkTrack((trackId << 3) | rotation);
  if (size.rotationBegin < 12) { const o = ROTATION_OFFSET[size.rotationBegin]; reverseStart = { x: trackStart.x - o.x, y: trackStart.y - o.y, z: trackStart.z }; }
  const tc = getTrackConnections(ctx.tm, reverseStart, REVERSE_ROTATION[size.rotationBegin], ctx.updatingCompanyId, trackObjType, 0, 0);
  if (tc.connections.length === 1) {
    const reverseTad = tc.connections[0] & AdditionalTaDFlags.basicTaDMask;
    let rs = sidesIn;
    if (sidesIn !== BOTH) rs ^= BOTH;
    const back = autoPlaceSignals(ctx, reverseStart, reverseTad, trackObjType, rs, step, 1, flags, filterFunc, actionFunc);
    if (back.failure) return FAILURE;
    total += back.cost; hasPlaced = hasPlaced || back.hasPlaced;
  }
  if (!hasPlaced) return FAILURE;
  setPosition(ctx, pos);
  return total;
}

/** createSignalsAuto: place signals every `step` pieces along the track section (both directions from the clicked piece). */
export const createSignalsAutoCommand = defineCommand((ctx, a, flags) => autoSignalsWalk(ctx, a, flags, a.sides, (el) => el.hasSignal(),
  (pos, tad, sides, objType, index, f) => doCommand(ctx, createSignalCommand, { pos, rotation: tad & 3, trackId: (tad >> 3) & 0x3f, index, sides, trackObjType: objType, type: a.type }, f).cost), 'createSignalsAuto');
/** removeSignalsAuto: remove signals along the section. args.flags = sides. */
export const removeSignalsAutoCommand = defineCommand((ctx, a, flags) => autoSignalsWalk(ctx, a, flags, a.flags, () => false,
  (pos, tad, sides, objType, index, f) => doCommand(ctx, removeSignalCommand, { pos, rotation: tad & 3, trackId: (tad >> 3) & 0x3f, index, flags: sides, trackObjType: objType }, f).cost), 'removeSignalsAuto');
