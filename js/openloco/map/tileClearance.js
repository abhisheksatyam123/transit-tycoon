/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: src/Map/TileClearance.cpp, include/OpenLoco/Map/TileClearance.h, TileManager::getTileOwner.
 * Differences: GameCommands error-text globals become the `error` string in the returned result;
 * CompanyManager/GameCommands globals (updating company, isPlayerCompany, ai flags) come from an
 * injectable `ctx`; building/tree removal (RemoveBuilding, removeTree) are injectable handlers.
 */
import {
  ElementType, SurfaceElement, SurfaceSlope,
} from './elements.js';
import { TrackElement, RoadElement, StationElement, SignalElement, StationType, COMPANY_NEUTRAL, COMPANY_NULL } from './transportElements.js';
/** @typedef {import("./../quarterTile.js").QuarterTile} QuarterTile */

/** ClearFuncResult (TileClearance.h). */
export const ClearFuncResult = Object.freeze({
  allCollisionsRemoved: 0, collision: 1, collisionErrorSet: 2, noCollision: 3, collisionRemoved: 4,
});
/** ElementPositionFlags (TileManager.h). */
export const ElementPositionFlags = Object.freeze({
  none: 0, aboveGround: 1, underground: 2, partiallyUnderwater: 4, underwater: 8, anyHeightBuildingCollisions: 0x80,
});

const isCollisionResult = (r) => r === ClearFuncResult.collision || r === ClearFuncResult.collisionErrorSet;

/**
 * Context for company-related checks (all optional).
 * @typedef {object} ClearanceCtx
 * @property {number} [updatingCompanyId] GameCommands::getUpdatingCompanyId (default COMPANY_NEUTRAL)
 * @property {(id:number)=>boolean} [isPlayerCompany]  default: id < 15
 * @property {(id:number)=>boolean} [companyHasUnk2Flag] company->challengeFlags & unk2
 * @property {(id:number)=>void} [markCompanyUnk1] sets company->challengeFlags |= unk1
 */

/** Error text for a collision with `el` (TileClearance::setCollisionErrorMessage, ids instead of StringIds). */
export function collisionErrorMessage(el) {
  switch (el.type()) {
    case ElementType.surface: return 'raise_or_lower_land_first';
    case ElementType.wall: return 'object_in_the_way';
    default: return 'string_id_in_the_way';
  }
}

/** TileManager::getTileOwner: owning company id of an element (CompanyId null = 0xff when none). */
export function getTileOwner(el) {
  if (el instanceof TrackElement || el instanceof RoadElement) return el.owner();
  if (el instanceof StationElement) {
    const t = el.stationType();
    if (t === StationType.trainStation) { const p = el.prev(); return p instanceof TrackElement ? p.owner() : COMPANY_NULL; }
    if (t === StationType.roadStation) { const p = el.prev(); return p instanceof RoadElement ? p.owner() : COMPANY_NULL; }
    return el.owner();
  }
  if (el instanceof SignalElement) { const p = el.prev(); return p instanceof TrackElement ? p.owner() : COMPANY_NULL; }
  return COMPANY_NULL;
}

function aiCompanyAboutToBuildCheck(el, ctx, state) {
  const updating = ctx.updatingCompanyId ?? COMPANY_NEUTRAL;
  const isPlayer = ctx.isPlayerCompany || ((id) => id < COMPANY_NEUTRAL);
  const returnFunc = (owner) => {
    if (updating === COMPANY_NEUTRAL || !isPlayer(updating)) { state.error = 'another_company_is_about_to_build_here'; return ClearFuncResult.collisionErrorSet; }
    if (owner === updating || isPlayer(owner)) return ClearFuncResult.collision;
    if (ctx.companyHasUnk2Flag && ctx.companyHasUnk2Flag(owner)) { state.error = 'another_company_is_about_to_build_here'; return ClearFuncResult.collisionErrorSet; }
    if (ctx.markCompanyUnk1) ctx.markCompanyUnk1(owner);
    return ClearFuncResult.noCollision;
  };
  if (!(el instanceof SurfaceElement)) {
    const owner = getTileOwner(el);
    return owner === COMPANY_NULL ? ClearFuncResult.noCollision : returnFunc(owner);
  }
  for (let n = el.next(); n; n = n.next()) {
    if (!n.isAiAllocated()) continue;
    const owner = getTileOwner(n);
    if (owner === COMPANY_NULL) continue;
    return returnFunc(owner);
  }
  state.error = 'another_company_is_about_to_build_here';
  return ClearFuncResult.collisionErrorSet;
}

