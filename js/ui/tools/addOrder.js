/** Transient "add order" mode: next click on a station tile (or a row in the Stations list) appends it to a vehicle's orders. */

/**
 * Append a station to a vehicle's order list (shared by the map tool, the Stations list and the Orders picker).
 * @param {import('../app.js').App} app
 * @param {number} vehicleId
 * @param {number} stationId
 * @returns {boolean} true when the order was added
 */
export function appendOrder(app, vehicleId, stationId) {
  const v = app.findVehicle(vehicleId);
  if (!v) return false;
  const orders = v.orders.map((o) => ({ ...o }));
  orders.push({ stationId, full: false });
  return !!app.exec(app.game.setOrders(vehicleId, orders), { sound: 'click', quiet: true });
}

/**
 * @param {import('../app.js').App} app
 * @param {number} vehicleId
 * @returns {import('./index.js').Tool}
 */
export function createAddOrderTool(app, vehicleId) {
  return {
    id: 'addOrder',
    vehicleId,
    label: 'Add order',
    hint: 'Click a station on the map or in the Stations list. Esc cancels.',
    move(t) {
      const tile = app.game.tile(t.x, t.y);
      const ok = !!(tile && tile.building && tile.building.type === 'station');
      app.renderer.overlay.preview = { tiles: [t], ok };
    },
    down() {},
    up(t) {
      const tile = app.game.tile(t.x, t.y);
      const v = app.findVehicle(vehicleId);
      if (!v) { app.setTool(null); return; }
      if (!tile || !tile.building || tile.building.type !== 'station') {
        app.toast('Click on a station', 'error', true);
        return;
      }
      appendOrder(app, vehicleId, tile.building.stationId);
    },
    cancel() { app.renderer.overlay.preview = null; },
  };
}
