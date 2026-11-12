/**
 * Autoreplace rules (OpenTTD autoreplace_gui / autoreplace_cmd, simplified): per company, and optionally per vehicle
 * group, "replace model A with model B". Company rules live lazily in
 * state.company.autoreplace = { [oldModelId]: newModelId }; group rules in the lazy
 * state.company.groupAutoreplace = { [groupId]: { [oldModelId]: newModelId } }. Both keys are absent when empty, so
 * default games and saves are unchanged. Applied by autorenew.js when a vehicle of model A is stopped in a depot.
 * Replace-when-old is per rule: company.autoreplaceWhenOld = { [oldModelId]: true } and, lazily per group,
 * company.groupAutoreplaceWhenOld = { [groupId]: { [oldModelId]: true|false } }. A group entry overrides the company
 * flag; an absent entry inherits the company flag live. `false` is meaningful (override an on company flag).
 *
 * Wagon rules are opt-in too: once a rule for a wagon model exists, replaceVehicle keeps the wagon count but maps the
 * wagon model through it, and a wagon rule alone qualifies a train for replacement (the engine stays put). Mixed
 * consists map every wagon through its own rule. No rule = the wagons and the trigger stay exactly as they were.
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
  if (rules) {
    if (oldModelId == null) delete all[groupId];
    else delete rules[oldModelId];
    if (!Object.keys(rules).length) delete all[groupId];
    if (!Object.keys(all).length) delete company.groupAutoreplace;
  }
  // Clearing a group rule also clears its replace-when-old entry (OpenTTD replace_when_old is a property of the rule).
  clearGroupWhenOld(company, groupId, oldModelId);
}

/** Drop one group when-old entry (or the whole group table when `oldModelId` is null), lazily. */
function clearGroupWhenOld(company, groupId, oldModelId) {
  const all = company.groupAutoreplaceWhenOld;
  const map = all && all[groupId];
  if (!map) return;
  if (oldModelId == null) delete all[groupId];
  else delete map[oldModelId];
  if (!Object.keys(map).length) delete all[groupId];
  if (!Object.keys(all).length) delete company.groupAutoreplaceWhenOld;
}

/**
 * Does a protected group block *every* autoreplace action for `v`? Only under the current TT semantics, i.e. while
 * the `autoreplaceProtectOttd` opt-in is off: a protected group then blocks its own group rule, the company rule and
 * autorenew. With the opt-in on, protection blocks only the company-wide rule (handled in autoreplaceTarget), so the
 * group's own rule and age-based autorenew still run (OpenTTD autoreplace.cpp:70 only skips the ALL_GROUP lookup).
 */
export function groupProtectBlocksAll(state, v) {
  if (v.groupId == null) return false;
  const company = state.company;
  const group = company && (company.groups || []).find((g) => g.id === v.groupId);
  if (!group || !group.replaceProtect) return false;
  return getSetting(state, 'autoreplaceProtectOttd') !== true;
}

/**
 * The rule that applies to `modelId` on `v`: the vehicle group's rule first, then the company rule.
 * A protected group blocks every rule under the default TT semantics; with `autoreplaceProtectOttd` on it blocks
 * only the company rule (its own group rule still applies). With no group rules the result is identical to the old
 * company-only lookup.
 * @returns {string|undefined} replacement model id, or undefined when no rule applies
 */
