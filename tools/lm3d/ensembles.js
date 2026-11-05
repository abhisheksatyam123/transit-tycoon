/**
 * Landmark ensembles baked from OSM 3D buildings (and modelled statues). Fields:
 *   id (landmark id), src (scratchpad/osm3d/raw/<src>.json or omitted for model-only), title,
 *   covers (old LANDMARK_SPECS ids replaced), sel {poly:[[lat,lon]..]} | {circle:[lat,lon,metres]} selects buildings by
 *   centroid and defines the footprint, anchor [lat,lon] (scale origin, default sel centroid), scale (default LM_SCALE 2),
 *   ground 'grass'|'paved'|'paving'|'cobble', trees, streets (default true), styles [(B)=>void], extraFaces (toM)=>faces.
 */
import { KREMLIN } from './ens/kremlin.js';
import { GROUP_A } from './ens/groupA.js';
import { GROUP_B } from './ens/groupB.js';
import { STATUES } from './ens/statues.js';
import { STATUES_ALL } from './ens/statuesAll.js';

// order = tile priority: hand-modelled icon monuments first, then the large building ensembles, then the generic OSM monuments
export const ENSEMBLES = [...STATUES, ...GROUP_A, ...GROUP_B, ...KREMLIN, ...STATUES_ALL];
