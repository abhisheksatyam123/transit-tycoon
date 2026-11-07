/**
 * Scenario editor town / industry edits (OpenLoco TownWindow "Expand town" + "Delete town", IndustryWindow
 * "Demolish industry"; OpenTTD CmdExpandTown / CmdDeleteTown / CmdDeleteIndustry-style editor commands).
 * Editor-only: every entry point refuses outside an editor map (isEditor). Editing is free.
 *
 * expandTown: runs the normal town growth step 8 times (OpenLoco TownWindow expand: 8 x Town::grow).
 * deleteTown: removes the town's houses, its town-owned roads and the town record. Refused while any
 *   company station references the town (OpenTTD CmdDeleteTown: stations/waypoints/depots refuse).
 *   Town-linked records (subsidy endpoints, traffic cars of the town) are dropped so nothing dangles.
 * demolishIndustry: the industry removal of the game (removeIndustry), as the demolish tool uses.
 */
import { isEditor } from './scenarioEditor.js';
import { growTown } from './loco/townGrow.js';
import { removeIndustry } from './loco/industryManager.js';
import { recomputeAllAcceptance } from './stations.js';
import { recomputePopulation } from './towns.js';
import { DIR_BY_BIT } from './constants.js';
import { nearestTown } from './state.js';

const NOT_EDITOR = { ok: false, error: 'not in the scenario editor' };
/** OpenLoco TownWindow expand handler: the growth step is run this many times. */
export const EXPAND_STEPS = 8;

/**
 * @param {any} game
 * @param {number} townId
 * @returns {{ok:true, houses:number, grew:boolean}|{ok:false,error:string}}
 */
export function expandTown(game, townId) {
  const { state } = game;
  if (!isEditor(state)) return NOT_EDITOR;
  const town = state.towns.find((t) => t.id === townId);
  if (!town) return { ok: false, error: 'Unknown town' };
  const before = town.houses.length;
  let grew = false;
  for (let i = 0; i < EXPAND_STEPS; i++) if (growTown(game, town)) grew = true;
  recomputePopulation(state, town);
  recomputeAllAcceptance(state);
  return { ok: true, houses: town.houses.length - before, grew };
}

/**
 * @param {any} game
 * @param {number} townId
 * @returns {{ok:true, houses:number, roads:number}|{ok:false,error:string}}
 */
export function deleteTown(game, townId) {
  const { state } = game;
  if (!isEditor(state)) return NOT_EDITOR;
  const town = state.towns.find((t) => t.id === townId);
  if (!town) return { ok: false, error: 'Unknown town' };
  if (state.stations.some((st) => st.townId === townId)) {
    return { ok: false, error: `Stations belong to ${town.name}; remove them first` };
  }
  const { map } = state;
  let houses = 0, roads = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (t.building && t.building.type === 'house' && t.building.townId === townId) {
      t.building = null; // large-house parts all carry the townId, so every part goes
      if (t.owner === 'town') t.owner = null;
      houses++;
    }
  }
  // town-owned roads (no station, rail, building): their bits also leave the neighbours
  const w = map.width, h = map.height;
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (t.owner !== 'town' || !t.road || t.rail || t.building) continue;
    const x = i % w, y = (i - x) / w;
    if (nearestTown(state, x, y) !== town) continue; // only this town's roads (road tiles carry no townId)
    for (const bit of [1, 2, 4, 8]) {
      if (!(t.road & bit)) continue;
      const d = DIR_BY_BIT[bit];
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = map.tiles[ny * w + nx];
      const back = { 1: 4, 2: 8, 4: 1, 8: 2 }[bit];
      n.road &= ~back;
    }
    t.road = 0; t.owner = null; roads++;
  }
  state.towns = state.towns.filter((tw) => tw.id !== townId);
  if (state.subsidies) {
    const hit = (e) => e && e.type === 'town' && e.id === townId;
    const keep = (s) => !hit(s.src) && !hit(s.dst);
    if (state.subsidies.offers) state.subsidies.offers = state.subsidies.offers.filter(keep);
    if (state.subsidies.awarded) state.subsidies.awarded = state.subsidies.awarded.filter(keep);
  }
  if (state.traffic && Array.isArray(state.traffic.cars)) {
    state.traffic.cars = state.traffic.cars.filter((c) => c.townId !== townId);
    if (state.traffic.perTown) delete state.traffic.perTown[townId];
  }
  recomputeAllAcceptance(state);
  return { ok: true, houses, roads };
}

/**
 * @param {any} game
 * @param {number} industryId
 */
export function demolishIndustry(game, industryId) {
  const { state } = game;
  if (!isEditor(state)) return NOT_EDITOR;
  const ind = state.industries.find((i) => i.id === industryId);
  if (!ind) return { ok: false, error: 'Unknown industry' };
  removeIndustry(game, ind);
  return { ok: true, name: ind.name };
}
