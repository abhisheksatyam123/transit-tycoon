/**
 * Map signs (OpenTTD signs_cmd.cpp: CMD_PLACE_SIGN / CMD_RENAME_SIGN; a sign is a text label on a tile).
 * Stored lazily as state.signs = [{id, x, y, text}] (absent until the first sign is placed), so worlds
 * without signs serialize exactly as before. Editing to empty text deletes the sign (OpenTTD behaviour).
 * Signs are free in this game (display-only landmarks).
 */
import { allocId } from './state.js';

export const SIGN_MAX_LENGTH = 32;

/**
 * Validate sign text: trimmed, at most SIGN_MAX_LENGTH code points, no control characters.
 * Empty text is valid here (it means delete for editSign).
 * @param {unknown} raw
 * @returns {{ok:true,text:string}|{ok:false,error:string}}
 */
export function validateSignText(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Sign text must be text' };
  const text = raw.trim();
  if ([...text].length > SIGN_MAX_LENGTH) return { ok: false, error: `Sign text is longer than ${SIGN_MAX_LENGTH} characters` };
  if (/[\u0000-\u001f\u007f]/.test(text)) return { ok: false, error: 'Sign text contains control characters' };
  return { ok: true, text };
}

/** Sign on a tile, or null. */
export function signAt(state, x, y) {
  const list = state.signs;
  if (!list) return null;
  for (const s of list) if (s.x === x && s.y === y) return s;
  return null;
}

/** Sign by id, or null. */
export function findSign(state, id) {
  const list = state.signs;
  if (!list) return null;
  return list.find((s) => s.id === id) || null;
}

/**
 * Place a sign on an in-map tile (one sign per tile: placing on a tile that already has one edits it).
 * @returns {{ok:true,sign:object,cost:number}|{ok:false,error:string}}
 */
export function placeSign(ctx, x, y, raw, opts = {}) {
  const { state } = ctx;
  const m = state.map;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= m.width || y >= m.height) {
    return { ok: false, error: 'Site is outside the map' };
  }
  const r = validateSignText(raw);
  if (!r.ok) return r;
  if (!r.text) return { ok: false, error: 'Sign text cannot be empty' };
  const existing = signAt(state, x, y);
  if (existing) return editSign(ctx, existing.id, raw, opts);
  if (opts.dryRun) return { ok: true, cost: 0, sign: null };
  state.signs ??= [];
  const sign = { id: allocId(state), x, y, text: r.text };
  state.signs.push(sign);
  return { ok: true, cost: 0, sign };
}

/**
 * Change a sign's text; empty text deletes it.
 * @returns {{ok:true,sign:object|null,cost:number}|{ok:false,error:string}}
 */
export function editSign(ctx, id, raw, opts = {}) {
  const { state } = ctx;
  const sign = findSign(state, id);
  if (!sign) return { ok: false, error: 'Unknown sign' };
  const r = validateSignText(raw);
  if (!r.ok) return r;
  if (!r.text) return deleteSign(ctx, id, opts);
  if (opts.dryRun) return { ok: true, cost: 0, sign };
  sign.text = r.text;
  return { ok: true, cost: 0, sign };
}

/** Delete a sign by id (the lazy list is dropped when it becomes empty, so the save stays unchanged). */
export function deleteSign(ctx, id, opts = {}) {
  const { state } = ctx;
  const sign = findSign(state, id);
  if (!sign) return { ok: false, error: 'Unknown sign' };
  if (opts.dryRun) return { ok: true, cost: 0, sign: null };
  state.signs = state.signs.filter((s) => s !== sign);
  if (!state.signs.length) delete state.signs;
  return { ok: true, cost: 0, sign: null };
}
