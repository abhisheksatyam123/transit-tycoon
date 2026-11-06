/**
 * Game: composes the simulation modules. Owns `state` (plain JSON), the seeded RNG,
 * the event emitter, the tick loop, commands and queries. No DOM access.
 */
import { MAP_DEFAULTS, SAVE_VERSION } from './constants.js';
import { Emitter } from './events.js';
import { createRng, hashSeed } from './rng.js';
import { createMap, generateTerrain, getTile, inBounds } from './map.js';
import { generateTowns } from './towns.js';
import { generateIndustries } from './industries.js';
import { connectTowns, repairTownRoads } from './townRoads.js';
import { createCompany, borrow, repay } from './economy.js';
import { industriesMonthStart } from './cargo.js';
import { catchmentTiles, recomputeAllAcceptance } from './stations.js';
import { getVehicleSegments } from './vehicles.js';
import { buildLine, demolish } from './cmdTrack.js';
import { terraform, estimateTerraform, planTerraform } from './cmdTerraform.js';
import { buildDepot, buildRailStation, buildRoadStop } from './cmdStation.js';
import { buildAirport } from './cmdAirport.js';
import * as vcmd from './cmdVehicle.js';
import { renameStation, renameVehicle, renameTown, renameCompany } from './cmdRename.js';
import { findStation, findVehicle } from './state.js';
import { notify } from './news.js';
import { listModels, stationsNear, tileInfo } from './queries.js';
import { parseState, serializeState } from './save.js';
import { buildScenario } from './scenarios/index.js';
import { createTraffic, trafficCars, trafficStats, trafficLoad } from './traffic.js';
import { initGoals, goalSnapshot } from './goals.js';
import { tick as locoTick } from './loco/gameLoop.js';
import { setSetting, DEFAULT_SETTINGS } from './settings.js';
import { createObjective } from './objective.js';
import { SCENARIOS } from './scenarios/index.js';


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
  notify(game.ctx, `Welcome to ${o.scenario}! ${s.company.name} was founded in ${o.startYear}. Connect the districts by metro and bus.`, 'good');
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
    if (o.scenario && o.scenario !== 'random') {
      createScenarioGame(game, o);
      applyOptions(game, o);
      return game;
    }
    generateTerrain(state.map, game.rng, { waterRatio: o.waterRatio });
    generateTowns(state, game.rng, o.townCount);
    generateIndustries(state, game.rng, o.industryCount);
    connectTowns(state);
    repairTownRoads(state);
    industriesMonthStart(state, game.rng);
    state.traffic = createTraffic(state);
    recomputeAllAcceptance(state);
    notify(game.ctx, `Welcome! ${state.company.name} was founded in ${o.startYear}. Connect industries and towns to earn money.`, 'good');
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

  /** Goal progress for the UI (empty list for random worlds). */
  goals() { return goalSnapshot(this.state); }

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
  buildRoad(x0, y0, x1, y1, opts) { return buildLine(this.ctx, 'road', x0, y0, x1, y1, opts || {}); }
  /** Build along an explicit 4-connected tile path (opts.loop = closed ring); see shapes.js. */
  buildRailPath(path, opts) { return buildLine(this.ctx, 'rail', 0, 0, 0, 0, { ...(opts || {}), path }); }
  /** Build a road along a shape path. opts: { highway?: boolean } */
  buildRoadPath(path, opts) { return buildLine(this.ctx, 'road', 0, 0, 0, 0, { ...(opts || {}), path }); }
  demolish(x0, y0, x1, y1, opts) { return demolish(this.ctx, x0, y0, x1, y1, opts); }
  /** Terraform: op 'raise'|'lower'|'level'|'plant' over rect {x0,y0,x1,y1}. */
  terraform(op, rect, opts) { return terraform(this.ctx, op, rect, opts); }
  estimateTerraform(op, rect) { return estimateTerraform(this.state, op, rect); }
  planTerraform(op, rect) { return planTerraform(this.state, op, rect); }
  buildRailStation(x, y, axis, length, opts) { return buildRailStation(this.ctx, x, y, axis, length, opts); }
  buildRoadStop(x, y, kind, opts) { return buildRoadStop(this.ctx, x, y, kind, opts); }
  buildDepot(x, y, kind, dir, opts) { return buildDepot(this.ctx, x, y, kind, dir, opts); }
  /** Airport footprint with top-left corner (x,y); see cmdAirport.js. */
  buildAirport(x, y, opts) { return buildAirport(this.ctx, x, y, opts); }
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
  renameTown(id, name, opts) { return renameTown(this.ctx, id, name, opts); }
  renameCompany(name, opts) { return renameCompany(this.ctx, name, opts); }
  /** Clone a vehicle (same model/consist, copies orders; shareOrders joins its shared order list). */
  cloneVehicle(id, opts) { return vcmd.cloneVehicle(this.ctx, id, opts); }
  /** Leave the shared order list (keeps the current orders). */
  unshareOrders(id, opts) { return vcmd.unshareOrders(this.ctx, id, opts); }
  /** Service interval in days for one vehicle (0 = off). */
  setServiceInterval(id, days, opts) { return vcmd.setServiceInterval(this.ctx, id, days, opts); }
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
