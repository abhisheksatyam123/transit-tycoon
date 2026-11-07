/**
 * Tool registry. A tool receives tile coordinates from input.js:
 *   move(tile) on hover, down(tile) on left press, up(tile) on left release,
 *   key(event) for tool-specific keys (return true if consumed), cancel() on deactivate.
 */
import { createTramTool } from './tram.js';
import { createRailTool } from './rail.js';
import { createRoadTool } from './road.js';
import { createStationTool } from './station.js';
import { createBusStopTool } from './busStop.js';
import { createTramStopTool } from './tramStop.js';
import { createTruckStopTool } from './truckStop.js';
import { createDepotTool } from './depot.js';
import { createDemolishTool } from './demolish.js';
import { createElectrifyTool } from './electrify.js';
import { createWaypointTool, createRoadWaypointTool } from './waypoint.js';
import { createQueryTool } from './query.js';
import { createAirportTool } from './airport.js';
import { createTerraformTool, createPlantTool } from './terraform.js';
import { createFoundTownTool, createFundIndustryTool } from './found.js';
import { createHQTool } from './hq.js';
import { createObjectsTool } from './objects.js';
import { createSignalTool } from './signal.js';
import { createOneWayTool } from './oneWay.js';
import { createShipTool } from './ship.js';
import { createCanalTool, createLockTool } from './canal.js';
import { createSignTool } from './sign.js';

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
    oneWay: createOneWayTool(app),
    tram: createTramTool(app),
    station: createStationTool(app),
    busStop: createBusStopTool(app),
    tramStop: createTramStopTool(app),
    truckStop: createTruckStopTool(app),
    railDepot: createDepotTool(app, 'rail'),
    roadDepot: createDepotTool(app, 'road'),
    demolish: createDemolishTool(app),
    electrify: createElectrifyTool(app),
    waypoint: createWaypointTool(app),
    roadWaypoint: createRoadWaypointTool(app),
    query: createQueryTool(app),
    airport: createAirportTool(app, 'city'),
    smallAirport: createAirportTool(app, 'small'),
    heliport: createAirportTool(app, 'heliport'),
    commuterAirport: createAirportTool(app, 'commuter'),
    metroAirport: createAirportTool(app, 'metropolitan'),
    intlAirport: createAirportTool(app, 'international'),
    helidepot: createAirportTool(app, 'helidepot'),
    helistation: createAirportTool(app, 'helistation'),
    terraform: createTerraformTool(app),
    plant: createPlantTool(app),
    foundTown: createFoundTownTool(app),
    fundIndustry: createFundIndustryTool(app),
    hq: createHQTool(app),
    objects: createObjectsTool(app),
    signal: createSignalTool(app),
    sign: createSignTool(app),
    dock: createShipTool(app, 'dock'),
    shipDepot: createShipTool(app, 'shipDepot'),
    buoy: createShipTool(app, 'buoy'),
    canal: createCanalTool(app),
    lock: createLockTool(app),
  };
}
