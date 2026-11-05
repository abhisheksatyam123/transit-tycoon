/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: include/OpenLoco/GameCommands/GameCommands.h (Flags, kFailure), src/GameCommands/GameCommands.cpp
 *         (doCommand/loc_4313C6 two-pass semantics, checkCompanyCompatibility, getUpdatingCompanyId),
 *         src/Economy/Economy.cpp (getInflationAdjustedCost).
 *
 * Conventions of the JS port:
 *  - A command is `(ctx, args, flags) => {ok, cost, error, position, ...extras}`; `cost === FAILURE` on failure.
 *  - Error text is a string id (the StringIds name, snake_case) in `result.error`, e.g. 'junctions_not_possible'.
 *  - `ctx` (see createContext) carries the TileManager, object data provider, station manager, company id and hooks.
 *  - Skipped (not simulated): sounds, viewport invalidation, company observation/emotion, expenditure type,
 *    network sync, `checkFreeElementsAndReorganise` (JS arrays grow freely), `Scenario madeAnyChanges`.
 */
import { STATION_NULL, COMPANY_NEUTRAL } from '../map/transportElements.js';
import { createDefaultObjects } from './objects.js';

/** GameCommands::Flags. */
export const Flags = Object.freeze({
  none: 0, apply: 1 << 0, preventBuildingClearing: 1 << 1, allowNegativeCashFlow: 1 << 2, noErrorWindow: 1 << 3,
  aiAllocated: 1 << 4, noPayment: 1 << 5, ghost: 1 << 6, flag_7: 1 << 7,
});
/** GameCommands::kFailure (0x80000000). Costs are plain numbers; refunds are negative. */
export const FAILURE = 0x80000000;
/** Signal sides bits as used by SignalPlacementArgs.sides / SignalRemovalArgs.flags. */
export const SIGNAL_LEFT = 1 << 15;
export const SIGNAL_RIGHT = 1 << 14;
export { STATION_NULL, COMPANY_NEUTRAL };

/** hasFlags: true if ANY bit of `mask` is set in `flags` (OPENLOCO_ENABLE_ENUM_OPERATORS semantics). */
export const hasFlags = (flags, mask) => (flags & mask) !== 0;

/**
 * Build a command context.
 * @param {object} o
 * @param {import('../map/tileManager.js').TileManager} o.tm map
 * @param {number} [o.updatingCompanyId=0] getUpdatingCompanyId() (15 = neutral)
 * @param {object} [o.objects] object data provider (see objects.js; default createDefaultObjects())
 * @param {object} [o.stations] station manager (see stationManager.js; required by station commands)
 * @param {number[]|((costIndex:number)=>number)} [o.currencyFactors] inflation multiplier per costIndex
 *        (default 1024 = year <= 1900, so base cost == costFactor for divisor 10)
 * @param {number} [o.currentDefaultLevelCrossingType=0] GameState::currentDefaultLevelCrossingType
 * @param {boolean} [o.editorMode=false] SceneManager::isEditorMode (costs 0, owner neutral for roads)
 * @param {(id:number)=>boolean} [o.isPlayerCompany] default id < 15
 * @param {number} [o.controllingCompanyId] CompanyManager::getControllingId (ghost mods are only drawn for it)
 * @param {(company:number, cost:number)=>boolean} [o.ensureFunding] checked for the query pass of top-level doCommand
 * @param {(company:number, cost:number)=>void} [o.applyPayment] called once after a successful top-level apply
 * @param {object} [o.hooks] optional: clearBuilding(el,pos,flags,addCost)->ClearFuncResult, clearTree(...) (tree has a default),
 *        onSignalsChanged(pos,tad,company,trackObjType), onSurfaceIndustryRemoved(pos)
 */
export function createContext(o) {
  const ctx = {
    tm: o.tm,
    updatingCompanyId: o.updatingCompanyId ?? 0,
    objects: o.objects || createDefaultObjects(),
    stations: o.stations || null,
    currencyFactors: o.currencyFactors || null,
    currentDefaultLevelCrossingType: o.currentDefaultLevelCrossingType ?? 0,
    editorMode: !!o.editorMode,
    isPlayerCompany: o.isPlayerCompany || ((id) => id < COMPANY_NEUTRAL),
    controllingCompanyId: o.controllingCompanyId ?? (o.updatingCompanyId ?? 0),
    ensureFunding: o.ensureFunding || null,
    applyPayment: o.applyPayment || null,
    hooks: o.hooks || {},
    companyHasUnk2Flag: o.companyHasUnk2Flag, markCompanyUnk1: o.markCompanyUnk1,
    // runtime state
    errorText: null, errorCompanyId: null, position: { x: 0, y: 0, z: 0 }, nest: 0,
    returnState: { lastPlacedTrackRoadStationId: STATION_NULL, lastConstructedAdjoiningStationPos: { x: -1, y: -1 }, lastConstructedAdjoiningStation: STATION_NULL },
  };
  return ctx;
}

