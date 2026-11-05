/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: helpers duplicated across src/GameCommands/{Track,Road}/*.cpp (isBridgeRequired, getElTrack/getElRoad
 *         lookups, position arithmetic), src/Map/TileManager.cpp (removeAllWallsOnTileBelow, setLevelCrossingFlags,
 *         removeSurfaceIndustryAtHeight, setTerrainStyleAsClearedAtHeight), src/Map/TileClearance.cpp
 *         (clearTreeCollision, clearBuildingCollision wrapper).
 */
import { WallElement, TreeElement } from '../map/elements.js';
import { TrackElement, RoadElement } from '../map/transportElements.js';
import { applyClearAtStandardHeight, ClearFuncResult } from '../map/tileClearance.js';
import { rotatePos2 } from '../map/world.js';
import { PreviewTrackFlags } from '../trackEnum.js';
import { Flags, hasFlags, getInflationAdjustedCost } from './gameCommands.js';
import { getObject } from './objects.js';

export const NO_BRIDGE = 0xff;
/** Numerics::rotl4bit. */
export const rotl4bit = (val, rotation) => (((val * (2 ** rotation)) | (val >> (4 - rotation))) & 0xf);
/** start + {rotate({piece.x,piece.y}, rotation), piece.z} (a Pos3). */
export function piecePos(start, piece, rotation) {
  const r = rotatePos2({ x: piece.x, y: piece.y }, rotation);
  return { x: start.x + r.x, y: start.y + r.y, z: start.z + piece.z };
}
/** pos - piece offset: tile origin of piece 0 given the position of `piece`. */
export function pieceStart(pos, piece, rotation) {
  const r = rotatePos2({ x: piece.x, y: piece.y }, rotation);
  return { x: pos.x - r.x, y: pos.y - r.y, z: pos.z - piece.z };
}
export const addPos3 = (p, d) => ({ x: p.x + d[0], y: p.y + d[1], z: p.z + d[2] });

/** isBridgeRequired (CreateTrack.cpp / CreateRoad.cpp). */
export function isBridgeRequired(baseZ, elSurface, piece, unk) {
  if (baseZ > elSurface.baseZ()) return true;
  if (baseZ === elSurface.baseZ()) {
    if (!(piece.flags & PreviewTrackFlags.unk4)) {
      if (unk === 0 || unk === elSurface.slopeCorners()) return false;
    }
    return true;
  }
  return false;
}

/** Find the first TrackElement on the tile at `pos` matching `pred` (the C++ getElTrack* loops). */
export function findTrack(tm, pos, pred) {
  for (const el of tm.get(pos)) if (el instanceof TrackElement && pred(el)) return el;
  return null;
}
/** Find the first RoadElement on the tile at `pos` matching `pred`. */
export function findRoad(tm, pos, pred) {
  for (const el of tm.get(pos)) if (el instanceof RoadElement && pred(el)) return el;
  return null;
}
/** Track lookup used by signal/mod/station commands: baseHeight, rotation, sequence index, object id, track id. */
export const findTrackPiece = (tm, pos, rotation, index, trackObjectId, trackId) => findTrack(tm, pos,
  (e) => e.baseHeight() === pos.z && e.rotation() === rotation && e.sequenceIndex() === index
    && e.trackObjectId() === trackObjectId && e.trackId() === trackId);
export const findRoadPiece = (tm, pos, rotation, index, roadObjectId, roadId) => findRoad(tm, pos,
  (e) => e.baseHeight() === pos.z && e.rotation() === rotation && e.sequenceIndex() === index
    && e.roadObjectId() === roadObjectId && e.roadId() === roadId);

