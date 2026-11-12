/**
 * Exclusive engine preview (OpenTTD engine.cpp: _calendar_engines_daily, GetPreviewCompany,
 * AcceptEnginePreview, CmdWantEnginePreview, NewVehicleAvailable). Opt-in `enginePreview` setting.
 *
 * When a vehicle model reaches its intro year, it is first offered exclusively to one company:
 *  - the company with the best performance index that has not been asked yet and runs a vehicle of the
 *    same kind (OTTD GetPreviewCompany: performance_history, same vehicle type);
 *  - a rival (AI) accepts at once (OTTD AI: the script decides; our rivals always take it);
 *  - the player gets an offer dialog (event 'enginePreview'); no answer within PREVIEW_WAIT_DAYS = decline
 *    (OTTD preview_wait = 20 days);
 *  - a declined or timed-out offer goes to the next company; when none is left the model is public.
 * Accepted: the holder alone can buy the model for EXCLUSIVE_DAYS (365); then it is public with news.
 *
 * State is lazy: state.enginePreview = { models: { [modelId]: rec } } exists only while the setting is on.
 * rec = { status: 'offer'|'exclusive'|'public', offer: key|null, holder: key|null, asked: key[], wait, until, block? }.
 * block (enginePreviewBlock only): { [key]: dayNumber until which the company is not offered this model }.
 * key = 'p' (player) or 'r<rivalId>'. Nothing here draws from the game rng (determinism).
 */
import { ALL_VEHICLE_MODELS } from '../config/vehicles.js';
import { getSetting } from './settings.js';
import { companyById } from './owner.js';
import { notify } from './news.js';
import { dayNumber } from './date.js';

export const PREVIEW_WAIT_DAYS = 20; // OpenTTD engine.cpp preview_wait = 20 days
export const EXCLUSIVE_DAYS = 365; // one year of exclusive use
export const BLOCK_DAYS = 600; // OpenTTD engine.cpp block_preview = 20 months (20 x 30 days); enginePreviewBlock setting

/** Company key used in preview records: 'p' = player, 'r<id>' = rival. */
export function ownerKey(ownerId) { return ownerId == null ? 'p' : 'r' + ownerId; }
function keyOwner(key) { return key === 'p' ? null : Number(key.slice(1)); }

/** Vehicle class used for the "same kind of vehicle" check (matches cmdVehicle kind field). */
function vehicleKindOf(model) {
  return model.kind === 'engine' ? 'train' : model.kind === 'aircraft' ? 'aircraft' : model.kind === 'ship' ? 'ship' : 'road';
}

/** Words for the news and dialog. */
function typeWord(model) {
  return model.kind === 'engine' ? 'train' : model.kind === 'bus' ? 'bus' : model.kind === 'aircraft' ? 'aircraft' : model.kind === 'ship' ? 'ship' : model.kind === 'tram' ? 'tram' : 'truck';
}

/** Models that take part in previews: real vehicles (not wagons, not opt-in extras, not news-less). */
export function previewable(model) {
  return !!model && model.kind !== 'wagon' && !model.optIn;
}

/**
 * True while `model` is held back from `ownerId` (null = player) by an engine preview.
 * Always false when the setting is off or the model has no preview record (unchanged availability).
 */
export function previewBlocks(state, model, ownerId = null) {
  if (!state || !model || !state.enginePreview || !getSetting(state, 'enginePreview')) return false;
  const rec = state.enginePreview.models[model.id];
  if (!rec || rec.status === 'public') return false;
  return !(rec.status === 'exclusive' && rec.holder === ownerKey(ownerId));
}

/** The offer currently waiting for the player (or null). Used by the UI on load. */
export function pendingPlayerOffer(state) {
  if (!state || !state.enginePreview) return null;
  for (const id of Object.keys(state.enginePreview.models)) {
    const rec = state.enginePreview.models[id];
    if (rec.status === 'offer' && rec.offer === 'p') return id;
  }
  return null;
}

/**
 * Companies that may be offered a model, best performance first (OTTD GetPreviewCompany).
 * A company whose rec.block[key] date has not passed is skipped (enginePreviewBlock; block is only set when on).
 */
export function bestCompanyKey(state, model, rec) {
  const kind = vehicleKindOf(model);
  const keys = [ownerKey(null), ...(state.rivals || []).filter((r) => !r.bankrupt).map((r) => ownerKey(r.id))];
  const today = dayNumber(state.date);
  let best = null, bestPerf = -1;
  for (const key of keys) {
    if (rec.asked.includes(key)) continue;
    if (rec.block && rec.block[key] > today) continue;
    const owner = keyOwner(key);
    const co = companyById(state, owner);
    if (!co) continue;
    const runs = state.vehicles.some((v) => (v.ownerId ?? null) === owner && v.kind === kind);
    if (!runs) continue;
    const perf = co.performanceIndex || 0;
    if (perf > bestPerf) { best = key; bestPerf = perf; }
  }
  return best;
}

