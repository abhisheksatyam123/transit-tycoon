/**
 * Small helpers for looking things up in / allocating ids for the game state.
 */

/** Allocate a fresh unique id. */
export function allocId(state) {
  return state.nextId++;
}

/** Manhattan distance. */
export function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/** Find station by id. */
export function findStation(state, id) {
  return state.stations.find((s) => s.id === id) || null;
}

/** Find depot by id. */
export function findDepot(state, id) {
  return state.depots.find((d) => d.id === id) || null;
}

/** Find vehicle by id. */
export function findVehicle(state, id) {
  return state.vehicles.find((v) => v.id === id) || null;
}

/** Find industry by id. */
export function findIndustry(state, id) {
  return state.industries.find((i) => i.id === id) || null;
}

/** Find town by id. */
export function findTown(state, id) {
  return state.towns.find((t) => t.id === id) || null;
}

/** Nearest town to (x,y) or null. */
export function nearestTown(state, x, y) {
  let best = null, bd = Infinity;
  for (const t of state.towns) {
    const d = manhattan(t.x, t.y, x, y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
