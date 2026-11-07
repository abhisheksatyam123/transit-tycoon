/**
 * Subsidies (OpenTTD subsidy.cpp style).
 *
 * state.subsidies = { nextId, offers:[{id,cargoId,src:{type,id},dst:{type,id},expiresMonths}],
 *   awarded:[{...offer, companyAwarded:true, multiplier, remainingMonths}] } is created lazily on the first offer.
 * Randomness never touches game.rng: each month derives a local PRNG from (seed, year*12+month).
 * Multiplier and award duration are settings (subsidyMultiplier, subsidyMonths; OpenTTD difficulty.subsidy_multiplier /
 * subsidy_duration), read when an award is made. Offers last OFFER_MONTHS.
 */
import { makeRng } from './rng.js';
import { getSetting } from './settings.js';
import { notify } from './news.js';
import { findIndustry, findTown, manhattan } from './state.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { CARGO_BY_ID } from '../config/cargos.js';

export const MAX_OFFERS = 4;
export const OFFER_MONTHS = 12;
export const AWARD_MONTHS = 12;
/** Offered durations in months (Settings window). */
export const SUBSIDY_MONTH_OPTIONS = [12, 24, 36, 60];
/** Offered multipliers (Settings window). */
export const SUBSIDY_MULTIPLIER_OPTIONS = [1.5, 2, 3, 4];
const OFFER_CHANCE = 0.5;
/** Cargos accepted by towns (besides industries accepting them). */
const TOWN_CARGOS = ['PASS', 'MAIL', 'GOOD', 'FOOD'];
/** Radius (tiles) around a town centre / around an industry's footprint that counts as "at" the endpoint. */
const TOWN_RADIUS = 14;
const INDUSTRY_RADIUS = 6;

/** Entity record of a subsidy endpoint or null. */
function endpoint(state, e) {
  return e.type === 'town' ? findTown(state, e.id) : findIndustry(state, e.id);
}

/** Centre of an endpoint. */
function centre(ent, e) {
  return e.type === 'town' ? { x: ent.x, y: ent.y } : { x: ent.x + (ent.w - 1) / 2, y: ent.y + (ent.h - 1) / 2 };
}

/** Is tile (x,y) at the subsidy endpoint? */
function near(state, e, x, y) {
  const ent = endpoint(state, e);
  if (!ent) return false;
  if (e.type === 'town') return manhattan(ent.x, ent.y, x, y) <= TOWN_RADIUS;
  return x >= ent.x - INDUSTRY_RADIUS && x <= ent.x + ent.w - 1 + INDUSTRY_RADIUS &&
    y >= ent.y - INDUSTRY_RADIUS && y <= ent.y + ent.h - 1 + INDUSTRY_RADIUS;
}

/** Display name of an endpoint. */
export function endpointName(state, e) {
  const ent = endpoint(state, e);
  return ent ? ent.name : '(gone)';
}

/** Position of an endpoint (for scrolling the view) or null. */
export function endpointPos(state, e) {
  const ent = endpoint(state, e);
  return ent ? centre(ent, e) : null;
}

function describe(state, s) {
  const c = CARGO_BY_ID[s.cargoId];
  return `${c ? c.name : s.cargoId} from ${endpointName(state, s.src)} to ${endpointName(state, s.dst)}`;
}

