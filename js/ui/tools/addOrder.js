/** Transient "add order" mode: next click on a station tile appends it to a vehicle's orders. */

/**
 * @param {import('../app.js').App} app
 * @param {number} vehicleId
 * @returns {import('./index.js').Tool}
 */
export function createAddOrderTool(app, vehicleId) {
  return {
    id: 'addOrder',
    label: 'Add order',
    hint: 'Click a station of the right type to add it to the orders. Esc cancels.',
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
      const orders = v.orders.map((o) => ({ ...o }));
      orders.push({ stationId: tile.building.stationId, full: false });
      app.exec(app.game.setOrders(vehicleId, orders), { sound: 'click', quiet: true });
    },
    cancel() { app.renderer.overlay.preview = null; },
  };
}