export function autoreplaceTarget(state, v, modelId = v.modelId) {
  const company = state.company;
  if (!company) return undefined;
  if (v.groupId != null) {
    const group = (company.groups || []).find((g) => g.id === v.groupId);
    const protectedGroup = !!(group && group.replaceProtect);
    // Default TT semantics: a protected group blocks its own rule and the company rule.
    if (protectedGroup && groupProtectBlocksAll(state, v)) return undefined;
    const groupRules = company.groupAutoreplace && company.groupAutoreplace[v.groupId];
    if (groupRules && Object.prototype.hasOwnProperty.call(groupRules, modelId)) return groupRules[modelId];
    // OpenTTD semantics: protection blocks only the company-wide (ALL_GROUP) rule, not the group's own rule.
    if (protectedGroup) return undefined;
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

/** Is the rule for `modelId` set to replace only when old (company scope)? */
export function isReplaceWhenOld(state, modelId) {
  const w = state.company && state.company.autoreplaceWhenOld;
  return !!(w && w[modelId]);
}

/**
 * Is the rule for `modelId` on vehicle `v` set to replace only when old? The vehicle group's own entry wins when it
 * exists; otherwise the company flag applies live (so a group rule keeps inheriting the company flag by default).
 * Rival-owned vehicles never read the player's group table.
 */
export function isReplaceWhenOldFor(state, v, modelId = v.modelId) {
  const company = state.company;
  if (v && v.ownerId == null && v.groupId != null && company) {
    const byGroup = company.groupAutoreplaceWhenOld && company.groupAutoreplaceWhenOld[v.groupId];
    if (byGroup && Object.prototype.hasOwnProperty.call(byGroup, modelId)) return byGroup[modelId] === true;
  }
  return isReplaceWhenOld(state, modelId);
}

/**
 * Tri-state view for the UI: `inherited` means the group has no entry and follows `company`; otherwise `value` is the
 * group's explicit on/off. Company scope (groupId null) is always inherited-by-definition with the company value.
 * @returns {{value:boolean, inherited:boolean, company:boolean}}
 */
export function autoreplaceWhenOldState(state, groupId, modelId) {
  const company = state.company;
  const byGroup = groupId != null && company
    && company.groupAutoreplaceWhenOld && company.groupAutoreplaceWhenOld[groupId];
  if (byGroup && Object.prototype.hasOwnProperty.call(byGroup, modelId)) {
    return { value: byGroup[modelId] === true, inherited: false, company: isReplaceWhenOld(state, modelId) };
  }
  const c = isReplaceWhenOld(state, modelId);
  return { value: c, inherited: true, company: c };
}

/**
 * Set/clear one group's replace-when-old entry. `value` true/false is an explicit override; null removes the entry
 * so the group follows the company flag again. Lazy: the map and group key are absent while unset. No SAVE_REVISION
 * bump: the map rides along in state.company like the other lazy maps (and older saves simply lack it).
 * @returns {{ok:true,whenOld:(boolean|null)}|{ok:false,error:string}}
 */
export function setGroupAutoreplaceWhenOld(state, groupId, oldModelId, value, opts = {}) {
  const company = state.company;
  if (!((company && company.groups) || []).some((g) => g.id === groupId)) return { ok: false, error: 'Unknown group' };
  if (!MODEL_BY_ID[oldModelId]) return { ok: false, error: 'Unknown vehicle model' };
  if (!opts.dryRun) {
    if (value == null) {
      clearGroupWhenOld(company, groupId, oldModelId);
    } else {
      company.groupAutoreplaceWhenOld ??= {};
      company.groupAutoreplaceWhenOld[groupId] ??= {};
      company.groupAutoreplaceWhenOld[groupId][oldModelId] = !!value;
    }
  }
  return { ok: true, whenOld: value == null ? null : !!value };
}

function clearWhenOld(company, modelId) {
  if (!company.autoreplaceWhenOld) return;
  delete company.autoreplaceWhenOld[modelId];
  if (!Object.keys(company.autoreplaceWhenOld).length) delete company.autoreplaceWhenOld;
}

/**
 * Keep-length / wagon removal (OpenTTD company.renew_keep_length + GroupFlag::ReplaceWagonRemoval, autoreplace_cmd.cpp
 * :595,:612). TT has uniform wagon lengths and replacements preserve the wagon count, so the OpenTTD length
 * comparison is vacuous; the cap form is kept instead: with this on, a replaced train keeps at most
 * min(oldWagons, min(maxTrainWagons, floor(2*maxTrainLength + 1e-9) - 1)) wagons (autorenew.js).
 *
 * The company setting `renewKeepLength` (settings.js) is the default. A group can override it lazily through
 * company.groupReplaceWagonRemoval = { [groupId]: true|false }; an absent entry follows the company setting live (a
 * deviation from OpenTTD's copy-at-creation: no key is written unless the group is set). Both keys are absent in
 * default games, so saves stay unchanged (no SAVE_REVISION bump).
 */
export function isKeepLength(state) {
  return getSetting(state, 'renewKeepLength') === true;
}

/** Effective keep-length for one vehicle: its group's explicit flag wins, else the company setting. Rivals are never trimmed. */
export function isKeepLengthFor(state, v) {
  if (!v || v.ownerId != null) return false;
  const company = state.company;
  if (v.groupId != null && company && company.groupReplaceWagonRemoval
    && Object.prototype.hasOwnProperty.call(company.groupReplaceWagonRemoval, v.groupId)) {
    return company.groupReplaceWagonRemoval[v.groupId] === true;
  }
  return isKeepLength(state);
}

/**
 * Tri-state view for the UI: `inherited` means the group has no entry and follows `company`; otherwise `value` is the
 * group's explicit on/off. Company scope (groupId null) is always inherited-by-definition with the company value.
 * @returns {{value:boolean, inherited:boolean, company:boolean}}
 */
export function keepLengthState(state, groupId) {
  const company = state.company;
  const c = isKeepLength(state);
  const byGroup = groupId != null && company && company.groupReplaceWagonRemoval;
  if (byGroup && Object.prototype.hasOwnProperty.call(byGroup, groupId)) {
    return { value: byGroup[groupId] === true, inherited: false, company: c };
  }
  return { value: c, inherited: true, company: c };
}

/**
 * Set/clear one group's keep-length entry. `value` true/false is an explicit override; null removes the entry so the
 * group follows the company setting again. Lazy: the map and group key are absent while unset.
 * @returns {{ok:true,keepLength:(boolean|null)}|{ok:false,error:string}}
 */
export function setGroupKeepLength(state, groupId, value, opts = {}) {
  const company = state.company;
  if (!((company && company.groups) || []).some((g) => g.id === groupId)) return { ok: false, error: 'Unknown group' };
  if (!opts.dryRun) {
    if (value == null) {
      const all = company.groupReplaceWagonRemoval;
      if (all) {
        delete all[groupId];
        if (!Object.keys(all).length) delete company.groupReplaceWagonRemoval;
      }
    } else {
      company.groupReplaceWagonRemoval ??= {};
      company.groupReplaceWagonRemoval[groupId] = !!value;
    }
  }
  return { ok: true, keepLength: value == null ? null : !!value };
}
