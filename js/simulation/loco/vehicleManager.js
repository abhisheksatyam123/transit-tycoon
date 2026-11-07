/**
 * VehicleManager (OpenLoco src/Vehicles/VehicleManager.cpp, MIT): tick / updateDaily / updateMonthly,
 * ported from VehicleManager.cpp (0x004C3C54 updateMonthly, 0x004B94CF updateDaily) calling the per-vehicle
 * logic in ./vehicle.js. Vehicle motion stays transit-tycoon's (movement.js).
 */
import { vehicleTick } from '../movement.js';
import { beginOccupancy, syncOccupancy } from '../blocking.js';
import { vehiclesYearly } from '../vehicleLife.js';
import { trafficTick, trafficDaily } from '../traffic.js';
import { refreshBarred } from '../levelCrossing.js';
import { getSetting } from '../settings.js';
import { removeVehicle } from '../planeCrash.js';
import { companyById } from '../owner.js';
import { spend } from '../economy.js';
import { vehicleDaily, vehicleMonthly, vehicleBreakdownTick, chargeRunning } from './vehicle.js';

/** VehicleManager::tick: VehicleHead::updateBreakdown + motion for every vehicle (plus background road traffic). */
export function tick(game) {
  const ctx = game.ctx;
  ctx.occupancy = beginOccupancy(game.state); // queueing index (blocking.js), derived, never saved
  refreshBarred(ctx, game.state); // level crossings barred this tick (levelCrossing.js; setting off = null)
  if (ctx.barredNew) for (const i of ctx.barredNew) ctx.emit('levelCrossingClosed', { i });
  // vehicleCollisions (trainCollision.js): train-train and train-road; one setting read per tick
  ctx.collide = getSetting(game.state, 'vehicleCollisions') === true;
  for (const v of game.state.vehicles) {
    if (v.wrecked) continue; // destroyed this tick by a train (removed below)
    vehicleBreakdownTick(v);
    vehicleTick(ctx, v);
    syncOccupancy(ctx, v);
  }
  if (ctx.wrecked) { for (const v of ctx.wrecked) removeVehicle(game.state, v); ctx.wrecked = null; }
  ctx.collide = false;
  ctx.occupancy = null;
  trafficTick(ctx);
  ctx.barredNew = null;
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
  // AI rivals' running costs are charged to their own company (ownerId); the player's total is unchanged
  const rivalTotals = new Map();
  for (const v of game.state.vehicles) {
    const cost = vehicleMonthly(game.ctx, v);
    if (v.ownerId != null) rivalTotals.set(v.ownerId, (rivalTotals.get(v.ownerId) || 0) + cost);
    else total += cost;
  }
  chargeRunning(game.ctx, total);
  for (const [ownerId, cost] of rivalTotals) {
    const r = companyById(game.state, ownerId);
    if (r) spend(r, 'running', cost);
  }
}

/** Yearly vehicle bookkeeping (called from CompanyManager::updateYearly): profit rollover, new-model news. */
export function updateYearly(game) { vehiclesYearly(game.ctx, game.state.date.year); }
