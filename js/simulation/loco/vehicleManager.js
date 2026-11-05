/**
 * VehicleManager (OpenLoco src/Vehicles/VehicleManager.cpp, MIT): tick / updateDaily / updateMonthly,
 * ported from VehicleManager.cpp (0x004C3C54 updateMonthly, 0x004B94CF updateDaily) calling the per-vehicle
 * logic in ./vehicle.js. Vehicle motion stays transit-tycoon's (movement.js).
 */
import { vehicleTick } from '../movement.js';
import { vehiclesYearly } from '../vehicleLife.js';
import { trafficTick, trafficDaily } from '../traffic.js';
import { vehicleDaily, vehicleMonthly, vehicleBreakdownTick, chargeRunning } from './vehicle.js';

/** VehicleManager::tick: VehicleHead::updateBreakdown + motion for every vehicle (plus background road traffic). */
export function tick(game) {
  for (const v of game.state.vehicles) {
    vehicleBreakdownTick(v);
    vehicleTick(game.ctx, v);
  }
  trafficTick(game.ctx);
}

/** VehicleManager::updateDaily. */
export function updateDaily(game) {
  trafficDaily(game.ctx);
  const year = game.state.date.year;
  for (const v of game.state.vehicles) vehicleDaily(game.ctx, v, game.rng, year);
}

/** VehicleManager::updateMonthly: running costs, profit history, value decay. */
export function updateMonthly(game) {
  let total = 0;
  for (const v of game.state.vehicles) total += vehicleMonthly(game.ctx, v);
  chargeRunning(game.ctx, total);
}

/** Yearly vehicle bookkeeping (called from CompanyManager::updateYearly): profit rollover, new-model news. */
export function updateYearly(game) { vehiclesYearly(game.ctx, game.state.date.year); }
