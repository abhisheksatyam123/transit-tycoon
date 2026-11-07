import { isTropic } from './climate.js';
/**
 * Game: composes the simulation modules. Owns `state` (plain JSON), the seeded RNG,
 * the event emitter, the tick loop, commands and queries. No DOM access.
 */
import { MAP_DEFAULTS, SAVE_VERSION } from './constants.js';
import { Emitter } from './events.js';
import { createRng, hashSeed } from './rng.js';
import { createMap, generateTerrain, getTile, inBounds, DENSITY } from './map.js';
import { generateTowns } from './towns.js';
import { generateIndustries, placeExtraIndustries, placeTropicIndustries, placeTropicChains } from './industries.js';
import { isToyland } from './climate.js';
import { connectTowns, repairTownRoads } from './townRoads.js';
import { createCompany, borrow, repay } from './economy.js';
import { isEditor, playScenario } from './scenarioEditor.js';
import { buildHQ, estimateHQ } from './cmdHQ.js';
import { acceptTakeover } from './aiCompanies.js';
import { tradeShare } from './shares.js';
import { buildObject, estimateObject } from './cmdObject.js';
import { industriesMonthStart } from './cargo.js';
import { catchmentTiles, recomputeAllAcceptance } from './stations.js';
import { getVehicleSegments } from './vehicles.js';
import { buildLine, demolish } from './cmdTrack.js';
import { convertRail } from './cmdElectrify.js';
import { buildSignal, removeSignal } from './signals.js';
import { cycleSignalType, flipSignal } from './pathSignals.js';
import { toggleOneWay } from './cmdOneWay.js';
import { terraform, estimateTerraform, planTerraform } from './cmdTerraform.js';
import { foundTown, fundIndustry, estimateFound } from './cmdFound.js';
import { buildDepot, buildRailStation, buildRoadStop } from './cmdStation.js';
import { buildAirport } from './cmdAirport.js';
import { buildDock, buildShipDepot, buildBuoy } from './cmdShip.js';
import { buildCanal, buildLock } from './cmdCanal.js';
import { townAction } from './townAuthority.js';
import * as vcmd from './cmdVehicle.js';
import { renameStation, renameVehicle, renameTown, renameCompany } from './cmdRename.js';
import { findStation, findVehicle } from './state.js';
import { notify } from './news.js';
import { listModels, stationsNear, tileInfo } from './queries.js';
import { parseState, serializeState } from './save.js';
import { buildScenario } from './scenarios/index.js';
import { createTraffic, trafficCars, trafficStats, trafficLoad } from './traffic.js';
import { initGoals, goalSnapshot } from './goals.js';
import { randomGoalSnapshot } from './randomGoals.js';
import { tick as locoTick } from './loco/gameLoop.js';
import { setSetting, getSetting, DEFAULT_SETTINGS } from './settings.js';
import { createObjective } from './objective.js';
import { SCENARIOS } from './scenarios/index.js';
import { setAutoreplace } from './autoreplace.js';
import * as gcmd from './cmdGroup.js';


/**
 * Build a named real-map scenario onto a freshly created game.
 * @param {Game} game
 * @param {{scenario:string,startYear:number}} o resolved options
 * @returns {Game}
 */
function createScenarioGame(game, o) {
  const s = game.state;
  s.scenario = o.scenario;
  const report = buildScenario(o.scenario, game);
  s.scenarioLog = report.log;
  notify(game.ctx, `Welcome to ${o.scenario}! ${s.company.name} was founded in ${o.startYear}. Connect the districts by metro and bus.`, 'good', undefined, undefined, 'general');
  return game;
}


/**
 * Apply scenario options after world generation: initial settings and the objective.
 * Nothing is written when no option is given (day-0 state of default games is unchanged).
 * @param {Game} game
 * @param {any} o resolved options
 */
