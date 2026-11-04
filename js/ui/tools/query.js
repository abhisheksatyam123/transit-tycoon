/** Query tool: click a tile to inspect it (opens station/depot/town/industry windows directly). */

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createQueryTool(app) {
  return {
    id: 'query',
    label: 'Query',
    hint: 'Click a tile to inspect it.',
    move(t) { app.renderer.overlay.preview = null; void t; },
    down() {},
    up(t) { app.inspectTile(t.x, t.y, true); },
    cancel() {},
  };
}
