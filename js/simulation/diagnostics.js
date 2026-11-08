/**
 * Issue detector: runs every diagnostic check over a Game and returns a flat Issue list.
 * Pure: reads game.state and optional game.trafficStats(); never mutates.
 */
import { checkTrackBits, checkTownRoads, checkDeadEnds } from './diagChecksMap.js';
import { checkInvariants, checkVehicles, checkOrderAcceptance, checkStations, checkFinance, checkTraffic } from './diagChecksEntities.js';

/** Severity order used for display. */
export const SEVERITIES = ['error', 'warn', 'info'];

/**
 * Run all checks over a game.
 * @param {object} game Game instance (needs .state; optional .trafficStats())
 * @returns {{id:string,severity:'error'|'warn'|'info',category:string,message:string,x?:number,y?:number,vehicleId?:number,stationId?:number,townId?:number}[]}
 */
export function runDiagnostics(game) {
  const out = [];
  for (const stage of diagStages()) out.push(...stage(game));
  return out;
}

/**
 * The scan as ordered independent stages (each reads game only). runDiagnostics runs them all;
 * the UI scan runs one stage per idle slice so no single frame pays for the whole scan.
 * @returns {Array<(game:object)=>object[]>}
 */
export function diagStages() {
  return [
    (g) => checkInvariants(g.state),
    (g) => checkTrackBits(g.state),
    (g) => checkTownRoads(g.state),
    (g) => checkDeadEnds(g.state),
    (g) => checkVehicles(g.state),
    (g) => checkOrderAcceptance(g.state),
    (g) => checkStations(g.state),
    (g) => checkTraffic(typeof g.trafficStats === 'function' ? safeStats(g) : null),
    (g) => checkFinance(g.state),
  ];
}

/** Call game.trafficStats() defensively; null when it throws or is absent. */
function safeStats(game) {
  try {
    return game.trafficStats() || null;
  } catch {
    return null;
  }
}

/**
 * Issue family key for dedup: strip trailing `:*` aggregation markers.
 * For per-entity issues, group by the base type (before entity/cargo instance suffixes)
 * so same (type,town/station/vehicle) collapse.
 * @param {{id:string}} issue
 * @returns {string}
 */
export function issueFamily(issue) {
  const id = String(issue && issue.id || '');
  if (id.endsWith(':*')) return id.slice(0, -2);
  // station-waiting:stId:cargoId -> station-waiting
  if (id.startsWith('station-waiting:')) return 'station-waiting';
  if (id.startsWith('station-rating:')) return 'station-rating';
  if (id.startsWith('town-unlinked:')) return 'town-unlinked';
  if (id.startsWith('town-roads-split:')) return 'town-roads-split';
  if (id.startsWith('vehicle-no-acceptor:')) return 'vehicle-no-acceptor';
  if (id.startsWith('vehicle-lost:')) return 'vehicle-lost';
  if (id.startsWith('vehicle-no-orders:')) return 'vehicle-no-orders';
  if (id.startsWith('vehicle-loss-making:')) return 'vehicle-loss-making';
  if (id.startsWith('vehicle-old:')) return 'vehicle-old';
  if (id.startsWith('invariant-dup-id:')) return 'invariant-dup-id';
  if (id.startsWith('invariant-vehicle-nan:')) return 'invariant-vehicle-nan';
  if (id.startsWith('invariant-tile-station:')) return 'invariant-tile-station';
  if (id.startsWith('invariant-tile-depot:')) return 'invariant-tile-depot';
  if (id.startsWith('invariant-station-tile:')) return 'invariant-station-tile';
  // road/rail half-link, track-bit-out-of-map have coords in id but family by type
  if (id.startsWith('road-half-link')) return 'road-half-link';
  if (id.startsWith('rail-half-link')) return 'rail-half-link';
  if (id.startsWith('track-bit-out-of-map')) return 'track-bit-out-of-map';
  if (id.startsWith('track-steep')) return 'track-steep';
  if (id.startsWith('road-dead-ends')) return 'road-dead-ends';
  return id;
}

/**
 * Dedup key: same type/family for the same town or station collapses into one row.
 * Entity-less issues (or those with only x,y) keep their full id so distinct locations remain.
 * @param {any} issue
 * @returns {string}
 */
export function dedupKey(issue) {
  const fam = issueFamily(issue);
  if (issue && typeof issue.townId === 'number') return `${fam}|town:${issue.townId}`;
  if (issue && typeof issue.stationId === 'number') return `${fam}|station:${issue.stationId}`;
  if (issue && typeof issue.vehicleId === 'number') return `${fam}|vehicle:${issue.vehicleId}`;
  return fam + '|' + String(issue && issue.id || '');
}

/**
 * Merge duplicate issues (same dedup key) into one representative with `count` and
 * representative location/entity refs preserved for click-through.
 * @param {any[]} issues
 * @returns {any[]}
 */
export function dedupIssues(issues) {
  /** @type {Map<string, any>} */
  const by = new Map();
  const out = [];
  for (const it of issues) {
    const k = dedupKey(it);
    const prev = by.get(k);
    if (!prev) {
      const row = { ...it, count: 1, ids: [it.id] };
      by.set(k, row);
      out.push(row);
    } else {
      prev.count++;
      if (prev.ids) prev.ids.push(it.id);
      // keep first location, but fill in missing focus target if representative lacked it
      if (prev.x == null && typeof it.x === 'number') { prev.x = it.x; prev.y = it.y; }
      if (prev.vehicleId == null && typeof it.vehicleId === 'number') prev.vehicleId = it.vehicleId;
      if (prev.stationId == null && typeof it.stationId === 'number') prev.stationId = it.stationId;
      if (prev.townId == null && typeof it.townId === 'number') prev.townId = it.townId;
    }
  }
  return out;
}

/**
 * Count issues by severity and category.
 * @param {{severity:string,category:string,count?:number}[]} issues
 * @returns {{error:number,warn:number,info:number,byCategory:Object<string,number>}}
 */
export function summarizeIssues(issues) {
  const out = { error: 0, warn: 0, info: 0, byCategory: {} };
  for (const it of issues) {
    const n = typeof it.count === 'number' && it.count > 0 ? it.count : 1;
    if (out[it.severity] !== undefined) out[it.severity] += n;
    out.byCategory[it.category] = (out.byCategory[it.category] || 0) + n;
  }
  return out;
}