function applyOptions(game, o) {
  const st = game.state;
  if (o.settings) {
    for (const k of Object.keys(o.settings)) if (k in DEFAULT_SETTINGS) setSetting(st, k, o.settings[k]);
  }
  let obj = o.objective;
  if (obj === undefined && o.scenario) {
    const sc = SCENARIOS.find((c) => c.id === o.scenario);
    obj = sc && sc.defaults ? sc.defaults.objective : undefined;
  }
  if (obj && obj.type && obj.type !== 'none') st.objective = createObjective(st, obj);
}

/**
 * Scenario editor map (see scenarioEditor.js): empty flat land, or generated terrain with no towns or industries.
 * Only reached with opts.editor, so normal games never get `state.editor`.
 */
function createEditorGame(game, o) {
  const state = game.state;
  state.editor = { startYear: state.date.year };
  if (!o.emptyFlat) {
    const mg = mapgenOptions(o.mapgen);
    if (Object.keys(mg).length) state.mapgen = mg;
    generateTerrain(state.map, game.rng, { waterRatio: o.waterRatio, ...mg });
  } else {
    // flat land at height 1 (height 0 reads as sea level, so towns and industries would refuse it);
    // no water at all: an empty flat map is land everywhere (OpenTTD flat-world editor map)
    for (const t of state.map.tiles) { t.terrain = 'grass'; t.height = 1; }
  }
  state.traffic = createTraffic(state);
  recomputeAllAcceptance(state);
  notify(game.ctx, `Scenario editor: build the landscape, towns and industries, then Play. Time is paused and editing is free.`, 'info', undefined, undefined, 'general');
  return game;
}

/** T34: keep only the explicit, non-default map generator options (terrain/seaLevel/rivers/smoothness, densities; climate + snowLine for sub-arctic). */
const MAPGEN_DEFAULTS = { terrain: 'normal', seaLevel: 'medium', rivers: 'none', smoothness: 'normal', townDensity: 'normal', industryDensity: 'normal', climate: 'temperate', snowLine: 5 };
export function mapgenOptions(src) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(MAPGEN_DEFAULTS)) if (src[k] !== undefined && src[k] !== MAPGEN_DEFAULTS[k]) out[k] = src[k];
  return out;
}

export class Game {
  /**
   * @param {object} state complete game state
   */
  constructor(state) {
    this.state = state;
    this.events = new Emitter();
    this.rng = createRng(state);
    /** ctx passed to command/sim modules: {state, emit} */
    this.ctx = { state, emit: (ev, payload) => this.events.emit(ev, payload) };
  }

  /**
   * Generate a new world.
   * @param {{seed?:number|string,width?:number,height?:number,startYear?:number,townCount?:number,industryCount?:number}} [opts]
   */
  static create(opts = {}) {
    const o = { ...MAP_DEFAULTS, ...opts };
    const state = {
      version: SAVE_VERSION, seed: o.seed, rngState: hashSeed(o.seed), tick: 0, dayCounter: 0,
      date: { year: o.startYear, month: 0, day: 1 },
      map: createMap(o.width, o.height),
      towns: [], industries: [], stations: [], depots: [], vehicles: [],
      company: createCompany(), news: [], nextId: 1,
    };
    const game = new Game(state);
    if (o.maxLoan > 0) state.company.maxLoan = Math.max(state.company.loan, Math.floor(o.maxLoan));
    if (o.editor) return createEditorGame(game, o);
    if (o.scenario && o.scenario !== 'random') {
      createScenarioGame(game, o);
      applyOptions(game, o);
      return game;
    }
    // T29 opt-in settings must be set before generation (they change what the generator places)
    for (const k of ['extraIndustries', 'farmFields', 'buildingEras']) if (o.settings && o.settings[k]) setSetting(state, k, true);
    // T34 map generator options: stored only when non-default so default saves are unchanged
    const mg = mapgenOptions(o.mapgen);
    if (Object.keys(mg).length) state.mapgen = mg;
    generateTerrain(state.map, game.rng, { waterRatio: o.waterRatio, ...mg });
    // density options scale the requested counts (normal = 1x, so default games are unchanged)
    const townMul = DENSITY[mg.townDensity ?? 'normal'] ?? 1, indMul = DENSITY[mg.industryDensity ?? 'normal'] ?? 1;
    generateTowns(state, game.rng, Math.max(1, Math.round(o.townCount * townMul)));
    generateIndustries(state, game.rng, Math.round(o.industryCount * indMul));
    if (getSetting(state, 'extraIndustries') && !isToyland(state)) placeExtraIndustries(state, game.rng); // T29 opt-in banks (temperate set; not toyland)
    if (isTropic(state)) { placeTropicIndustries(state, game.rng); placeTropicChains(state, game.rng); } // TP water + sub-tropical chain (tropic only)
    connectTowns(state);
    repairTownRoads(state);
    industriesMonthStart(state, game.rng);
    state.traffic = createTraffic(state);
    recomputeAllAcceptance(state);
    notify(game.ctx, `Welcome! ${state.company.name} was founded in ${o.startYear}. Connect industries and towns to earn money.`, 'good', undefined, undefined, 'general');
    applyOptions(game, o);
    return game;
  }

