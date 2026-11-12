/**
 * Autoreplace rules (OpenTTD autoreplace_gui / autoreplace_cmd, simplified): per company, "replace model A with
 * model B". Stored lazily in state.company.autoreplace = { [oldModelId]: newModelId } (absent when empty).
 * Applied by autorenew.js when a vehicle of model A is stopped in a depot.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { purchasable } from './vehicles.js';
import { getSetting } from './settings.js';

/** Models that can replace `modelId`: same kind (engine/bus/truck/aircraft), purchasable in `year`, not itself. */
export function replacementCandidates(modelId, year, neverExpire = false) {
  const old = MODEL_BY_ID[modelId];
  if (!old || old.kind === 'wagon') return [];
  return Object.values(MODEL_BY_ID).filter((m) => m.kind === old.kind && m.id !== old.id
    && m.introYear <= year && purchasable(m, year, neverExpire)
    && (old.kind !== 'bus' && old.kind !== 'truck' || m.cargos.some((c) => old.cargos.includes(c))));
}

/**
 * Set (newModelId) or clear (null) an autoreplace rule for `oldModelId`.
 * @returns {{ok:true,rule:object}|{ok:false,error:string}}
 */
export function setAutoreplace(state, oldModelId, newModelId, opts = {}) {
  const year = state.date.year;
  const old = MODEL_BY_ID[oldModelId];
  if (!old || old.kind === 'wagon') return { ok: false, error: 'Unknown vehicle model' };
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
  const nw = MODEL_BY_ID[newModelId];
  if (!nw || nw.kind === 'wagon') return { ok: false, error: 'Unknown vehicle model' };
  if (nw.kind !== old.kind) return { ok: false, error: 'Replacement must be the same kind of vehicle' };
  if (nw.id === old.id) return { ok: false, error: 'Replacement is the same model' };
  if (nw.introYear > year) return { ok: false, error: 'Replacement not yet available' };
  if (!purchasable(nw, year, getSetting(state, 'neverExpireVehicles'))) return { ok: false, error: 'Replacement is obsolete' };
  if ((old.kind === 'bus' || old.kind === 'truck') && !nw.cargos.some((c) => old.cargos.includes(c))) {
    return { ok: false, error: 'Replacement cannot carry the same cargo' };
  }
  if (!opts.dryRun) {
    company.autoreplace ??= {};
    company.autoreplace[oldModelId] = newModelId;
  }
  return { ok: true, rule: { from: oldModelId, to: newModelId } };
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
  if (!old || old.kind === 'wagon') return { ok: false, error: 'Unknown vehicle model' };
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
