/**
 * Scenario editor generation tools (OpenTTD town_gui.cpp / industry_gui.cpp ScenarioEditor windows):
 * random town (one, chosen size), many random towns (~area/1024), many random industries (same count
 * as the new-game default), and remove all towns / remove all industries. Editor-only: every entry
 * point refuses outside an editor map. Uses the game rng (deterministic); editing is free.
 * Removing towns keeps their roads (OpenTTD keeps town roads); houses and the town record go.
 */
import { isEditor } from './scenarioEditor.js';
import { createTown, generateTowns, townSpotOk } from './towns.js';
import { generateIndustries, industryTiles } from './industries.js';
import { removeIndustry } from './loco/industryManager.js';
import { recomputeAllAcceptance } from './stations.js';
import { TOWN_MIN_DIST } from './cmdFound.js';

/** Town size choices of the editor window (layout size 1..3). */
export const TOWN_SIZES = Object.freeze({ small: 1, medium: 2, large: 3 });

const NOT_EDITOR = { ok: false, error: 'not in the scenario editor' };

/**
 * Found one random town of the given size ('small'|'medium'|'large'|'random') on a free site.
 * @param {{state:object, rng:object}} game
 * @returns {{ok:true, town:object}|{ok:false, error:string}}
 */
export function randomTown(game, size = 'random') {
  const { state, rng } = game;
  if (!isEditor(state)) return NOT_EDITOR;
  const layout = size === 'random' ? undefined : TOWN_SIZES[size];
  if (size !== 'random' && layout === undefined) return { ok: false, error: `unknown town size ${size}` };
  const { map } = state;
  for (let attempt = 0; attempt < 600; attempt++) {
    const x = rng.int(6, map.width - 7), y = rng.int(6, map.height - 7);
    if (!townSpotOk(state, x, y, TOWN_MIN_DIST)) continue;
    const town = createTown(state, rng, x, y, undefined, layout);
    recomputeAllAcceptance(state);
    return { ok: true, town: { id: town.id, name: town.name, x, y } };
  }
  return { ok: false, error: 'No free site for a town' };
}

/** Number of towns for ~area/1024 (OpenTTD 'normal' scale). */
export function manyTownCount(state) {
  return Math.max(1, Math.round((state.map.width * state.map.height) / 1024));
}

/**
 * Found about area/1024 random towns (the generator's own site search).
 * @returns {{ok:true, added:number}|{ok:false, error:string}}
 */
export function manyRandomTowns(game) {
  const { state, rng } = game;
  if (!isEditor(state)) return NOT_EDITOR;
  const before = state.towns.length;
  generateTowns(state, rng, manyTownCount(state));
  recomputeAllAcceptance(state);
  return { ok: true, added: state.towns.length - before };
}

/** Industry count of the new-game default for this map size (18 at 96x96). */
export function manyIndustryCount(state) {
  return Math.max(1, Math.round((18 * state.map.width * state.map.height) / (96 * 96)));
}

/**
 * Place about the new-game default count of random industries (all types, round-robin).
 * @returns {{ok:true, added:number}|{ok:false, error:string}}
 */
export function manyRandomIndustries(game) {
  const { state, rng } = game;
  if (!isEditor(state)) return NOT_EDITOR;
  const before = state.industries.length;
  generateIndustries(state, rng, manyIndustryCount(state));
  recomputeAllAcceptance(state);
  return { ok: true, added: state.industries.length - before };
}

/**
 * Remove every town: its houses go (tiles cleared, owner reset); its roads stay, as in OpenTTD.
 * @returns {{ok:true, removed:number}|{ok:false, error:string}}
 */
export function removeAllTowns(game) {
  const { state } = game;
  if (!isEditor(state)) return NOT_EDITOR;
  const removed = state.towns.length;
  const ids = new Set(state.towns.map((t) => t.id));
  for (const t of state.map.tiles) {
    if (t.building && t.building.type === 'house' && ids.has(t.building.townId)) {
      t.building = null;
      if (t.owner === 'town') t.owner = null;
    }
  }
  state.towns = [];
  // mirror deleteTown: subsidies and traffic tied to the removed towns go too
  if (state.subsidies) {
    const hit = (e) => e && e.type === 'town' && ids.has(e.id);
    const keep = (s) => !hit(s.src) && !hit(s.dst);
    if (state.subsidies.offers) state.subsidies.offers = state.subsidies.offers.filter(keep);
    if (state.subsidies.awarded) state.subsidies.awarded = state.subsidies.awarded.filter(keep);
  }
  if (state.traffic && Array.isArray(state.traffic.cars)) {
    state.traffic.cars = state.traffic.cars.filter((c) => !ids.has(c.townId));
    if (state.traffic.perTown) for (const id of ids) delete state.traffic.perTown[id];
  }
  recomputeAllAcceptance(state);
  return { ok: true, removed };
}

/**
 * Remove every industry: footprints cleared, records dropped (uses the industry removal of the game).
 * @returns {{ok:true, removed:number}|{ok:false, error:string}}
 */
export function removeAllIndustries(game) {
  const { state } = game;
  if (!isEditor(state)) return NOT_EDITOR;
  const list = state.industries.slice();
  for (const ind of list) removeIndustry(game, ind);
  // any footprint tile left behind (defensive) is cleared too
  for (const ind of list) for (const p of industryTiles(ind)) {
    const t = state.map.tiles[p.y * state.map.width + p.x];
    if (t.building && t.building.type === 'industry' && t.building.industryId === ind.id) t.building = null;
  }
  recomputeAllAcceptance(state);
  return { ok: true, removed: list.length };
}
