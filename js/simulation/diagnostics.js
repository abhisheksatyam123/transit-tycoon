/**
 * Issue detector: runs every diagnostic check over a Game and returns a flat Issue list.
 * Pure: reads game.state and optional game.trafficStats(); never mutates.
 */
import { checkTrackBits, checkTownRoads, checkDeadEnds } from './diagChecksMap.js';
import { checkInvariants, checkVehicles, checkStations, checkFinance, checkTraffic } from './diagChecksEntities.js';

/** Severity order used for display. */
export const SEVERITIES = ['error', 'warn', 'info'];

/**
 * Run all checks over a game.
 * @param {object} game Game instance (needs .state; optional .trafficStats())
 * @returns {{id:string,severity:'error'|'warn'|'info',category:string,message:string,x?:number,y?:number,vehicleId?:number,stationId?:number,townId?:number}[]}
 */
export function runDiagnostics(game) {
  const state = game.state;
  const stats = typeof game.trafficStats === 'function' ? safeStats(game) : null;
  return [
    ...checkInvariants(state),
    ...checkTrackBits(state),
    ...checkTownRoads(state),
    ...checkDeadEnds(state),
    ...checkVehicles(state),
    ...checkStations(state),
    ...checkTraffic(stats),
    ...checkFinance(state),
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
 * Count issues by severity and category.
 * @param {{severity:string,category:string}[]} issues
 * @returns {{error:number,warn:number,info:number,byCategory:Object<string,number>}}
 */
export function summarizeIssues(issues) {
  const out = { error: 0, warn: 0, info: 0, byCategory: {} };
  for (const it of issues) {
    if (out[it.severity] !== undefined) out[it.severity]++;
    out.byCategory[it.category] = (out.byCategory[it.category] || 0) + 1;
  }
  return out;
}
