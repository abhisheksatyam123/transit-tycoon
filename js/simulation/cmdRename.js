/**
 * Rename commands (OpenTTD CMD_RENAME_STATION / _VEHICLE / _TOWN / _COMPANY).
 * Only the existing `name` field changes; ids are never derived from names, so orders, lists and
 * saves keep referring to the entity by id. Depots have no name field in this game (not renamed).
 *
 * Rules (validateName): trimmed, 1..32 characters (code points), no control characters.
 * Stations, towns and vehicles must be unique among their own kind (case-insensitive, like
 * OpenTTD IsUniqueStationName); the entity being renamed is excluded from the check.
 * The company name only has the length/character rules (there is one company).
 */
import { findStation, findTown, findVehicle } from './state.js';

export const MAX_NAME_LENGTH = 32;

/**
 * Validate and normalise a requested name.
 * @param {unknown} raw
 * @returns {{ok:true,name:string}|{ok:false,error:string}}
 */
export function validateName(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Name must be text' };
  const name = raw.trim();
  if (!name) return { ok: false, error: 'Name cannot be empty' };
  if ([...name].length > MAX_NAME_LENGTH) return { ok: false, error: `Name is longer than ${MAX_NAME_LENGTH} characters` };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { ok: false, error: 'Name contains control characters' };
  return { ok: true, name };
}

/** True when no other entity in `list` already has this name (case-insensitive). */
function isUnique(list, name, selfId) {
  const low = name.toLowerCase();
  return !list.some((e) => e.id !== selfId && String(e.name || '').toLowerCase() === low);
}

/** Shared body: validate, check uniqueness, store (unless dryRun). */
function renameWith(entity, raw, list, uniqueError, opts) {
  const r = validateName(raw);
  if (!r.ok) return r;
  if (list && !isUnique(list, r.name, entity.id)) return { ok: false, error: uniqueError };
  if (opts.dryRun) return { ok: true, cost: 0, name: r.name };
  entity.name = r.name;
  return { ok: true, cost: 0, name: r.name };
}

/** Rename a station (name must be unique among stations). */
export function renameStation(ctx, id, name, opts = {}) {
  const { state } = ctx;
  const st = findStation(state, id);
  if (!st) return { ok: false, error: 'Unknown station' };
  return renameWith(st, name, state.stations, 'A station with this name already exists', opts);
}

/** Rename a vehicle (name must be unique among vehicles). */
export function renameVehicle(ctx, id, name, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  return renameWith(v, name, state.vehicles, 'A vehicle with this name already exists', opts);
}

/** Rename a town (name must be unique among towns). */
export function renameTown(ctx, id, name, opts = {}) {
  const { state } = ctx;
  const t = findTown(state, id);
  if (!t) return { ok: false, error: 'Unknown town' };
  return renameWith(t, name, state.towns, 'A town with this name already exists', opts);
}

/** Rename the company (no uniqueness rule: single company). */
export function renameCompany(ctx, name, opts = {}) {
  const { state } = ctx;
  return renameWith(state.company, name, null, '', opts);
}
