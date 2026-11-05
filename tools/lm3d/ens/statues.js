/** Ensembles statues (see ../ensembles.js for fields). Positions: OSM monument nodes (raw/*.json) or Wikipedia coordinates. */
import { place } from '../model.js';
import { workerKolkhozFaces, spaceRocketFaces, victoryObeliskFaces, peterFaces, gagarinFaces, pushkinFaces, triumphArchFaces, malchikFaces } from './statueModels.js';
import { byBuilding } from '../styles.js';

/** Standalone monuments are baked at 3x (ensembles 2x, bake.js LM_SCALE) so slender statues stay readable beside OpenGFX houses. */
const at = (fn, la, lo, hd = 0) => (toM) => place(fn(), toM, la, lo, hd);

export const STATUES = [
  // node 614438912; the pavilion (OSM 10 m museum parts) trails WNW, the pair strides ESE (pavilion long axis 117 deg)
  { id: 'r7d_worker_kolkhoz', title: 'Worker and Kolkhoz Woman, VDNKh', src: 'vdnkh', ground: 'paved', streets: false, scale: 6,
    sel: { circle: [55.8281766, 37.646748, 55] }, anchor: [55.8281766, 37.646748], extraFaces: at(workerKolkhozFaces, 55.8281766, 37.646748, 117) },
  // node 250525422; OSM building parts model the plume and the museum stylobate
  { id: 'r7d_space_conquerors', title: 'Monument to the Conquerors of Space, VDNKh', src: 'vdnkh', ground: 'paved', streets: false, scale: 6,
    sel: { circle: [55.8226761, 37.6397188, 60] }, anchor: [55.8226761, 37.6397188],
    styles: [(B) => { for (const b of B) { if (b.spec.top > 20) { b.spec.wall = [196, 202, 210]; b.spec.roof = [205, 210, 216]; b.spec.win = false; } } }],
    extraFaces: at(spaceRocketFaces, 55.8226761, 37.6397188, 0) },
  // node 420424302 (height 141.8); faces east toward Kutuzovsky Prospekt / the park
  { id: 'r7d_victory_obelisk', title: 'Victory Monument, Poklonnaya Hill', src: 'poklonnaya', ground: 'paved', streets: false, scale: 6,
    sel: { circle: [55.731699, 37.5070085, 45] }, anchor: [55.731699, 37.5070085], extraFaces: at(victoryObeliskFaces, 55.731699, 37.5070085, 75) },
  // OSM way 191679568 centroid; on its island at the Vodootvodny Canal spit, facing the Kremlin (NNE)
  { id: 'r7d_peter_great', title: 'Peter the Great Statue', ground: 'none', streets: false, scale: 6,
    sel: { circle: [55.73862, 37.60831, 40] }, anchor: [55.73862, 37.60831], extraFaces: at(peterFaces, 55.73862, 37.60831, 25) },
  // Wikipedia 55.7082, 37.5824 (Gagarin Square, Leninsky Prospekt); faces the city centre (NE)
  { id: 'r7d_gagarin', title: 'Monument to Yuri Gagarin, Leninsky Prospekt', ground: 'none', streets: false, scale: 6,
    sel: { circle: [55.7082, 37.5824, 40] }, anchor: [55.7082, 37.5824], extraFaces: at(gagarinFaces, 55.7082, 37.5824, 40) },
  // statue in the vestibule → stand-in on the tile north of the station (119,114), facing it (S); model authored oversize for game legibility
  { id: 'r7d_malchik', title: 'Malchik («Сострадание»), Mendeleevskaya Station', ground: 'none', streets: false, scale: 6,
    sel: { circle: [55.784, 37.6, 6] }, anchor: [55.784, 37.6], extraFaces: at(malchikFaces, 55.784, 37.6, 180) },
  { id: 'r7d_pushkin', title: 'Monument to Alexander Pushkin, Pushkinskaya Square', ground: 'none', streets: false, scale: 6,
    sel: { circle: [55.7653, 37.6054, 30] }, anchor: [55.7653, 37.6054], extraFaces: at(pushkinFaces, 55.7653, 37.6054, 160) },
  // Wikipedia 55.73675, 37.51992 (Victory Square); passage along Kutuzovsky Prospekt (~110 deg)
  { id: 'r7d_triumphal_arch', title: 'Triumphal Arch of Moscow', ground: 'none', streets: false, scale: 6,
    sel: { circle: [55.73675, 37.51992, 35] }, anchor: [55.73675, 37.51992], extraFaces: at(triumphArchFaces, 55.73675, 37.51992, 110) },
];
void byBuilding;
