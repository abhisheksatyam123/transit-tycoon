/**
 * Window registry: maps a window name to its module's open function.
 * Each window module exports `open<Name>(app, arg)` and returns the FloatingWindow.
 */
import { openTileInfo } from './tileInfo.js';
import { openStation } from './station.js';
import { openTown } from './town.js';
import { openIndustry } from './industry.js';
import { openTownList } from './townList.js';
import { openIndustryList } from './industryList.js';
import { openDepot } from './depot.js';
import { openBuyVehicle } from './buyVehicle.js';
import { openVehicleList } from './vehicleList.js';
import { openVehicleDetail } from './vehicleDetail.js';
import { openOrders } from './orders.js';
import { openFinances } from './finances.js';
import { openNews } from './news.js';
import { openTraffic } from './traffic.js';
import { openIssues } from './issues.js';
import { openNewGame } from './newGame.js';
import { openHelp } from './help.js';
import { openSave, openLoad } from './saveLoad.js';
import { openMetro } from './metro.js';

/** @type {Record<string,(app:any,arg?:any)=>any>} */
const REGISTRY = {
  tileInfo: openTileInfo,
  station: openStation,
  town: openTown,
  industry: openIndustry,
  towns: openTownList,
  industries: openIndustryList,
  depot: openDepot,
  buyVehicle: openBuyVehicle,
  vehicles: openVehicleList,
  vehicle: openVehicleDetail,
  orders: openOrders,
  finances: openFinances,
  news: openNews,
  traffic: openTraffic,
  issues: openIssues,
  newGame: openNewGame,
  help: openHelp,
  save: openSave,
  load: openLoad,
  metro: openMetro,
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
    console.warn('Unknown window', name);
    return null;
  }
  return fn(app, arg);
}
