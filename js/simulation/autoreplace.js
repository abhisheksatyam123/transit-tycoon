/**
 * Autoreplace rules (OpenTTD autoreplace_gui / autoreplace_cmd, simplified): per company, and optionally per vehicle
 * group, "replace model A with model B". Company rules live lazily in
 * state.company.autoreplace = { [oldModelId]: newModelId }; group rules in the lazy
 * state.company.groupAutoreplace = { [groupId]: { [oldModelId]: newModelId } }. Both keys are absent when empty, so
 * default games and saves are unchanged. Applied by autorenew.js when a vehicle of model A is stopped in a depot.
 *
 * Wagon rules are opt-in too: once a rule for a wagon model exists, replaceVehicle keeps the wagon count but maps the
 * wagon model through it. No rule = the wagons stay exactly as they are.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { purchasable } from './vehicles.js';
import { getSetting } from './settings.js';

/** Kinds whose replacement must be able to carry a cargo the old model carries (buses, trucks and now wagons). */
function sharesCargo(old) {
  return old.kind === 'bus' || old.kind === 'truck' || old.kind === 'wagon';
}

/** Models that can replace `modelId`: same kind (engine/wagon/bus/truck/aircraft/ship), purchasable, not itself. */
export function replacementCandidates(modelId, year, neverExpire = false) {
  const old = MODEL_BY_ID[modelId];
  if (!old) return [];
  return Object.values(MODEL_BY_ID).filter((m) => m.kind === old.kind && m.id !== old.id
    && m.introYear <= year && purchasable(m, year, neverExpire)
    && (!sharesCargo(old) || m.cargos.some((c) => old.cargos.includes(c))));
}

/** Validate one replacement pair (shared by the company and per-group setters). */
function validateRule(state, oldModelId, newModelId) {
  const year = state.date.year;
  const old = MODEL_BY_ID[oldModelId];
  if (!old) return { ok: false, error: 'Unknown vehicle model' };
  const nw = MODEL_BY_ID[newModelId];
  if (!nw) return { ok: false, error: 'Unknown vehicle model' };
  if (nw.kind !== old.kind) return { ok: false, error: 'Replacement must be the same kind of vehicle' };
  if (nw.id === old.id) return { ok: false, error: 'Replacement is the same model' };
  if (nw.introYear > year) return { ok: false, error: 'Replacement not yet available' };
  if (!purchasable(nw, year, getSetting(state, 'neverExpireVehicles'))) return { ok: false, error: 'Replacement is obsolete' };
  if (sharesCargo(old) && !nw.cargos.some((c) => old.cargos.includes(c))) {
    return { ok: false, error: 'Replacement cannot carry the same cargo' };
  }
  return { ok: true, old, nw };
}

/**
 * Set (newModelId) or clear (null) an autoreplace rule for `oldModelId`.
 * @returns {{ok:true,rule:object}|{ok:false,error:string}}
 */
export function setAutoreplace(state, oldModelId, newModelId, opts = {}) {
  const old = MODEL_BY_ID[oldModelId];
  if (!old) return { ok: false, error: 'Unknown vehicle model' };
  const company = state.company;
  if (newModelId == null) {
    if (company.autoreplace) {
      if (!opts.dryRun) {
        delete company.autoreplace[oldModelId];
        if (!Object.keys(company.autoreplace).length) delete company.autoreplace;
        clearWhenOld(company, oldModelId);
      }
    }
    return { ok: true, rule: null };
  }
  const check = validateRule(state, oldModelId, newModelId);
  if (!check.ok) return check;
  if (!opts.dryRun) {
    company.autoreplace ??= {};
    company.autoreplace[oldModelId] = newModelId;
  }
  return { ok: true, rule: { from: oldModelId, to: newModelId } };
}

/**
 * Set (newModelId) or clear (null) an autoreplace rule for `oldModelId` inside one vehicle group.
 * Same validation as setAutoreplace; stores lazily in company.groupAutoreplace (removed when empty).
 * @returns {{ok:true,rule:object}|{ok:false,error:string}}
 */