/** getUpdatingCompanyId(). */
export const getUpdatingCompanyId = (ctx) => ctx.updatingCompanyId;
/** setErrorText (string id). */
export const setErrorText = (ctx, id) => { ctx.errorText = id; };
/** setPosition(args.pos + {16,16,0}). */
export const setPosition = (ctx, p) => { ctx.position = { x: p.x + 16, y: p.y + 16, z: p.z }; };

/** Economy::getInflationAdjustedCost(costFactor, costIndex, divisor). */
export function getInflationAdjustedCost(ctx, costFactor, costIndex, divisor) {
  const f = ctx.currencyFactors;
  const factor = typeof f === 'function' ? f(costIndex) : Array.isArray(f) ? f[costIndex] : 1024;
  return Math.trunc((costFactor * factor) / 2 ** divisor);
}

/** (baseCost * costFactor) / 256 with C++ integer truncation. */
export const scaleByPieceCost = (base, costFactor) => Math.trunc((base * costFactor) / 256);

/**
 * checkCompanyCompatibility(company[, element]): neutral-owned and own/neutral-updating company pass;
 * otherwise errorText = 'belongs_to_other' (C++ kErrorBelongsToOther) and ctx.errorCompanyId = owner.
 */
export function checkCompanyCompatibility(ctx, company) {
  if (company === COMPANY_NEUTRAL) return true;
  if (ctx.updatingCompanyId === company || ctx.updatingCompanyId === COMPANY_NEUTRAL) return true;
  ctx.errorText = 'belongs_to_other'; ctx.errorCompanyId = company;
  return false;
}

/**
 * Wrap an implementation `impl(ctx, args, flags) => cost|FAILURE` into a command returning a result object.
 * Calling a command directly runs exactly one pass with the given flags; use doCommand for the query+apply pair.
 */
export function defineCommand(impl, name = impl.name) {
  const command = (ctx, args, flags = Flags.none) => {
    if (ctx.nest === 0) ctx.errorText = null;
    const cost = impl(ctx, args, flags);
    const ok = cost !== FAILURE;
    return { ok, cost, error: ok ? null : ctx.errorText, position: { ...ctx.position } };
  };
  command.commandName = name;
  return command;
}

/**
 * GameCommands::doCommand (loc_4313C6): query pass (flags without apply), funding check at nest level 1,
 * then the apply pass if requested; the returned cost is min(queryCost, applyCost). Payment (`ctx.applyPayment`)
 * happens at nest level 0 unless noPayment. Editor mode forces cost 0.
 */
export function doCommand(ctx, command, args, flags) {
  if (ctx.nest === 0) ctx.errorText = null;
  ctx.nest++;
  const out = (r) => { ctx.nest--; return r; };
  const fail = (r) => out({ ...r, ok: false, cost: FAILURE, error: r.error ?? ctx.errorText });
  try {
    const q = command(ctx, args, flags & ~Flags.apply);
    let cost = q.cost;
    if (cost !== FAILURE) {
      if (ctx.editorMode) cost = 0;
      if (ctx.nest === 1 && !hasFlags(flags, Flags.allowNegativeCashFlow | Flags.noPayment) && cost !== 0
        && ctx.ensureFunding && !ctx.ensureFunding(ctx.updatingCompanyId, cost)) cost = FAILURE;
    }
    if (cost === FAILURE) return fail(q);
    if (!hasFlags(flags, Flags.apply)) return out({ ...q, cost });
    const a = command(ctx, args, flags);
    if (a.cost === FAILURE) return fail(a);
    let total = ctx.editorMode ? 0 : a.cost;
    if (total > cost) total = cost;
    if (ctx.nest === 1 && !hasFlags(flags, Flags.noPayment) && ctx.applyPayment) ctx.applyPayment(ctx.updatingCompanyId, total);
    return out({ ...a, cost: total });
  } catch (e) { ctx.nest = 0; throw e; }
}