/** TileManager::removeAllWallsOnTileBelow. */
export function removeAllWallsOnTileBelow(tm, tile, baseZ) {
  for (const el of tm.getTile(tile.x, tile.y).elements().reverse()) {
    if (!(el instanceof WallElement)) continue;
    if (baseZ < el.clearZ() && baseZ + 12 <= el.baseZ()) continue;
    tm.removeElement(el);
  }
}
/** TileManager::removeSurfaceIndustryAtHeight (surface industry flag only; town info update is a hook). */
export function removeSurfaceIndustryAtHeight(ctx, pos) {
  const s = ctx.tm.get(pos).surface();
  if (!s || s.baseHeight() > pos.z || pos.z - s.baseHeight() >= 48) return;
  if (s.isIndustrial()) {
    s.setIsIndustrialFlag(false); s.setGrowthStage(0); s.setVariation(0);
    if (ctx.hooks.onSurfaceIndustryRemoved) ctx.hooks.onSurfaceIndustryRemoved(pos);
  }
}
/** TileManager::setTerrainStyleAsClearedAtHeight. */
export function setTerrainStyleAsClearedAtHeight(tm, pos) {
  const s = tm.get(pos).surface();
  if (!s || s.baseHeight() > pos.z || pos.z - s.baseHeight() >= 48 || s.isIndustrial()) return;
  if (s.getGrowthStage() > 0) { s.setGrowthStage(0); s.setSnowCoverage(0); }
  if (s.snowCoverage() > 0) s.setSnowCoverage(0);
}
/** TileManager::setLevelCrossingFlags: drop a lone crossing flag (only one of road/track has it). */
export function setLevelCrossingFlags(tm, pos) {
  const each = (tf, rf) => {
    for (const el of tm.get(pos)) {
      if (el.baseHeight() !== pos.z || el.isAiAllocated()) continue;
      if (el instanceof TrackElement && el.trackId() === 0) tf(el);
      if (el instanceof RoadElement && el.roadId() === 0) rf(el);
    }
  };
  let hasRoad = false, hasTrack = false;
  each((t) => { hasTrack = hasTrack || t.hasLevelCrossing(); }, (r) => { hasRoad = hasRoad || r.hasLevelCrossing(); });
  if (hasRoad !== hasTrack) {
    each((t) => { if (hasTrack) t.setHasLevelCrossing(false); },
      (r) => { if (hasRoad) { r.setHasLevelCrossing(false); r.setLevelCrossingClosed(false); r.setLevelCrossingObjectId(0); } });
  }
}

/** clearTreeCollision: pays the clear cost; removes the tree only on a real apply. `addCost(n)` accumulates. */
export function clearTreeCollision(ctx, el, flags, addCost) {
  const tree = getObject(ctx, 'tree', el instanceof TreeElement ? el.treeObjectId() : 0);
  addCost(getInflationAdjustedCost(ctx, tree.clearCostFactor, tree.costIndex, 12));
  if (hasFlags(flags, Flags.ghost | Flags.aiAllocated) || !hasFlags(flags, Flags.apply)) return ClearFuncResult.noCollision;
  const wasLast = el.isLast();
  ctx.tm.removeElement(el);
  return wasLast ? ClearFuncResult.allCollisionsRemoved : ClearFuncResult.collisionRemoved;
}
/**
 * clearBuildingCollision: delegated to `ctx.hooks.clearBuilding(el, pos, flags, addCost) -> ClearFuncResult`.
 * Without a hook buildings are an unclearable collision (BuildingManager/RemoveBuilding are not ported).
 */
export function clearBuildingCollision(ctx, el, pos, flags, addCost) {
  if (ctx.hooks.clearBuilding) return ctx.hooks.clearBuilding(el, pos, flags, addCost);
  return ClearFuncResult.collision;
}

/** Ctx subset consumed by tileClearance.js. */
export const clearanceCtx = (ctx) => ({
  updatingCompanyId: ctx.updatingCompanyId, isPlayerCompany: ctx.isPlayerCompany,
  companyHasUnk2Flag: ctx.companyHasUnk2Flag, markCompanyUnk1: ctx.markCompanyUnk1,
});

/**
 * applyClearAtStandardHeight wrapper: on failure copies the clearance error into ctx.errorText.
 * @returns {{ok:boolean, positionFlags:number}}
 */
export function clearAt(ctx, loc, baseZ, clearZ, qt, clearFunc) {
  const r = applyClearAtStandardHeight(ctx.tm, loc, baseZ, clearZ, qt, clearFunc, clearanceCtx(ctx));
  if (!r.ok && r.error) ctx.errorText = r.error;
  return r;
}
/** 1 shifted left by n (bit mask helper). */
export const bit = (n) => 2 ** n;
