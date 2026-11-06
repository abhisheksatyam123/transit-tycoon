/** Rail / road depot tools: R rotates the exit direction. Without an explicit R, the exit auto-faces an adjacent track (OpenTTD-like). */
import { createPlacementTool } from './placement.js';
import { DIR_NAMES, NEXT_DIR } from './geometry.js';
import { DIRS, OPPOSITE } from '../../simulation/constants.js';
import { canAddBits } from '../../simulation/trackRules.js';
import { inBounds } from '../../simulation/map.js';

/**
 * Exit direction for a depot at (x,y): the first neighbour whose track of `kind` can take a connection back
 * toward the depot. Returns 0 when no neighbour is connectable.
 */
export function autoDepotDir(game, x, y, kind) {
  const map = game.state.map;
  for (const d of DIRS) {
    const nx = x + d.dx, ny = y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    const nt = map.tiles[ny * map.width + nx];
    if (nt && nt[kind] && !canAddBits(nt, kind, OPPOSITE[d.bit])) return d.bit;
  }
  return 0;
}

/**
 * @param {import('../app.js').App} app
 * @param {'rail'|'road'} kind
 * @returns {import('./index.js').Tool}
 */
export function createDepotTool(app, kind) {
  let dir = 4;
  let explicit = false;
  let auto = 0;
  const resolve = (x, y) => {
    if (explicit) return { dir, connected: true };
    const a = autoDepotDir(app.game, x, y, kind);
    return a ? { dir: a, connected: true } : { dir, connected: false };
  };
  const tool = createPlacementTool(app, {
    id: kind === 'rail' ? 'railDepot' : 'roadDepot',
    label: kind === 'rail' ? 'Rail Depot' : 'Road Depot',
    hint: () => {
      const shown = explicit ? dir : auto || dir;
      const note = explicit || auto ? '' : ' No connectable neighbour.';
      return `${kind === 'rail' ? 'Rail' : 'Road'} depot: exit faces ${DIR_NAMES[shown]}. R rotates.${note} Place next to your ${kind === 'rail' ? 'track' : 'road'}.`;
    },
    command: (g, x, y, opts) => {
      const r = resolve(x, y);
      auto = r.connected && !explicit ? r.dir : 0;
      if (!opts?.dryRun && !r.connected) app.toast('Depot exit is not connected to a road', 'warn');
      return g.buildDepot(x, y, kind, r.dir, opts);
    },
    footprint: (x, y) => [{ x, y }],
    key(e) {
      if (e.key === 'r' || e.key === 'R') { dir = NEXT_DIR[dir]; explicit = true; return true; }
      return false;
    },
  });
  return tool;
}
