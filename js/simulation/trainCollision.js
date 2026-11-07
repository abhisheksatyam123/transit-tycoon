/**
 * Train vs road vehicle collisions at level crossings (OpenTTD train_cmd.cpp TrainCollideWithRoadVehicle /
 * roadveh_cmd.cpp RoadVehCrash). Setting vehicleCollisions (default off: nothing is checked, no random draws).
 * When a train's head enters a level crossing tile (ctx.barred crossing, levelCrossing.js) a road vehicle
 * (bus, truck or tram) whose body covers that tile is destroyed: passengers on board die, news is posted and
 * 'crash' is emitted for the smoke. The victim is only marked here (v.wrecked) and removed by
 * vehicleManager.tick after the vehicle loop, because removeVehicle replaces state.vehicles mid-loop.
 * Simplifications: the train is not damaged (OpenTTD), no delay before removal, no company rating change;
 * train-train overlap is not handled (see the report: trains block same-direction traffic and head-on pass).
 */
import { notify } from './news.js';
import { isLevelCrossing } from './levelCrossing.js';
import { getTile } from './map.js';
import { vehiclesOn } from './blocking.js';

/**
 * Called from movement.js move() when train v's head has just entered tile (x,y). Cheap: only runs for a
 * crossing tile while ctx.collide is set (setting on and a crossing barred this tick).
 */
export function trainEntersCrossing(ctx, v, x, y) {
  const { state } = ctx;
  const tile = getTile(state.map, x, y);
  if (!isLevelCrossing(tile)) return;
  // road layer of the per-tick occupancy index (blocking.js): O(vehicles on this tile), not O(all vehicles)
  const list = ctx.occupancy ? vehiclesOn(ctx, 'road', x, y) : null; // null: nothing on the tile
  if (!list) return;
  for (const r of list) {
    if (r.kind !== 'road' || r.wrecked || r.state === 'depot') continue;
    r.wrecked = true;
    (ctx.wrecked || (ctx.wrecked = [])).push(r);
    const victims = r.load && r.cargoId === 'PASS' ? r.load.amount || 0 : 0;
    notify(ctx, 'Road vehicle destroyed in collision with train', 'bad', x, y, 'accident');
    if (ctx.emit) ctx.emit('crash', { x, y, victims });
  }
}
