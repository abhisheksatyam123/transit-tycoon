import { test, expect, describe } from 'bun:test';
import { createAddOrderTool } from '../js/ui/tools/addOrder.js';

/** Minimal app double: records toasts as elements with remove(), and tracks the overlay preview. */
function fakeApp(station) {
  const toasts = [];
  const app = {
    toasts,
    renderer: { overlay: { preview: null } },
    game: { tile: (x, y) => ({ building: station ? { type: 'station', stationId: 7 } : null }), setOrders: () => ({}) },
    findVehicle: () => ({ id: 1, orders: [] }),
    exec: () => true,
    setTool() {},
    toast(text) {
      const el = { text, removed: false, remove() { this.removed = true; } };
      toasts.push(el);
      return el;
    },
  };
  return app;
}

describe('add-order toast cleanup (FR friction 1)', () => {
  test('miss click shows the hint; a later station click removes it', () => {
    const app = fakeApp(false);
    const tool = createAddOrderTool(app, 1);
    tool.up({ x: 1, y: 1 });
    expect(app.toasts.length).toBe(1);
    expect(app.toasts[0].removed).toBe(false);
    app.game.tile = () => ({ building: { type: 'station', stationId: 7 } });
    tool.up({ x: 2, y: 2 });
    expect(app.toasts[0].removed).toBe(true);
  });

  test('cancel (Escape / right-click / tool change) removes the hint', () => {
    const app = fakeApp(false);
    const tool = createAddOrderTool(app, 1);
    tool.up({ x: 1, y: 1 });
    tool.cancel();
    expect(app.toasts[0].removed).toBe(true);
    expect(app.renderer.overlay.preview).toBe(null);
  });

  test('a second miss replaces the first hint (no stacking)', () => {
    const app = fakeApp(false);
    const tool = createAddOrderTool(app, 1);
    tool.up({ x: 1, y: 1 });
    tool.up({ x: 1, y: 2 });
    expect(app.toasts[0].removed).toBe(true);
    expect(app.toasts[1].removed).toBe(false);
  });
});
