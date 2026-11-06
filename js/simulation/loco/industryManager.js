/**
 * IndustryManager. Ported from OpenLoco (MIT), src/World/IndustryManager.cpp
 * (tick, updateDaily, updateMonthly, tryCreateNewIndustriesMonthly, createNewIndustry,
 * findRandomNewIndustryLocation, capOfTypeOfIndustry, canIndustryObjBeCreated, updateProducedCargoStats)
 * and the closure part of GameCommands/Industries/RemoveIndustry.
 *
 * Adaptations: OpenLoco distances are in 1/32-tile units on a 384x384 map; this game's maps are much smaller, so
 * the "too close" / "cluster" distances are given in tiles below (9 and 20). Terrain flags map to
 * type.placement ('nearTown' | 'awayTown' | 'nearTrees') and type.builtInClusters; water/buildings/rails are
 * rejected by canPlaceIndustry. totalOfType scales with state.industryFactor (default 2 = "high", OpenLoco 0..2).
 * Note: capOfTypeOfIndustry's random part is `(s/2) * (randNext(0xFF) / 256)` in C++ integer maths, i.e. always 0;
 * the RNG call is kept, the result is too.
 */
import { INDUSTRY_TYPES, INDUSTRY_BY_ID } from '../../config/industries.js';
import { clearFarmFields } from '../farmFields.js';
import { canPlaceIndustry, placeIndustry } from '../industries.js';
import { notify } from '../news.js';
import { recomputeAllAcceptance } from '../stations.js';
import { manhattan } from '../state.js';
import * as Industry from './industry.js';

export const CLOSE_INDUSTRY_DISTANCE_MAX = 9; // kCloseIndustryDistanceMax (480/32=15, scaled for small maps)
export const INDUSTRY_WITHIN_CLUSTER_DISTANCE = 20; // kIndustryWithinClusterDistance (960/32=30)
export const NUM_INDUSTRY_IN_CLUSTER = 3;
export const FIND_RANDOM_NEW_INDUSTRY_ATTEMPTS = 250;
const DIST_NEAR_TOWN_MAX = 18; // 576/32
const DIST_AWAY_TOWN_MIN = 24; // 768/32
const TREES_NEAR_MIN = 25;
/** New industries stay this far (tiles) from the Moscow scenario centre. */
const MOSCOW_EXCLUDE_FRACTION = 0.12; // of the map's shorter side (~ the 30-tile (200 m) Kremlin zone)

/** IndustryManager::tick: only the farm tile loop lives here in OpenLoco (not simulated). */
export function tick(_game) {}

/** IndustryManager::updateProducedCargoStats (called daily here; OpenLoco: when the tile loop wraps). */
export function updateProducedCargoStats(game) {
  for (const ind of game.state.industries) Industry.updateProducedCargoStats(game.state, ind);
}

/** IndustryManager::updateDaily. */
export function updateDaily(game) {
  updateProducedCargoStats(game);
  for (const ind of game.state.industries) Industry.updateDaily(game, ind);
}

/** canCargoTypeBeProducedInWorld. */
function canCargoBeProduced(state, cargo) {
  return state.industries.some((i) => (INDUSTRY_BY_ID[i.typeId].produces || []).includes(cargo));
}

/** canIndustryObjBeCreated. */
function canIndustryTypeBeCreated(state, type) {
  const year = state.date.year;
  if (year < (type.designedYear ?? 0) || year >= (type.obsoleteYear ?? 9999)) return false;
  if (!type.accepts.length) return true;
  return type.accepts.some((c) => canCargoBeProduced(state, c)); // requiresAllCargo is never set
}

/** capOfTypeOfIndustry. */
export function capOfTypeOfIndustry(game, type) {
  const factor = game.state.industryFactor ?? 2;
  const total = type.totalOfType ?? 2;
  const inter = Math.floor(((factor + 1) * total) / 3);
  const staticPreferred = inter - Math.floor(inter / 4);
  const random = Math.floor(staticPreferred / 2) * Math.floor(game.rng.int(0, 0xff) / 256);
  return staticPreferred + random;
}

function isTooCloseToNearbyIndustries(state, x, y) {
  return state.industries.some((o) => manhattan(x, y, o.x, o.y) < CLOSE_INDUSTRY_DISTANCE_MAX);
}

/** isOutwithCluster. */
function isOutwithCluster(state, type, x, y) {
  let n = 0;
  for (const o of state.industries) {
    if (o.typeId !== type.id) continue;
    n++;
    if (manhattan(x, y, o.x, o.y) < INDUSTRY_WITHIN_CLUSTER_DISTANCE) return false;
  }
  return n >= NUM_INDUSTRY_IN_CLUSTER;
}