/** Try to create one new offer with the supplied rng; returns the offer or null. */
function makeOffer(state, rng) {
  const { width, height } = state.map;
  const minD = Math.max(8, Math.min(20, Math.round(Math.min(width, height) / 8)));
  const maxD = Math.max(minD + 10, Math.min(120, Math.round(Math.max(width, height) / 2)));
  const sources = [];
  for (const ind of state.industries) for (const c of INDUSTRY_BY_ID[ind.typeId].produces) sources.push({ type: 'industry', id: ind.id, cargoId: c });
  for (const t of state.towns) if (t.population > 0) sources.push({ type: 'town', id: t.id, cargoId: 'PASS' });
  if (!sources.length) return null;
  const taken = (cargoId, src, dst) => [...state.subsidies?.offers || [], ...state.subsidies?.awarded || []].some((s) =>
    s.cargoId === cargoId && ((s.src.type === src.type && s.src.id === src.id) || (s.dst.type === dst.type && s.dst.id === dst.id)));
  for (let attempt = 0; attempt < 12; attempt++) {
    const s = rng.pick(sources);
    if (!CARGO_BY_ID[s.cargoId]) continue;
    const sEnt = endpoint(state, s);
    const sp = centre(sEnt, s);
    const dsts = [];
    for (const ind of state.industries) if (INDUSTRY_BY_ID[ind.typeId].accepts.includes(s.cargoId)) dsts.push({ type: 'industry', id: ind.id });
    if (TOWN_CARGOS.includes(s.cargoId)) for (const t of state.towns) if (t.population > 0) dsts.push({ type: 'town', id: t.id });
    const ok = dsts.filter((d) => {
      if (d.type === s.type && d.id === s.id) return false;
      const dp = centre(endpoint(state, d), d);
      const dist = manhattan(sp.x, sp.y, dp.x, dp.y);
      return dist >= minD && dist <= maxD && !taken(s.cargoId, s, d);
    });
    if (!ok.length) continue;
    const dst = rng.pick(ok);
    return { id: 0, cargoId: s.cargoId, src: { type: s.type, id: s.id }, dst, expiresMonths: OFFER_MONTHS };
  }
  return null;
}

/** Monthly update: age/expire offers and awards, maybe offer a new subsidy. */
export function updateMonthly(game) {
  const state = game.state;
  const sub = state.subsidies;
  if (sub) {
    const alive = (s) => endpoint(state, s.src) && endpoint(state, s.dst);
    sub.offers = sub.offers.filter((o) => {
      o.expiresMonths--;
      if (o.expiresMonths > 0 && alive(o)) return true;
      notify(game.ctx, `Subsidy offer expired: ${describe(state, o)}`, 'info', 'subsidy');
      return false;
    });
    sub.awarded = sub.awarded.filter((a) => {
      a.remainingMonths--;
      if (a.remainingMonths > 0 && alive(a)) return true;
      notify(game.ctx, `Subsidy expired: ${describe(state, a)}`, 'info', 'subsidy');
      return false;
    });
  }
  if (!getSetting(state, 'subsidies')) return;
  if (sub && sub.offers.length >= MAX_OFFERS) return;
  const rng = makeRng(`subsidy:${state.seed}:${state.date.year * 12 + state.date.month}`);
  if (!rng.chance(OFFER_CHANCE)) return;
  const offer = makeOffer(state, rng);
  if (!offer) return;
  if (!state.subsidies) state.subsidies = { nextId: 1, offers: [], awarded: [] };
  offer.id = state.subsidies.nextId++;
  state.subsidies.offers.push(offer);
  notify(game.ctx, `Subsidy offered: ${describe(state, offer)}`, 'good', 'subsidy');
}

/**
 * Payment multiplier of a delivery; awards a matching open offer on its first delivery.
 * @param {object} state
 * @param {string} cargoId
 * @param {number} fromX cargo source x
 * @param {number} fromY cargo source y
 * @param {{x:number,y:number}} toStation destination station
 * @param {{state:object,emit?:Function}} [ctx] when given, awarding posts news
 * @returns {number} 1 = no subsidy
 */
export function subsidyMultiplier(state, cargoId, fromX, fromY, toStation, ctx) {
  const sub = state.subsidies;
  if (!sub) return 1;
  const hit = (s) => s.cargoId === cargoId && near(state, s.src, fromX, fromY) && near(state, s.dst, toStation.x, toStation.y);
  const active = sub.awarded.find(hit);
  if (active) return active.multiplier;
  const i = sub.offers.findIndex(hit);
  if (i < 0) return 1;
  const [o] = sub.offers.splice(i, 1);
  const multiplier = getSetting(state, 'subsidyMultiplier');
  const months = getSetting(state, 'subsidyMonths');
  const award = { ...o, companyAwarded: true, multiplier, remainingMonths: months };
  delete award.expiresMonths;
  sub.awarded.push(award);
  if (ctx) notify(ctx, `Subsidy awarded to ${state.company.name}: ${describe(state, award)} (payments x${award.multiplier} for ${award.remainingMonths} months)`, 'good', 'subsidy');
  return award.multiplier;
}