/** enginePreviewBlock: the company is not offered this model again for BLOCK_DAYS (OTTD block_preview). No-op when off. */
function blockCompany(state, rec, key) {
  if (!getSetting(state, 'enginePreviewBlock')) return;
  if (!rec.block) rec.block = {};
  rec.block[key] = dayNumber(state.date) + BLOCK_DAYS;
}

/** Make the model public: news once, then the rest of the world can buy it (OTTD NewVehicleAvailable). */
function makePublic(ctx, model, rec) {
  rec.status = 'public'; rec.offer = null; rec.holder = null; rec.wait = 0;
  if (model.news !== false) notify(ctx, `New ${typeWord(model)} now available: ${model.name} (${model.speed} km/h) — open Autoreplace to upgrade.`, 'good', undefined, undefined, 'newVehicle');
}

/** Ask the best remaining company; with none left the model becomes public. A rival accepts at once. */
function offerNext(ctx, model, rec) {
  const { state } = ctx;
  const key = bestCompanyKey(state, model, rec);
  if (!key) { makePublic(ctx, model, rec); return; }
  rec.asked.push(key);
  if (key === 'p') {
    rec.status = 'offer'; rec.offer = 'p'; rec.wait = PREVIEW_WAIT_DAYS;
    if (ctx.emit) ctx.emit('enginePreview', { modelId: model.id });
    return;
  }
  grant(ctx, model, rec, key); // rival AI takes the exclusive year automatically
}

function grant(ctx, model, rec, key) {
  rec.status = 'exclusive'; rec.holder = key; rec.offer = null; rec.wait = 0;
  rec.until = dayNumber(ctx.state.date) + EXCLUSIVE_DAYS;
}

/** Start the preview for every model whose intro year has arrived; first call creates the state. */
function ensureState(state) {
  if (state.enginePreview) return state.enginePreview;
  // turning the setting on mid-game: models already introduced stay public (no retro offers)
  const models = {};
  for (const m of ALL_VEHICLE_MODELS) if (previewable(m) && m.introYear <= state.date.year) models[m.id] = { status: 'public', offer: null, holder: null, asked: [], wait: 0 };
  state.enginePreview = { models };
  return state.enginePreview;
}

/**
 * Player answer to an offer (OTTD CmdWantEnginePreview). accept -> exclusive for the player;
 * decline -> the next company is asked.
 * @returns {{ok:true}|{ok:false,error:string}}
 */
export function answerEnginePreview(ctx, modelId, accept) {
  const { state } = ctx;
  const model = ALL_VEHICLE_MODELS.find((m) => m.id === modelId);
  const rec = model && state.enginePreview && state.enginePreview.models[modelId];
  if (!rec || rec.status !== 'offer' || rec.offer !== 'p') return { ok: false, error: 'No engine preview offer for this model' };
  if (accept) grant(ctx, model, rec, 'p');
  else { blockCompany(state, rec, 'p'); rec.offer = null; offerNext(ctx, model, rec); }
  if (ctx.emit) ctx.emit('enginePreviewClosed', { modelId });
  return { ok: true };
}

/**
 * Daily (gameLoop tickDate, after VehicleManager): start previews for newly introduced models, count the
 * player's answer timer, and make accepted models public after EXCLUSIVE_DAYS. Does nothing when off.
 */
export function updateDaily(game) {
  const state = game.state;
  if (!getSetting(state, 'enginePreview')) return;
  const ctx = game.ctx;
  const year = state.date.year;
  const st = ensureState(state);
  for (const m of ALL_VEHICLE_MODELS) {
    if (!previewable(m) || st.models[m.id] || m.introYear > year) continue;
    st.models[m.id] = { status: 'offer', offer: null, holder: null, asked: [], wait: 0 };
    offerNext(ctx, m, st.models[m.id]);
  }
  for (const m of ALL_VEHICLE_MODELS) {
    const rec = st.models[m.id];
    if (!rec) continue;
    if (rec.status === 'offer' && rec.offer === 'p') {
      rec.wait -= 1;
      if (rec.wait <= 0) { blockCompany(state, rec, 'p'); rec.offer = null; if (ctx.emit) ctx.emit('enginePreviewClosed', { modelId: m.id }); offerNext(ctx, m, rec); }
    } else if (rec.status === 'exclusive' && dayNumber(state.date) >= rec.until) {
      makePublic(ctx, m, rec);
    }
  }
}
