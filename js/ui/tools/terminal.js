/**
 * D9 Bus/Truck Terminal tools (opt-in: shown only when setting terminalRoadStops is on).
 * A dead-end stop whose single entrance faces `dir`; R rotates the entrance. Off by default; the
 * toolbar hides these buttons unless the setting is on (see toolbar.js TERMINAL_TOOLS).
 */
import { createPlacementTool } from './placement.js';
import { NEXT_DIR, DIR_NAMES } from './geometry.js';

/**
 * Spec for a terminal stop tool of `kind` ('bus' | 'truck'). The entrance direction lives in this
 * closure: `key` rotates it, `command` places with it.
 * @param {'bus'|'truck'} kind
 */
export function terminalToolSpec(kind) {
  let dir = 1;
  const label = kind === 'bus' ? 'Bus Terminal' : 'Truck Terminal';
  return {
    id: kind === 'bus' ? 'busTerminal' : 'truckTerminal',
    label,
    catchment: 3,
    joinKind: kind,
    hint: () => `${label}: click a road end or clear land beside a road (dead-end stop, entrance ${DIR_NAMES[dir]}). R rotates. Ctrl+click joins a distant road.`,
    command: (g, x, y, opts) => g.buildRoadStop(x, y, kind, { ...(opts || {}), player: true, terminal: true, dir }),
    footprint: (x, y) => [{ x, y }],
    key(e) {
      if (e.key === 'r' || e.key === 'R') { dir = NEXT_DIR[dir]; return true; }
      return false;
    },
  };
}

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createBusTerminalTool(app) {
  return createPlacementTool(app, terminalToolSpec('bus'));
}

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createTruckTerminalTool(app) {
  return createPlacementTool(app, terminalToolSpec('truck'));
}