function countForest(state, x, y) {
  const m = state.map;
  let n = 0;
  for (let yy = Math.max(0, y - 5); yy <= Math.min(m.height - 1, y + 5); yy++) {
    for (let xx = Math.max(0, x - 5); xx <= Math.min(m.width - 1, x + 5); xx++) if (m.tiles[yy * m.width + xx].terrain === 'forest') n++;
  }
  return n;
}

function nearestTownOf(state, x, y) {
  let best = null, bd = Infinity;
  for (const t of state.towns) { const d = manhattan(x, y, t.x, t.y); if (d < bd) { bd = d; best = t; } }
  return best ? { town: best, dist: bd } : null;
}

function inMoscowCentre(state, x, y) {
  const f = state.scenario === 'moscow' && state.scenarioMeta && state.scenarioMeta.focus;
  return !!f && Math.hypot(x - f.x, y - f.y) < MOSCOW_EXCLUDE_FRACTION * Math.min(state.map.width, state.map.height);
}

/** findRandomNewIndustryLocation: random top-left tile passing the type's placement rules, or null. */
export function findRandomNewIndustryLocation(game, type) {
  const { state, rng } = game, m = state.map;
  for (let i = 0; i < FIND_RANDOM_NEW_INDUSTRY_ATTEMPTS; i++) {
    const x = rng.int(2, m.width - type.w - 3), y = rng.int(2, m.height - type.h - 3);
    if (isTooCloseToNearbyIndustries(state, x, y)) continue;
    if (type.builtInClusters && isOutwithCluster(state, type, x, y)) continue;
    if (inMoscowCentre(state, x, y)) continue;
    if (type.placement === 'nearTown' || type.placement === 'awayTown') {
      const near = nearestTownOf(state, x, y);
      if (!near) continue;
      if (type.placement === 'nearTown' && near.dist > DIST_NEAR_TOWN_MAX) continue;
      if (type.placement === 'awayTown' && near.dist < DIST_AWAY_TOWN_MIN) continue;
    }
    if (type.placement === 'nearTrees' && countForest(state, x, y) < TREES_NEAR_MIN) continue;
    if (!canPlaceIndustry(state, type, x, y, { ignoreSpacing: true })) continue;
    if (state.towns.some((t) => manhattan(t.x, t.y, x, y) < 8)) continue;
    return { x, y };
  }
  return null;
}

/** createNewIndustry (buildImmediately=false: production ramps up from 0). */
export function createNewIndustry(game, type, numAttempts) {
  for (let a = 0; a < numAttempts; a++) {
    const loc = findRandomNewIndustryLocation(game, type);
    if (!loc) continue;
    const ind = placeIndustry(game.state, type.id, loc.x, loc.y);
    Industry.ensureIndustryState(ind, game.state, { immediate: false });
    ind.foundingYear = game.state.date.year;
    recomputeAllAcceptance(game.state);
    notify(game.ctx, `New ${type.name} opened: ${ind.name}.`, 'good', loc.x + (type.w >> 1), loc.y + (type.h >> 1));
    return ind;
  }
  return null;
}

/** tryCreateNewIndustriesMonthly. */
function tryCreateNewIndustriesMonthly(game) {
  const s = game.state;
  if (s.disallowIndustriesStartUp) return;
  for (const type of INDUSTRY_TYPES) {
    if (!canIndustryTypeBeCreated(s, type)) continue;
    const count = s.industries.reduce((n, i) => n + (i.typeId === type.id ? 1 : 0), 0);
    if (count >= capOfTypeOfIndustry(game, type)) continue;
    createNewIndustry(game, type, 25);
  }
}

/** RemoveIndustry: clear the footprint and drop the record. */
export function removeIndustry(game, ind) {
  const s = game.state, m = s.map;
  clearFarmFields(s, ind); // T29: fields of a closed farm are removed (no-op when none)
  for (let y = ind.y; y < ind.y + ind.h; y++) {
    for (let x = ind.x; x < ind.x + ind.w; x++) {
      const t = m.tiles[y * m.width + x];
      if (t.building && t.building.type === 'industry' && t.building.industryId === ind.id) t.building = null;
    }
  }
  s.industries = s.industries.filter((i) => i.id !== ind.id);
  recomputeAllAcceptance(s);
}

/** IndustryManager::updateMonthly. */
export function updateMonthly(game) {
  const s = game.state;
  tryCreateNewIndustriesMonthly(game);
  for (const ind of s.industries.slice()) {
    const cx = ind.x + (ind.w >> 1), cy = ind.y + (ind.h >> 1);
    const res = Industry.updateMonthly(game, ind, (text, kind, x, y) => notify(game.ctx, text, kind, x, y));
    if (res === 'remove') {
      notify(game.ctx, `${ind.name} has closed down.`, 'bad', cx, cy);
      removeIndustry(game, ind);
    }
  }
}
