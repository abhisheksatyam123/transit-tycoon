/**
 * Game loop ported from OpenLoco (MIT, https://github.com/OpenLoco/OpenLoco):
 *   GameScene::tick   (src/Scenes/GameScene.cpp, 0x0046ABCB)
 *   tickDate          (src/Scenes/GameScene.cpp, 0x004968C7)
 *   updateDayCounter  (src/Date.cpp)
 * The managers below mirror OpenLoco's World/*Manager.cpp, Economy.cpp and Vehicles/VehicleManager.cpp;
 * each one is a module in this folder exporting the same entry points (tick/updateDaily/updateMonthly/...).
 * Pure: no DOM. `game` = { state, rng, ctx, events }.
 */
import { advanceDay } from '../date.js';
import * as TileManager from './tileManager.js';
import * as TownManager from './townManager.js';
import * as IndustryManager from './industryManager.js';
import * as VehicleManager from './vehicleManager.js';
import * as StationManager from './stationManager.js';
import * as CompanyManager from './companyManager.js';
import * as MessageManager from './messageManager.js';
import * as Economy from './economy.js';

/** Date.cpp kIncrement: a 16-bit counter that wraps once per day (~96.09 ticks). */
export const DAY_INCREMENT = 682;
/** Ticks per game day (65536 / 682), for rates expressed per day. */
export const TICKS_PER_LOCO_DAY = 65536 / DAY_INCREMENT;

/**
 * Date.cpp updateDayCounter: advance the 16-bit day counter; true when it wraps (a new day starts).
 * @param {object} s game state
 * @returns {boolean}
 */
export function updateDayCounter(s) {
  const c = (s.dayCounter || 0) + DAY_INCREMENT;
  s.dayCounter = c & 0xffff;
  return c > 0xffff;
}

/** GameScene.cpp tickDate (returns true when a new day started): daily managers run before the date changes (they see "yesterday"), then month/quarter/year. */
export function tickDate(game) {
  const s = game.state;
  if (!updateDayCounter(s)) return false;
  StationManager.updateDaily(game);
  VehicleManager.updateDaily(game);
  IndustryManager.updateDaily(game);
  MessageManager.updateDaily(game);

  const { newMonth, newYear } = advanceDay(s.date);
  game.events.emit('day', { date: s.date });
  if (newMonth) {
    // end of every month
    s.monthsInChallenge = (s.monthsInChallenge || 0) + 1;
    TownManager.updateMonthly(game);
    IndustryManager.updateMonthly(game);
    CompanyManager.updateMonthly1(game);
    CompanyManager.updateMonthlyHeadquarters(game);
    VehicleManager.updateMonthly(game);
    if (s.date.year <= 2029) Economy.updateMonthly(game);
    if (s.date.month % 3 === 0) CompanyManager.updateQuarterly(game); // January, April, July, October
    if (newYear) {
      CompanyManager.updateYearly(game);
      TileManager.updateYearly(game);
      game.events.emit('year', { date: s.date });
    }
    game.events.emit('month', { date: s.date });
  }
  CompanyManager.updateDaily(game);
  return true;
}

/**
 * GameScene.cpp tick: one logic update (OpenLoco runs these at 40 Hz).
 * @param {{state:object,rng:object,ctx:object,events:object}} game
 */
export function tick(game) {
  const s = game.state;
  s.tick++;
  s.scenarioTicks = (s.scenarioTicks || 0) + 1;
  const newDay = tickDate(game);
  TileManager.tick(game, newDay);
  TownManager.tick(game);
  IndustryManager.tick(game);
  VehicleManager.tick(game);
  StationManager.tick(game);
  CompanyManager.tick(game);
}