  /** @param {string|object} json */
  static deserialize(json) {
    return new Game(parseState(json));
  }

  /** @returns {string} */
  serialize() {
    return serializeState(this.state);
  }

  /** Goal progress for the UI: scenario objectives, or the random-world tutorial list (created on first call). */
  goals() { return this.state.scenario ? goalSnapshot(this.state) : randomGoalSnapshot(this.ctx); }

  /** Scenario editor: leave editor mode and start the company (see scenarioEditor.js). */
  playScenario() {
    const r = playScenario(this.state);
    if (r.ok) notify(this.ctx, `Scenario started: ${this.state.company.name} was founded in ${r.year}. Build the network and earn money.`, 'good', undefined, undefined, 'general');
    return r;
  }
  /** True while the map is in scenario editor mode. */
  isEditor() { return isEditor(this.state); }

  /** Subscribe to an event; returns unsubscribe fn. */
  on(event, fn) { return this.events.on(event, fn); }
  off(event, fn) { this.events.off(event, fn); }

  /** Advance the simulation by one tick (OpenLoco GameScene::tick, see loco/gameLoop.js). */
  step() { locoTick(this); }

  /** Run whole game days: tick until the date has advanced `n` times. */
  stepDays(n = 1) {
    for (let i = 0; i < n; i++) {
      const d = this.state.date.day, m = this.state.date.month, y = this.state.date.year;
      do this.step(); while (this.state.date.day === d && this.state.date.month === m && this.state.date.year === y);
    }
  }

