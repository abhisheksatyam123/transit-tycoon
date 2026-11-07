/**
 * Tree-planting options for the Plant trees tool (OpenTTD tree_gui.cpp BuildTreesWindow): the tree type
 * (Random, or one species the renderer draws for the current climate) and the planting mode
 * (Normal = drag area, Forest small / large = scatter a forest group around the clicked tile).
 * Session UI state only; the chosen species and mode travel with each planted command.
 */
import { treeSpeciesCount } from '../../simulation/cmdTerraform.js';

export const PLANT_MODE_LABEL = { normal: 'Normal', forestSmall: 'Forest small', forestLarge: 'Forest large' };

/** Per app: { tree: undefined (random) | species index, mode }. */
const store = new WeakMap();

/** @param {any} app @returns {{tree: number|undefined, mode: 'normal'|'forestSmall'|'forestLarge'}} */
export function plantOptions(app) {
  let o = store.get(app);
  if (!o) { o = { tree: undefined, mode: 'normal' }; store.set(app, o); }
  return o;
}

/** @param {any} app @param {{tree?: number|undefined, mode?: string}} patch */
export function setPlantOptions(app, patch) {
  const o = plantOptions(app);
  if (patch.tree !== undefined || 'tree' in patch) o.tree = patch.tree;
  if (patch.mode) o.mode = patch.mode;
  return o;
}

/** Species labels for the current climate: "Random" or "Type n of m". */
export function treeTypeLabels(state, tree) {
  if (tree === undefined) return 'random';
  return `type ${tree + 1} of ${treeSpeciesCount(state)}`;
}

/** Ordered species list for the picker: [undefined (random), 0, 1, ...]. */
export function treeTypeChoices(state) {
  const n = treeSpeciesCount(state);
  return [undefined, ...Array.from({ length: n }, (_, i) => i)];
}
