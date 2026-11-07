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
