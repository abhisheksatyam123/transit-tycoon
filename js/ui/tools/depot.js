/** Rail / road depot tools: R rotates the exit direction. Without an explicit R, the exit auto-faces an adjacent track (OpenTTD-like). */
import { createPlacementTool } from './placement.js';
import { DIR_NAMES, NEXT_DIR } from './geometry.js';
import { DIRS, OPPOSITE } from '../../simulation/constants.js';
import { canAddBits } from '../../simulation/trackRules.js';
import { inBounds } from '../../simulation/map.js';
import { connectedNeighbours } from '../../simulation/network.js';
import { exitFacesStopSide, STOP_SIDE_ERR } from '../../simulation/cmdStation.js';

/** Cap on the flood fill that sizes a neighbour's road component (keeps hover previews cheap). */
const COMPONENT_CAP = 4000;

/**
 * Size of the connected road/rail component containing (x,y) on `layer`, flood-filled up to COMPONENT_CAP.
 * Lazy and read-only: no tile field is written.
 */
function componentSize(map, layer, x, y) {
  const seen = new Set([y * map.width + x]);
  const queue = [{ x, y }];
  for (let i = 0; i < queue.length && seen.size < COMPONENT_CAP; i++) {
    for (const n of connectedNeighbours(map, layer, queue[i].x, queue[i].y)) {
      const k = n.y * map.width + n.x;
      if (!seen.has(k)) { seen.add(k); queue.push(n); }
    }
  }
  return seen.size;
}

/**
 * Exit direction for a depot at (x,y): among the neighbours whose track of `kind` can take a connection back
 * toward the depot, prefer the one on the largest connected component (the through route, not a stray stub),
 * then the one with the most connection bits, then the DIRS order. Returns 0 when no neighbour is connectable.
 */
export function autoDepotDir(game, x, y, kind) {
  const map = game.state.map;
  let best = 0, bestSize = -1, bestBits = -1;
  for (const d of DIRS) {
    const nx = x + d.dx, ny = y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    const nt = map.tiles[ny * map.width + nx];
    if (!nt || !nt[kind] || canAddBits(nt, kind, OPPOSITE[d.bit])) continue;
    const size = componentSize(map, kind, nx, ny);
    const bits = BIT_COUNT[nt[kind] & 15];
    if (size > bestSize || (size === bestSize && bits > bestBits)) {
      best = d.bit; bestSize = size; bestBits = bits;
    }
  }
  return best;
}

const BIT_COUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** True when a road stop (not a plain road) is the only road beside (x,y): a depot here cannot connect. */
export function onlyStopSideNeighbour(game, x, y, kind) {
  const map = game.state.map;
  let stop = false;
  for (const d of DIRS) {
    const nx = x + d.dx, ny = y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    if (exitFacesStopSide(map, x, y, kind, d.bit)) stop = true;
    else if (map.tiles[ny * map.width + nx][kind] && !canAddBits(map.tiles[ny * map.width + nx], kind, OPPOSITE[d.bit])) return false;
  }
  return stop;
}

/** Refusal the depot tool gives without an explicit R: the only road beside is a stop side. Null when allowed. */
export function depotUiRefusal(game, x, y, kind) {
  return autoDepotDir(game, x, y, kind) || !onlyStopSideNeighbour(game, x, y, kind) ? null : STOP_SIDE_ERR;
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
      if (!explicit && !r.connected) {
        const refusal = depotUiRefusal(g, x, y, kind);
        if (refusal) return { ok: false, error: refusal };
      }
      if (!opts?.dryRun && !r.connected) app.toast(`Depot exit is not connected to ${kind === 'rail' ? 'a rail track' : 'a road'}`, 'warn');
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
