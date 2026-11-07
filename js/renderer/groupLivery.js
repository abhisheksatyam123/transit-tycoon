/**
 * Group livery lookup for the renderer (cmdGroup.js setGroupColour). Returns a Map groupId -> '#rrggbb' for the
 * groups that have a colour, or null when none does (the common case: the per-vehicle cost is then one null check).
 * Rebuilt only when the groups array, its length or company.groupColourRev changes (not per frame).
 */
let cache = { state: null, groups: null, len: -1, rev: -1, map: null };

/**
 * @param {any} state
 * @returns {Map<number,string>|null}
 */
export function groupColourMap(state) {
  const co = state && state.company;
  const groups = co && co.groups;
  if (!groups || !groups.length) return null;
  const rev = co.groupColourRev || 0;
  if (cache.state === state && cache.groups === groups && cache.len === groups.length && cache.rev === rev) return cache.map;
  let map = null;
  for (const g of groups) {
    if (!g.colour) continue;
    if (!map) map = new Map();
    map.set(g.id, g.colour);
  }
  cache = { state, groups, len: groups.length, rev, map };
  return map;
}