  // ---- commands ----
  buildRail(x0, y0, x1, y1, opts) { return buildLine(this.ctx, 'rail', x0, y0, x1, y1, opts); }
  /** Player rail tunnel between two portals on a straight line (see cmdTrack buildTunnel). */
  buildTunnel(x0, y0, x1, y1, opts) { return buildLine(this.ctx, 'rail', x0, y0, x1, y1, { ...(opts || {}), tunnel: true }); }
  /** Player road tunnel (straight, same as rail). */
  buildRoadTunnel(x0, y0, x1, y1, opts) { return buildLine(this.ctx, 'road', x0, y0, x1, y1, { ...(opts || {}), tunnel: true }); }
  /** Player road valley bridge (straight, same as rail). */
  buildRoadBridge(x0, y0, x1, y1, opts) { return buildLine(this.ctx, 'road', x0, y0, x1, y1, { ...(opts || {}), bridge: true }); }
  /** Player rail valley bridge between two heads on a straight line (see cmdTrack buildLandBridge). */
  buildLandBridge(x0, y0, x1, y1, opts) { return buildLine(this.ctx, 'rail', x0, y0, x1, y1, { ...(opts || {}), bridge: true }); }
  buildTram(x0, y0, x1, y1, opts) { return buildLine(this.ctx, 'tram', x0, y0, x1, y1, opts || {}); }
  buildRoad(x0, y0, x1, y1, opts) { return buildLine(this.ctx, 'road', x0, y0, x1, y1, opts || {}); }
  /** Build along an explicit 4-connected tile path (opts.loop = closed ring); see shapes.js. */
  buildRailPath(path, opts) { return buildLine(this.ctx, 'rail', 0, 0, 0, 0, { ...(opts || {}), path }); }
  /** Build a road along a shape path. opts: { highway?: boolean } */
  buildRoadPath(path, opts) { return buildLine(this.ctx, 'road', 0, 0, 0, 0, { ...(opts || {}), path }); }
  demolish(x0, y0, x1, y1, opts) { return demolish(this.ctx, x0, y0, x1, y1, opts); }
  /** Electrify (or with opts.unelectrify remove catenary from) every rail tile in a rectangle. opts.dryRun = price only. */
  convertRail(x0, y0, x1, y1, opts) { return convertRail(this.ctx, x0, y0, x1, y1, opts || {}); }
  /** Block signal on a straight rail tile (T3b). opts.dryRun = check and price only. */
  buildSignal(x, y, opts) { return buildSignal(this.ctx, x, y, opts); }
  /** One-way road toggle on a straight road tile (T42): two-way -> +axis -> -axis -> two-way. */
  toggleOneWay(x, y, opts) { return toggleOneWay(this.ctx, x, y, opts); }
  /** Cycle an existing signal's kind: block -> oneway -> path -> block (T3c). */
  cycleSignalType(x, y, opts) { return cycleSignalType(this.state, x, y, opts); }
  flipSignal(x, y, opts) { return flipSignal(this.state, x, y, opts); }
  /** Remove the block signal on a tile (T3b). */
  removeSignal(x, y, opts) { return removeSignal(this.ctx, x, y, opts); }
  /** Terraform: op 'raise'|'lower'|'level'|'plant' over rect {x0,y0,x1,y1}. */
  terraform(op, rect, opts) { return terraform(this.ctx, op, rect, opts); }
  estimateTerraform(op, rect) { return estimateTerraform(this.state, op, rect); }
  planTerraform(op, rect) { return planTerraform(this.state, op, rect); }
  /** Found a town at tile (x,y) (OpenTTD CMD_FOUND_TOWN). Charges COSTS.foundTown; opts.dryRun = check only. */
  foundTown(x, y, opts) { return foundTown(this.ctx, x, y, opts); }
  /** Fund a new industry of typeId with top-left tile (x,y) (OpenTTD CMD_BUILD_INDUSTRY). */
  fundIndustry(typeId, x, y, opts) { return fundIndustry(this.ctx, typeId, x, y, opts); }
  /** Company HQ with top-left tile (x,y) (OpenTTD CMD_BUILD_OBJECT OBJECT_HQ). opts.dryRun = check only. */
  buildHQ(x, y, opts) { return buildHQ(this.ctx, x, y, opts); }
  estimateHQ(x, y) { return estimateHQ(this.state, x, y); }
  /** Buy a rival that has a takeover offer (aiCompanies.js). */
  acceptTakeover(rivalId) { return acceptTakeover(this.ctx, rivalId); }
  /** Buy or sell one 25% share of a rival (shares.js; setting 'shares'). */
  tradeShare(rivalId, action) { return tradeShare(this.ctx, rivalId, action); }
  /** Placeable object on tile (x,y): type 'transmitter' | 'lighthouse' | 'owned' (cmdObject.js). */
  buildObject(type, x, y, opts) { return buildObject(this.ctx, type, x, y, opts); }
  estimateObject(type, x, y) { return estimateObject(this.state, type, x, y); }
  /** Pure cost/validity preview: kind 'town'|'industry' (typeId for industry). */
  estimateFound(kind, x, y, typeId) { return estimateFound(this.state, kind, x, y, typeId); }
  buildRailStation(x, y, axis, length, opts) { return buildRailStation(this.ctx, x, y, axis, length, opts); }
  buildRoadStop(x, y, kind, opts) { return buildRoadStop(this.ctx, x, y, kind, opts); }
  buildDepot(x, y, kind, dir, opts) { return buildDepot(this.ctx, x, y, kind, dir, opts); }
  /** Airport footprint with top-left corner (x,y); see cmdAirport.js. */
  buildAirport(x, y, opts) { return buildAirport(this.ctx, x, y, opts); }
  /** Ship infrastructure (cmdShip.js): dock on land, ship depot and buoy on water. */
  buildDock(x, y, opts) { return buildDock(this.ctx, x, y, opts); }
  buildShipDepot(x, y, opts) { return buildShipDepot(this.ctx, x, y, opts); }
  buildBuoy(x, y, opts) { return buildBuoy(this.ctx, x, y, opts); }
  /** Canal along a straight line (x0,y0)-(x1,y1) on flat land (cmdCanal.js). */
  buildCanal(x0, y0, x1, y1, opts) { return buildCanal(this.ctx, x0, y0, x1, y1, opts); }
  /** Lock with middle tile (x,y) on a straight inclined slope (cmdCanal.js). */
  buildLock(x, y, opts) { return buildLock(this.ctx, x, y, opts); }
  buyVehicle(depotId, spec, opts) { return vcmd.buyVehicle(this.ctx, depotId, spec, opts); }
  setOrders(id, orders, opts) { return vcmd.setOrders(this.ctx, id, orders, opts); }
  /** Change the load/unload flags of one order: flags {load?, unload?}. */
  modifyOrder(id, index, flags, opts) { return vcmd.modifyOrder(this.ctx, id, index, flags, opts); }
  /** Jump the vehicle to order `index` (abandons the current stop; cargo stays aboard). */
  skipToOrder(id, index, opts) { return vcmd.skipToOrder(this.ctx, id, index, opts); }
  startVehicle(id, opts) { return vcmd.startVehicle(this.ctx, id, opts); }
  stopVehicle(id, opts) { return vcmd.stopVehicle(this.ctx, id, opts); }
  sendToDepot(id, opts) { return vcmd.sendToDepot(this.ctx, id, opts); }
  sellVehicle(id, opts) { return vcmd.sellVehicle(this.ctx, id, opts); }
  /** Turn a train around in place and re-plan (trains only). */
  reverseVehicle(id, opts) { return vcmd.reverseVehicle(this.ctx, id, opts); }
  /** Start (true) or stop (false) many vehicles; ids = vehicle ids. Skips those that cannot change. */
  massStartStop(ids, start, opts) { return vcmd.massStartStop(this.ctx, ids, start, opts); }
  /** Rename commands (cmdRename.js): name is validated and stored in the entity's name field. */
  renameStation(id, name, opts) { return renameStation(this.ctx, id, name, opts); }
  renameVehicle(id, name, opts) { return renameVehicle(this.ctx, id, name, opts); }
  /** Vehicle groups (cmdGroup.js): create / rename / delete a group; assign vehicles. */
  createGroup(name, opts) { return gcmd.createGroup(this.ctx, name, opts); }
  renameGroup(id, name, opts) { return gcmd.renameGroup(this.ctx, id, name, opts); }
  deleteGroup(id, opts) { return gcmd.deleteGroup(this.ctx, id, opts); }
  addVehicleToGroup(vehicleId, groupId, opts) { return gcmd.addVehicleToGroup(this.ctx, vehicleId, groupId, opts); }
  addSharedVehiclesToGroup(vehicleId, groupId, opts) { return gcmd.addSharedVehiclesToGroup(this.ctx, vehicleId, groupId, opts); }
  renameTown(id, name, opts) { return renameTown(this.ctx, id, name, opts); }
  /** Town authority action ('advertise_small'|'advertise_medium'|'advertise_large'|'statue'|'fund'); see townAuthority.js. */
  townAction(townId, actionId, opts) { return townAction(this.ctx, townId, actionId, opts); }
  renameCompany(name, opts) { return renameCompany(this.ctx, name, opts); }
  /** Clone a vehicle (same model/consist, copies orders; shareOrders joins its shared order list). */
  cloneVehicle(id, opts) { return vcmd.cloneVehicle(this.ctx, id, opts); }
  /** Refit a stopped, empty vehicle in a depot to another cargo (10% of the model price). */
  refitVehicle(id, cargoId, opts) { return vcmd.refitVehicle(this.ctx, id, cargoId, opts); }
  /** Consist editor (T19): add / sell wagons of a train stopped empty in a depot. */
  addWagons(id, n, opts) { return vcmd.addWagons(this.ctx, id, n, opts); }
  removeWagons(id, n, opts) { return vcmd.removeWagons(this.ctx, id, n, opts); }
  /** Mixed consists: add a wagon of `modelId` at the end of a train (cargoId optional). */
  addWagonModel(id, modelId, opts) { return vcmd.addWagonModel(this.ctx, id, modelId, opts); }
  /** Mixed consists: sell the wagon at `index` (its share of the depreciated value is refunded). */
  sellWagon(id, index, opts) { return vcmd.sellWagon(this.ctx, id, index, opts); }
  /** Mixed consists: move the wagon at `index` one place (delta -1 towards the engine, +1 away). */
  moveWagon(id, index, delta, opts) { return vcmd.moveWagon(this.ctx, id, index, delta, opts); }
  /** Leave the shared order list (keeps the current orders). */
  unshareOrders(id, opts) { return vcmd.unshareOrders(this.ctx, id, opts); }
  /** Service interval in days for one vehicle (0 = off). */
  setServiceInterval(id, days, opts) { return vcmd.setServiceInterval(this.ctx, id, days, opts); }
  /** Autoreplace rule (T18b): replace model oldModelId with newModelId in depots (null clears). */
  setAutoreplace(oldModelId, newModelId, opts) { return setAutoreplace(this.state, oldModelId, newModelId, opts); }
  /** Stop mode of one order: 'non' (non-stop, default), 'all' (stop at all stations), 'via' (go via). */
  setOrderStop(id, index, stop, opts) { return vcmd.modifyOrder(this.ctx, id, index, { stop }, opts); }
  /** Timetable of one order: {waitDays, travelDays} (days; 0 clears). Shared orders: all members. */
  setOrderTimetable(id, orderIndex, times, opts) { return vcmd.setOrderTimetable(this.ctx, id, orderIndex, times, opts); }
  /** Timetable autofill on/off for one vehicle. */
  setTimetableAutofill(id, on, opts) { return vcmd.setTimetableAutofill(this.ctx, id, on, opts); }
  /** Clear a vehicle's recorded lateness. */
  resetLateness(id, opts) { return vcmd.resetLateness(this.ctx, id, opts); }
  /** Timetable start date: absolute tick (null clears). Before it the vehicle waits at its first stop. */
  setTimetableStart(id, startTick, opts) { return vcmd.setTimetableStart(this.ctx, id, startTick, opts); }
  /** Spread the start dates of the shared-order group evenly over the timetable round (needs a complete timetable). */
  spreadTimetableStart(id, opts) { return vcmd.spreadTimetableStart(this.ctx, id, opts); }
  borrow(amount) { return borrow(this.state.company, amount); }
  repay(amount) { return repay(this.state.company, amount); }

  // ---- queries ----
  trafficCars() { return trafficCars(this.state); }
  trafficStats() { return trafficStats(this.state); }
  trafficLoad(x, y) { return trafficLoad(this.state, x, y); }
  tile(x, y) { return getTile(this.state.map, x, y); }
  inBounds(x, y) { return inBounds(this.state.map, x, y); }
  tileInfo(x, y) { return this.inBounds(x, y) ? tileInfo(this.state, x, y) : null; }
  catchmentTiles(stationId) { return catchmentTiles(this.state, findStation(this.state, stationId)); }
  stationsNear(x, y, radius) { return stationsNear(this.state, x, y, radius); }
  getVehicleSegments(v) { return getVehicleSegments(typeof v === 'object' ? v : findVehicle(this.state, v)); }
  listModels(kind) { return listModels(this.state, kind); }
}
