/**
 * Window registry: maps a window name to its module's open function.
 * Each window module exports `open<Name>(app, arg)` and returns the FloatingWindow.
 */
import { logger } from '../logger.js';
import { openTileInfo } from './tileInfo.js';
import { openStation } from './station.js';
import { openTown } from './town.js';
import { openIndustry } from './industry.js';
import { openTownList } from './townList.js';
import { openIndustryList } from './industryList.js';
import { openSignList } from './signList.js';
import { openStationList } from './stationList.js';
import { openDepot } from './depot.js';
import { openWaypoint } from './waypoint.js';
import { openWaypointList } from './waypointList.js';
import { openPlantTrees } from './plantTrees.js';
import { openDepotList } from './depotList.js';
import { openFundIndustry } from './fundIndustry.js';
import { openBuyVehicle } from './buyVehicle.js';
import { openVehicleList } from './vehicleList.js';
import { openVehicleDetail } from './vehicleDetail.js';
import { openOrders } from './orders.js';
import { openFinances } from './finances.js';
import { openNews } from './news.js';
import { openTraffic } from './traffic.js';
import { openIssues } from './issues.js';
import { openNewGame } from './newGame.js';
import { openScenarioSetup, openScenarioEditor } from './scenarioEditor.js';
import { openHelp } from './help.js';
import { openSave, openLoad } from './saveLoad.js';
import { openMetro } from './metro.js';
import { openGoals } from './goals.js';
import { openSettings } from './settings.js';
import { openCheats } from './cheats.js';
import { openHallOfFame } from './hallOfFame.js';
import { openSubsidies } from './subsidies.js';
import { openObjective } from './objective.js';
import { openStoryBook } from './storyBook.js';
import { openGraphs, openCargoRates } from './graphs.js';
import { openMap } from './map.js';
import { openAutoreplace } from './autoreplace.js';
import { openCompanies } from './companies.js';
import { openCompanyInfrastructure } from './companyInfrastructure.js';
import { openHotkeys } from './hotkeys.js';
import { openExtraViewport } from './extraViewport.js';

/** @type {Record<string,(app:any,arg?:any)=>any>} */
const REGISTRY = {
  hotkeys: openHotkeys,
  tileInfo: openTileInfo,
  station: openStation,
  town: openTown,
  fundIndustry: openFundIndustry,
  industry: openIndustry,
  towns: openTownList,
  industries: openIndustryList,
  signs: openSignList,
  stations: openStationList,
  depot: openDepot,
  waypoint: openWaypoint,
  waypoints: openWaypointList,
  plantTrees: openPlantTrees,
  depots: openDepotList,
  buyVehicle: openBuyVehicle,
  vehicles: openVehicleList,
  vehicle: openVehicleDetail,
  orders: openOrders,
  finances: openFinances,
  news: openNews,
  traffic: openTraffic,
  issues: openIssues,
  newGame: openNewGame,
  scenarioSetup: openScenarioSetup,
  scenarioEditor: openScenarioEditor,
  help: openHelp,
  save: openSave,
  load: openLoad,
  hallOfFame: openHallOfFame,
  metro: openMetro,
  goals: openGoals,
  settings: openSettings,
  cheats: openCheats,
  subsidies: openSubsidies,
  objective: openObjective,
  storyBook: openStoryBook,
  graphs: openGraphs,
  cargoRates: openCargoRates,
  map: openMap,
  autoreplace: openAutoreplace,
  companies: openCompanies,
  companyInfrastructure: openCompanyInfrastructure,
  extraViewport: openExtraViewport,
};

/**
 * Open a window by name.
 * @param {import('../app.js').App} app
 * @param {string} name
 * @param {any} [arg]
 * @returns {any}
 */
export function openWindow(app, name, arg) {
  const fn = REGISTRY[name];
  if (!fn) {
    if (!logger.warn('window', `Unknown window ${name}`)) console.warn('Unknown window', name);
    return null;
  }
  return fn(app, arg);
}