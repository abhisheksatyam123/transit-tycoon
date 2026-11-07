/**
 * Shared helpers for diagnostics: issue construction, aggregation and tile-set labelling.
 */

/** Max individual issues emitted per id family before aggregating. */
export const AGG_LIMIT = 20;

/**
 * Build an Issue record, omitting undefined optional fields.
 * @param {string} id stable id
 * @param {'error'|'warn'|'info'} severity
 * @param {string} category
 * @param {string} message
 * @param {object} [extra] {x,y,vehicleId,stationId,townId}
 * @returns {object} Issue
 */
export function mkIssue(id, severity, category, message, extra = {}) {
  const issue = { id, severity, category, message };
  for (const k of ['x', 'y', 'vehicleId', 'stationId', 'townId']) {
    if (extra[k] !== undefined) issue[k] = extra[k];
  }
  return issue;
}

/**
 * Emit one issue per item, or a single aggregated issue when there are more than AGG_LIMIT.
 * @param {object[]} items entries with x,y
 * @param {string} family id prefix, e.g. 'road-half-link'
 * @param {'error'|'warn'|'info'} severity
 * @param {string} category
 * @param {(item:object)=>string} describe message for one item
 * @returns {object[]} Issues
 */
export function emitItems(items, family, severity, category, describe) {
  if (items.length === 0) return [];
  if (items.length <= AGG_LIMIT) {
    return items.map((it) => mkIssue(`${family}:${it.x},${it.y}`, severity, category, describe(it), { x: it.x, y: it.y }));
  }
  const first = items[0];
  return [mkIssue(`${family}:*`, severity, category,
    `${items.length} occurrences of ${family} (first at ${first.x},${first.y}): ${describe(first)}`,
    { x: first.x, y: first.y })];
}

/**
 * Label connected road/rail tiles with a flood fill over the given layer.
 * Two tiles connect only when both carry the mutual bits.
 * @param {object} map
 * @param {'road'|'rail'} layer
 * @param {(x:number,y:number)=>boolean} allowed restrict labelling to these tiles
 * @returns {Int32Array} label per tile index (-1 = unlabelled)
 */
export function labelComponents(map, layer, allowed) {
  const { width: W, height: H, tiles } = map;
  const labels = new Int32Array(W * H).fill(-1);
  let next = 0;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], BIT = [1, 2, 4, 8], OPP = [4, 8, 1, 2];
  for (let i = 0; i < W * H; i++) {
    const x0 = i % W, y0 = (i - x0) / W;
    if (labels[i] !== -1 || !tiles[i][layer] || !allowed(x0, y0)) continue;
    const id = next++;
    const stack = [i];
    labels[i] = id;
    while (stack.length) {
      const j = stack.pop();
      const x = j % W, y = (j - x) / W;
      const bits = tiles[j][layer];
      for (let d = 0; d < 4; d++) {
        if (!(bits & BIT[d])) continue;
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (labels[k] !== -1 || !(tiles[k][layer] & OPP[d]) || !allowed(nx, ny)) continue;
        labels[k] = id;
        stack.push(k);
      }
    }
  }
  return labels;
}

// Cache for the unrestricted labelling (allowed = all tiles). Labels depend only on the layer
// bits, so the cache keeps an exact snapshot of those bits per map/layer and reuses the labels
// while the snapshot still matches: no mutation counter needed, and every road/rail write is seen.
const labelCache = new WeakMap();
const ALL_TILES = () => true;

/** labelComponents(map, layer, all tiles), memoised on the exact layer-bit snapshot. */
export function labelComponentsAll(map, layer) {
  let perMap = labelCache.get(map);
  if (!perMap) labelCache.set(map, perMap = {});
  const { width: W, height: H, tiles } = map;
  const n = W * H;
  let hit = perMap[layer];
  if (hit && hit.snap.length === n) {
    const snap = hit.snap;
    let same = true;
    for (let i = 0; i < n; i++) if (snap[i] !== (tiles[i][layer] | 0)) { same = false; break; }
    if (same) return hit.labels;
  }
  const labels = labelComponents(map, layer, ALL_TILES);
  const snap = hit && hit.snap.length === n ? hit.snap : new Uint16Array(n);
  for (let i = 0; i < n; i++) snap[i] = tiles[i][layer] | 0;
  perMap[layer] = { snap, labels };
  return labels;
}

