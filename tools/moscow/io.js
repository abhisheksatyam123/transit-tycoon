/**
 * Loading of Overpass JSON layers. Each layer is read from the v1 raw directory
 * (`<dir>/<name>.json`) and merged with the v2 directory (`<dir>/../raw2`): the merged
 * `raw2/<name>.json` when it exists, otherwise the per-chunk files `raw2/chunks/<name>_*.json`.
 * Elements are de-duplicated by type+id. Missing layers are warned and yield null.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Elements of one Overpass JSON file, or null when unreadable.
 * @param {string} file
 * @returns {Array<object>|null}
 */
function readElements(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(data.elements) ? data.elements : [];
  } catch (e) {
    console.warn(`[bake] unreadable ${file} (${String(e).slice(0, 80)}); skipping`);
    return null;
  }
}

/**
 * v2 files for a layer: merged file, else sorted chunk files.
 * @param {string} dir2 raw2 directory
 * @param {string} name layer name
 * @returns {string[]}
 */
function v2Files(dir2, name) {
  const merged = join(dir2, `${name}.json`);
  if (existsSync(merged)) return [merged];
  const cdir = join(dir2, 'chunks');
  if (!existsSync(cdir)) return [];
  return readdirSync(cdir)
    .filter((f) => f.startsWith(`${name}_`) && f.endsWith('.json'))
    .sort()
    .map((f) => join(cdir, f));
}

/**
 * Load one layer (v1 + v2 merged, de-duplicated) and return its elements.
 * @param {string} dir raw directory (v1)
 * @param {string} name layer name without extension
 * @param {string} [dir2] v2 raw directory (default: sibling `raw2`)
 * @returns {Array<object>|null} elements, or null when nothing usable exists
 */
export function loadLayer(dir, name, dir2 = join(dirname(dir), 'raw2')) {
  const files = [join(dir, `${name}.json`), ...v2Files(dir2, name)].filter((f) => existsSync(f));
  if (!files.length) {
    console.warn(`[bake] layer "${name}" missing; skipping`);
    return null;
  }
  const byKey = new Map();
  let total = 0;
  for (const f of files) {
    const els = readElements(f);
    if (!els) continue;
    total += els.length;
    for (const e of els) {
      const k = `${e.type}${e.id}`;
      const old = byKey.get(k);
      // keep the first copy, but prefer one that carries geometry/centre
      if (!old || (!hasGeom(old) && hasGeom(e))) byKey.set(k, e);
    }
  }
  if (!byKey.size && !total) return null;
  console.log(`[bake] layer "${name}": ${byKey.size} elements from ${files.length} file(s)`);
  return [...byKey.values()];
}

/** @param {object} e @returns {boolean} */
function hasGeom(e) {
  return Array.isArray(e.geometry) || !!e.center || e.lat !== undefined;
}

/**
 * Ways that carry geometry.
 * @param {Array<object>|null} els
 * @returns {Array<object>}
 */
export function waysOf(els) {
  return (els || []).filter((e) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length > 1);
}

/**
 * Map of node id -> element for all node elements.
 * @param {Array<object>|null} els
 * @returns {Map<number,object>}
 */
export function nodeIndex(els) {
  const m = new Map();
  for (const e of els || []) if (e.type === 'node') m.set(e.id, e);
  return m;
}

/**
 * Tag value helper.
 * @param {object} el
 * @param {string} key
 * @returns {string}
 */
export function tag(el, key) {
  return (el.tags && el.tags[key]) || '';
}
