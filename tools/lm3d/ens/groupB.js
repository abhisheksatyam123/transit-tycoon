/** Ensembles groupB (see ../ensembles.js for fields). Stalinist "Seven Sisters", Shukhov tower, VDNKh, Novodevichy. */
import { stBasil, byBuilding } from '../styles.js';
import { stStone, stGoldTop, spireTo, crownOn } from './groupBStyles.js';
import { shukhovLattice } from './groupBShukhov.js';

const SISTER_WALL = '#e6d8b8';

export const GROUP_B = [
  {
    id: 'shukhov_tower', src: 'shukhov', covers: ['shukhov_tower'], anchor: [55.71720, 37.61190], title: 'Shukhov Radio Tower', ground: 'grass',
    sel: { circle: [55.71720, 37.61190, 45] },
    // OSM only has six thin shell parts (no lattice): drop them and model the lattice (groupBShukhov.js)
    styles: [(B) => { B.splice(0, B.length); }],
    extraFaces: (toM) => shukhovLattice(toM, 55.71720, 37.61190),
    trees: true,
  },
  {
    id: 'vdnkh', src: 'vdnkh', covers: ['vdnkh'], anchor: [55.82600, 37.63760], title: 'VDNKh (Central Pavilion axis)', ground: 'paved',
    sel: { circle: [55.82600, 37.63760, 260] },
    styles: [stBasil, byBuilding([
      { osm: 'r1391529', wall: '#efe4c6', roof: '#c9a54a', force: true }, // Main Entrance arch: cream stone, gold
    ])],
    trees: true,
  },
  {
    id: 'novodevichy', src: 'novodevichy', covers: ['novodevichy'], anchor: [55.72620, 37.55620], title: 'Novodevichy Convent', ground: 'grass',
    sel: { circle: [55.72620, 37.55620, 150] },
    styles: [stBasil, byBuilding([
      { osm: 'r3134990', wall: '#b8402f', roof: '#196F3D' },
    ])],
    trees: true,
  },
  {
    id: 'ukraina', src: 'ukraina', covers: ['ukraina'], anchor: [55.75250, 37.56650], title: 'Hotel Ukraina', ground: 'paved',
    sel: { circle: [55.75160, 37.56630, 150] },
    styles: [stStone(SISTER_WALL, '#6f7d7a'), stGoldTop],
    trees: true,
  },
  {
    id: 'kotelnicheskaya', src: 'kotelnicheskaya', covers: ['kotelnicheskaya'], anchor: [55.74600, 37.64160], title: 'Kotelnicheskaya Embankment Building', ground: 'paved',
    sel: { circle: [55.74720, 37.64260, 130] },
    styles: [stStone(SISTER_WALL, '#6f7d7a'), stGoldTop, crownOn('w205848863', [[9, 0.82], [8, 0.64], [12, 0.46]], 176)],
    trees: true,
  },
  {
    id: 'kudrinskaya', src: 'kudrinskaya', covers: ['kudrinskaya'], anchor: [55.75840, 37.58120], title: 'Kudrinskaya Square Building', ground: 'paved',
    sel: { circle: [55.75840, 37.58120, 130] },
    styles: [stStone(SISTER_WALL, '#6f7d7a'), stGoldTop],
    trees: true,
  },
  {
    id: 'mid', src: 'mid', covers: ['mid'], anchor: [55.74620, 37.58430], title: 'Ministry of Foreign Affairs', ground: 'paved',
    sel: { circle: [55.74620, 37.58430, 130] },
    styles: [stStone(SISTER_WALL, '#6f7d7a'), stGoldTop],
    trees: true,
  },
  {
    id: 'leningradskaya', src: 'leningradskaya', covers: ['leningradskaya'], anchor: [55.77390, 37.65310], title: 'Hilton Moscow Leningradskaya', ground: 'paved',
    sel: { circle: [55.77390, 37.65310, 130] },
    styles: [stStone('#dcb9a0', '#6f7d7a'), stGoldTop, spireTo('w992908945', 136)],
    trees: true,
  },
  {
    id: 'red_gates', src: 'red_gates', covers: ['red_gates'], anchor: [55.76850, 37.64910], title: 'Red Gates Administrative Building', ground: 'paved',
    sel: { circle: [55.76850, 37.64910, 130] },
    styles: [stStone(SISTER_WALL, '#6f7d7a'), stGoldTop, spireTo('w992119815', 133)],
    trees: true,
  },
];