export function setGroupAutoreplace(state, groupId, oldModelId, newModelId, opts = {}) {
  const company = state.company;
  if (!((company && company.groups) || []).some((g) => g.id === groupId)) return { ok: false, error: 'Unknown group' };
  const old = MODEL_BY_ID[oldModelId];
  if (!old) return { ok: false, error: 'Unknown vehicle model' };
  if (newModelId == null) {
    if (!opts.dryRun) clearGroupRules(company, groupId, oldModelId);
    return { ok: true, rule: null };
  }
  const check = validateRule(state, oldModelId, newModelId);
  if (!check.ok) return check;
  if (!opts.dryRun) {
    company.groupAutoreplace ??= {};
    company.groupAutoreplace[groupId] ??= {};
    company.groupAutoreplace[groupId][oldModelId] = newModelId;
  }
  return { ok: true, rule: { from: oldModelId, to: newModelId } };
}

/** Clear every autoreplace rule of one group (or one old model when `oldModelId` is given). */
export function clearGroupAutoreplace(state, groupId, oldModelId = null, opts = {}) {
  const company = state.company;
  if (!((company && company.groups) || []).some((g) => g.id === groupId)) return { ok: false, error: 'Unknown group' };
  if (!opts.dryRun) clearGroupRules(company, groupId, oldModelId);
  return { ok: true, rule: null };
}

function clearGroupRules(company, groupId, oldModelId) {
  const all = company.groupAutoreplace;
  const rules = all && all[groupId];
  if (!rules) return;
  if (oldModelId == null) delete all[groupId];
  else delete rules[oldModelId];
  if (!Object.keys(rules).length) delete all[groupId];
  if (!Object.keys(all).length) delete company.groupAutoreplace;
}

/**
 * The rule that applies to `modelId` on `v`: the vehicle group's rule first, then the company rule. Current TT
 * protect semantics stay: a protected group blocks every rule (its own group rule and the company rule), exactly as
 * before. With no group rules the result is identical to the old company-only lookup.
 * @returns {string|undefined} replacement model id, or undefined when no rule applies
 */
export function autoreplaceTarget(state, v, modelId = v.modelId) {
  const company = state.company;
  if (!company) return undefined;
  if (v.groupId != null) {
    const group = (company.groups || []).find((g) => g.id === v.groupId);
    if (group && group.replaceProtect) return undefined;
    const groupRules = company.groupAutoreplace && company.groupAutoreplace[v.groupId];
    if (groupRules && Object.prototype.hasOwnProperty.call(groupRules, modelId)) return groupRules[modelId];
  }
  const rules = company.autoreplace;
  return rules && Object.prototype.hasOwnProperty.call(rules, modelId) ? rules[modelId] : undefined;
}

/**
 * Per-rule "replace when old" (OpenTTD autoreplace replace_when_old): when on, a vehicle of `oldModelId` matched by
 * its rule is replaced only once it is old (vehicles.js isVehicleOld), not at any age. Stored lazily as
 * company.autoreplaceWhenOld = { [oldModelId]: true }; absent unless set, so default games never write it.
 * A same-model rule does not exist in TT (setAutoreplace rejects it), so there is no same-model case here.
 * @returns {{ok:true,whenOld:boolean}|{ok:false,error:string}}
 */
export function setAutoreplaceWhenOld(state, oldModelId, on, opts = {}) {
  const old = MODEL_BY_ID[oldModelId];
  if (!old) return { ok: false, error: 'Unknown vehicle model' };
  const company = state.company;
  if (!opts.dryRun) {
    if (on) {
      company.autoreplaceWhenOld ??= {};
      company.autoreplaceWhenOld[oldModelId] = true;
    } else clearWhenOld(company, oldModelId);
  }
  return { ok: true, whenOld: !!on };
}

/** Is the rule for `modelId` set to replace only when old? */
export function isReplaceWhenOld(state, modelId) {
  const w = state.company && state.company.autoreplaceWhenOld;
  return !!(w && w[modelId]);
}

function clearWhenOld(company, modelId) {
  if (!company.autoreplaceWhenOld) return;
  delete company.autoreplaceWhenOld[modelId];
  if (!Object.keys(company.autoreplaceWhenOld).length) delete company.autoreplaceWhenOld;
}
