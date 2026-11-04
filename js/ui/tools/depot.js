/** Rail / road depot tools: R rotates the exit direction. */
import { createPlacementTool } from './placement.js';
import { DIR_NAMES, NEXT_DIR } from './geometry.js';

/**
 * @param {import('../app.js').App} app
 * @param {'rail'|'road'} kind
 * @returns {import('./index.js').Tool}
 */
export function createDepotTool(app, kind) {
  let dir = 4;
  return createPlacementTool(app, {
    id: kind === 'rail' ? 'railDepot' : 'roadDepot',
    label: kind === 'rail' ? 'Rail Depot' : 'Road Depot',
    hint: () => `${kind === 'rail' ? 'Rail' : 'Road'} depot: exit faces ${DIR_NAMES[dir]}. R rotates. Place next to your ${kind === 'rail' ? 'track' : 'road'}.`,
    command: (g, x, y, opts) => g.buildDepot(x, y, kind, dir, opts),
    footprint: (x, y) => [{ x, y }],
    key(e) {
      if (e.key === 'r' || e.key === 'R') { dir = NEXT_DIR[dir]; return true; }
      return false;
    },
  });
}
