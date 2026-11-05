/**
 * Game: composes the simulation modules. Owns `state` (plain JSON), the seeded RNG,
 * the event emitter, the tick loop, commands and queries. No DOM access.
 */
import { MAP_DEFAULTS, SAVE_VERSION, TICKS_PER_DAY } from './constants.js';
import { Emitter } from './events.js';
import { createRng, hashSeed } from './rng.js';
import { advanceDay } from './date.js';
import { createMap, generateTerrain, getTile, inBounds } from './map.js';
import { generateTowns } from './towns.js';
import { generateIndustries } from './industries.js';
import { connectTowns, repairTownRoads } from './townRoads.js';
import { createCompany, monthlyFinances, borrow, repay } from './economy.js';
import { townMonthly } from './townGrowth.js';
import { DISTRIBUTION_DAYS, distributeIndustryCargo, distributeTownCargo, industriesMonthStart } from './cargo.js';
import { buildCoverage, catchmentTiles, recomputeAllAcceptance, updateRatings } from './stations.js';
import { vehicleTick } from './movement.js';
import { vehiclesDaily, vehiclesMonthly, vehiclesYearly } from './vehicleLife.js';
import { getVehicleSegments } from './vehicles.js';
import { buildLine, demolish } from './cmdTrack.js';
import { buildDepot, buildRailStation, buildRoadStop } from './cmdStation.js';
import { buildAirport } from './cmdAirport.js';
import * as vcmd from './cmdVehicle.js';
import { findStation, findVehicle } from './state.js';
import { notify } from './news.js';
import { listModels, stationsNear, tileInfo } from './queries.js';
import { parseState, serializeState } from './save.js';
import { buildScenario } from './scenarios/index.js';
import { createTraffic, trafficTick, trafficDaily, trafficCars, trafficStats, trafficLoad } from './traffic.js';
import { initGoals, evaluateGoals, rollGoalMonth, goalSnapshot } from './goals.js';

const BANKRUPT_WARN_MONTHS = 3;

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
      version: SAVE_VERSION, seed: o.seed, rngState: hashSeed(o.seed), tick: 0,
      date: { year: o.startYear, month: 0, day: 1 },
      map: createMap(o.width, o.height),
      towns: [], industries: [], stations: [], depots: [], vehicles: [],
      company: createCompany(), news: [], nextId: 1,
    };
    const game = new Game(state);
    if (o.scenario && o.scenario !== 'random') return createScenarioGame(game, o);
    generateTerrain(state.map, game.rng, { waterRatio: o.waterRatio });
    generateTowns(state, game.rng, o.townCount);
    generateIndustries(state, game.rng, o.industryCount);
    connectTowns(state);
    repairTownRoads(state);
    industriesMonthStart(state, game.rng);
    state.traffic = createTraffic(state);
    recomputeAllAcceptance(state);
    notify(game.ctx, `Welcome! ${state.company.name} was founded in ${o.startYear}. Connect industries and towns to earn money.`, 'good');
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

  /** Advance the simulation by one tick. */
  step() {
    const s = this.state;
    s.tick++;
    for (const v of s.vehicles) vehicleTick(this.ctx, v);
    trafficTick(this.ctx);
    if (s.tick % TICKS_PER_DAY === 0) this.onDay();
  }

  /** Daily processing (and month/year rollover). */
  onDay() {
    const s = this.state;
    trafficDaily(this.ctx);
    const { newMonth, newYear } = advanceDay(s.date);
    vehiclesDaily(this.ctx, this.rng);
    for (const st of s.stations) updateRatings(s, st);
    if (DISTRIBUTION_DAYS.includes(s.date.day)) {
      const coverage = buildCoverage(s);
      distributeIndustryCargo(s, this.rng, coverage);
      distributeTownCargo(s, this.rng, coverage);
    }
    if (s.goals) evaluateGoals(this.ctx);
    this.events.emit('day', { date: s.date });
    if (newMonth) this.onMonth();
    if (newYear) {
      vehiclesYearly(this.ctx, s.date.year);
      this.events.emit('year', { date: s.date });
    }
  }

  /** Month rollover: running costs, finances, production, town growth. */
  onMonth() {
    const s = this.state;
    const ended = s.date.month === 0 ? { year: s.date.year - 1, month: 11 } : { year: s.date.year, month: s.date.month - 1 };
    vehiclesMonthly(this.ctx);
    monthlyFinances(s, ended);
    evaluateGoals(this.ctx);
    rollGoalMonth(s);
    industriesMonthStart(s, this.rng);
    for (const town of s.towns) townMonthly(s, this.rng, town);
    recomputeAllAcceptance(s);
    this.checkSolvency();
    this.events.emit('month', { date: s.date });
  }

  /** Warn when money stays negative. */
  checkSolvency() {
    const c = this.state.company;
    c.negativeMonths = c.money < 0 ? c.negativeMonths + 1 : 0;
    if (c.negativeMonths >= BANKRUPT_WARN_MONTHS) {
      notify(this.ctx, `${c.name} has been in debt for ${c.negativeMonths} months! Raise income or take a loan before bankruptcy.`, 'bad');
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
  buildRailStation(x, y, axis, length, opts) { return buildRailStation(this.ctx, x, y, axis, length, opts); }
  buildRoadStop(x, y, kind, opts) { return buildRoadStop(this.ctx, x, y, kind, opts); }
  buildDepot(x, y, kind, dir, opts) { return buildDepot(this.ctx, x, y, kind, dir, opts); }
  /** Airport footprint with top-left corner (x,y); see cmdAirport.js. */
  buildAirport(x, y, opts) { return buildAirport(this.ctx, x, y, opts); }
  buyVehicle(depotId, spec, opts) { return vcmd.buyVehicle(this.ctx, depotId, spec, opts); }
  setOrders(id, orders, opts) { return vcmd.setOrders(this.ctx, id, orders, opts); }
  startVehicle(id, opts) { return vcmd.startVehicle(this.ctx, id, opts); }
  stopVehicle(id, opts) { return vcmd.stopVehicle(this.ctx, id, opts); }
  sendToDepot(id, opts) { return vcmd.sendToDepot(this.ctx, id, opts); }
  sellVehicle(id, opts) { return vcmd.sellVehicle(this.ctx, id, opts); }
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
