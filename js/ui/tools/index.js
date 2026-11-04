/**
 * Tool registry. A tool receives tile coordinates from input.js:
 *   move(tile) on hover, down(tile) on left press, up(tile) on left release,
 *   key(event) for tool-specific keys (return true if consumed), cancel() on deactivate.
 */
import { createRailTool } from './rail.js';
import { createRoadTool } from './road.js';
import { createStationTool } from './station.js';
import { createBusStopTool } from './busStop.js';
import { createTruckStopTool } from './truckStop.js';
import { createDepotTool } from './depot.js';
import { createDemolishTool } from './demolish.js';
import { createQueryTool } from './query.js';
import { createAirportTool } from './airport.js';

/**
 * @typedef {Object} Tool
 * @property {string} id
 * @property {string} label
 * @property {string} hint
 * @property {(t:{x:number,y:number})=>void} move
 * @property {(t:{x:number,y:number})=>void} down
 * @property {(t:{x:number,y:number})=>void} up
 * @property {(e:KeyboardEvent)=>boolean} [key]
 * @property {()=>void} cancel
 */

/**
 * Build all toolbar tools.
 * @param {import('../app.js').App} app
 * @returns {Record<string, Tool>}
 */
export function createTools(app) {
  return {
    rail: createRailTool(app),
    road: createRoadTool(app),
    station: createStationTool(app),
    busStop: createBusStopTool(app),
    truckStop: createTruckStopTool(app),
    railDepot: createDepotTool(app, 'rail'),
    roadDepot: createDepotTool(app, 'road'),
    demolish: createDemolishTool(app),
    query: createQueryTool(app),
    airport: createAirportTool(app),
  };
}
