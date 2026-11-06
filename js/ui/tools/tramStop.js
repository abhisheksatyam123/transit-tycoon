/** Tram stop tool: a stop on straight tram track that only trams use (buses pass it). */
import { createPlacementTool } from './placement.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createTramStopTool(app) {
  return createPlacementTool(app, {
    id: 'tramStop', label: 'Tram Stop', catchment: 3, joinKind: 'tram',
    hint: () => 'Tram stop: click a straight tram track tile (trams only). Ctrl+click joins a distant station.',
    command: (g, x, y, opts) => g.buildRoadStop(x, y, 'tram', { ...(opts || {}), player: true }),
    footprint: (x, y) => [{ x, y }],
  });
}