const callClear = (el, clearFunc) => (clearFunc ? clearFunc(el) : ClearFuncResult.collision);

function checkSurface(baseZ, clearZ, qt, clearFunc, el, ctx, state) {
  if (el.isAiAllocated()) {
    const res = aiCompanyAboutToBuildCheck(el, ctx, state);
    if (res !== ClearFuncResult.noCollision) return res;
  }
  const waterZ = el.water() * 4;
  if (waterZ !== 0 && clearZ > el.clearZ() && baseZ < waterZ + 4) {
    state.flags |= ElementPositionFlags.partiallyUnderwater;
    if (baseZ < waterZ) {
      state.flags |= ElementPositionFlags.underwater;
      if (clearZ > waterZ) {
        if (clearFunc) {
          const res = clearFunc(el);
          if (isCollisionResult(res)) {
            if (res === ClearFuncResult.collision) state.error = 'cannot_build_partly_above_below_water';
            return ClearFuncResult.collisionErrorSet;
          }
        } else { state.error = 'cannot_build_partly_above_below_water'; return ClearFuncResult.collisionErrorSet; }
      }
    }
  }
  if (qt.getZQuarterOccupied() === 0xf) return ClearFuncResult.noCollision;
  if (clearZ <= el.baseZ()) {
    state.flags = (state.flags | ElementPositionFlags.underground) & ~ElementPositionFlags.aboveGround;
    return ClearFuncResult.noCollision;
  }
  let northZ = el.baseZ(), eastZ = northZ, southZ = northZ, westZ = northZ;
  const slope = el.slope();
  const U = SurfaceSlope.CornerUp, D = SurfaceSlope.CornerDown, dbl = SurfaceSlope.doubleHeight;
  if (slope & U.north) { northZ += 4; if (slope === (D.south | dbl)) northZ += 4; }
  if (slope & U.east) { eastZ += 4; if (slope === (D.west | dbl)) eastZ += 4; }
  if (slope & U.south) { southZ += 4; if (slope === (D.north | dbl)) southZ += 4; }
  if (slope & U.west) { westZ += 4; if (slope === (D.east | dbl)) westZ += 4; }
  const doubleHeight = baseZ + 8;
  const bq = qt.getBaseQuarterOccupied(), zq = qt.getZQuarterOccupied();
  const ok = (m, z) => !(bq & m) || (((zq & m) || baseZ >= z) && doubleHeight >= z);
  if (ok(1, northZ) && ok(2, eastZ) && ok(4, southZ) && ok(8, westZ)) return ClearFuncResult.noCollision;
  return callClear(el, clearFunc);
}

function checkNonSurface(baseZ, clearZ, qt, anyHeight, clearFunc, el, ctx, state) {
  if (anyHeight) {
    const t = el.type();
    if (t === ElementType.tree || t === ElementType.building || t === ElementType.industry) return callClear(el, clearFunc);
    if (el instanceof StationElement && (el.stationType() === StationType.airport || el.stationType() === StationType.docks)) return callClear(el, clearFunc);
  }
  if (baseZ >= el.clearZ()) return ClearFuncResult.noCollision;
  if (clearZ <= el.baseZ()) return ClearFuncResult.noCollision;
  if (el.isGhost()) return ClearFuncResult.noCollision;
  if ((el.occupiedQuarter() & qt.getBaseQuarterOccupied()) === 0) return ClearFuncResult.noCollision;
  if (!el.isAiAllocated()) return callClear(el, clearFunc);
  if (clearFunc) {
    const res = clearFunc(el);
    if (!isCollisionResult(res)) return res;
  }
  return aiCompanyAboutToBuildCheck(el, ctx, state);
}

