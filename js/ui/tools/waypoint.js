/** Rail waypoint tool: click a straight rail tile to build a go-via waypoint (cmdWaypoint.js). */
import { createPlacementTool } from './placement.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createWaypointTool(app) {
  return createPlacementTool(app, {
    id: 'waypoint',
    label: 'Waypoint',
    hint: () => 'Waypoint: build on a straight rail tile. Trains order it as go-via and pass without stopping.',
    command: (g, x, y, opts) => g.buildRailWaypoint(x, y, { ...(opts || {}) }),
    footprint: (x, y) => [{ x, y }],
  });
}
