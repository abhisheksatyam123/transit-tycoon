/** Ship tools: dock (land next to water), ship depot and buoy (water). Click to build, like the other placement tools. */
import { createPlacementTool } from './placement.js';

/**
 * @param {import('../app.js').App} app
 * @param {'dock'|'shipDepot'|'buoy'} kind
 * @returns {import('./index.js').Tool}
 */
export function createShipTool(app, kind) {
  const info = {
    dock: { id: 'dock', label: 'Dock', catchment: 4, hint: 'Dock: build on land next to water. Ships load here.', cmd: 'buildDock' },
    shipDepot: { id: 'shipDepot', label: 'Ship Depot', hint: 'Ship depot: build on open water. Ships service and buy here.', cmd: 'buildShipDepot' },
    buoy: { id: 'buoy', label: 'Buoy', hint: 'Buoy: a waypoint on open water. Ships can order it as a stop to pass through.', cmd: 'buildBuoy' },
  }[kind];
  return createPlacementTool(app, {
    id: info.id, label: info.label, hint: () => info.hint,
    catchment: info.catchment,
    command: (g, x, y, opts) => g[info.cmd](x, y, { ...(opts || {}) }),
    footprint: (x, y) => [{ x, y }],
  });
}