/**
 * TileClearance::canConstructAtWithClear core.
 * @param {import('./tileManager.js').TileManager} tm
 * @param {{x:number,y:number}} pos world Pos2
 * @param {number} baseZ smallZ  @param {number} clearZ smallZ
 * @param {QuarterTile} qt
 * @param {boolean} anyHeight BuildingCollisionType::anyHeight
 * @param {?(el:any)=>number} clearFunc returns a ClearFuncResult; may remove elements via tm.removeElement
 * @param {ClearanceCtx} ctx
 * @returns {{ok:boolean, error:?string, element:?object, positionFlags:number}}
 */
function canConstructAtWithClear(tm, pos, baseZ, clearZ, qt, anyHeight, clearFunc, ctx) {
  const state = { flags: ElementPositionFlags.aboveGround, error: null };
  const fail = (element) => ({ ok: false, error: state.error, element, positionFlags: state.flags });
  if (!tm.drawableCoords(pos)) { state.error = 'off_edge_of_map'; return fail(null); }
  let collisionRemoved;
  do {
    collisionRemoved = false;
    for (const el of tm.get(pos).elements()) {
      if (!el.list) continue; // removed by a clear function
      const res = el instanceof SurfaceElement
        ? checkSurface(baseZ, clearZ, qt, clearFunc, el, ctx, state)
        : checkNonSurface(baseZ, clearZ, qt, anyHeight, clearFunc, el, ctx, state);
      if (res === ClearFuncResult.allCollisionsRemoved) return { ok: true, error: null, element: null, positionFlags: state.flags };
      if (res === ClearFuncResult.collision) { state.error = collisionErrorMessage(el); return fail(el); }
      if (res === ClearFuncResult.collisionErrorSet) return fail(el);
      if (res === ClearFuncResult.collisionRemoved) { collisionRemoved = true; break; }
    }
  } while (collisionRemoved);
  return { ok: true, error: null, element: null, positionFlags: state.flags };
}

/** applyClearAtAllHeights (any building/tree/industry/dock/airport at any height collides). */
export function applyClearAtAllHeights(tm, pos, baseZ, clearZ, qt, clearFunc, ctx = {}) {
  return canConstructAtWithClear(tm, pos, baseZ, clearZ, qt, true, clearFunc, ctx);
}
/** applyClearAtStandardHeight. */
export function applyClearAtStandardHeight(tm, pos, baseZ, clearZ, qt, clearFunc, ctx = {}) {
  return canConstructAtWithClear(tm, pos, baseZ, clearZ, qt, false, clearFunc, ctx);
}
/** canConstructAt: standard height, no clear function (any overlap is a collision). */
export function canConstructAt(tm, pos, baseZ, clearZ, qt, ctx = {}) {
  return canConstructAtWithClear(tm, pos, baseZ, clearZ, qt, false, null, ctx);
}

/**
 * Build a clear function like clearWithDefaultCollision / clearWithoutDefaultCollision.
 * Buildings and trees go to `handlers.building(el)` / `handlers.tree(el)` (the C++ calls
 * RemoveBuilding / removeTree there; default: noCollision, i.e. "would be cleared").
 * @param {boolean} defaultCollision true = clearWithDefaultCollision
 * @param {{building?:(el:any)=>number, tree?:(el:any)=>number}} [handlers]
 * @returns {(el:any)=>number}
 */
export function makeClearFunction(defaultCollision, handlers = {}) {
  return (el) => {
    switch (el.type()) {
      case ElementType.surface: return ClearFuncResult.noCollision;
      case ElementType.tree: return handlers.tree ? handlers.tree(el) : ClearFuncResult.noCollision;
      case ElementType.building: return handlers.building ? handlers.building(el) : ClearFuncResult.noCollision;
      default: return defaultCollision ? ClearFuncResult.collision : ClearFuncResult.noCollision;
    }
  };
}

