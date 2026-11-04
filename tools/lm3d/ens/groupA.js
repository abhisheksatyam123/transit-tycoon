/** Ensembles groupA (see ../ensembles.js for fields). R7c-A: six Moscow landmarks, photo-checked. */
import { byBuilding } from '../styles.js';
import { colour as C } from '../s3db.js';
import { toM } from '../osm.js';
import { stStone, stGoldTop } from './groupBStyles.js';

export const GROUP_A = [
  {
    id: 'christ_saviour', src: 'christ_saviour', covers: ['christ_saviour'], anchor: [55.74423, 37.60531],
    title: 'Cathedral of Christ the Saviour', ground: 'paved',
    sel: { circle: [55.74423, 37.60531, 75] },
    styles: [byBuilding([
      { osm: 'r7314898', wall: '#f3f1ea', force: true }, // white walls
    ]), (B) => { // gold domes/onions; other roofs dark red-brown like the photo
      const ctr = toM(55.74423, 37.60531);
      for (const b of B) {
        if (Math.hypot(b.c[0] - ctr[0], b.c[1] - ctr[1]) > 50) continue; // only the cathedral mass
        if (b.tags['roof:colour']) continue;
        const dome = b.spec.shape === 'dome' || b.spec.shape === 'onion';
        if (b.spec.top <= 10.5) { b.spec.roof = C('#c9c2b6'); b.spec.wall = C('#9a6f63'); b.spec.win = false; continue; } // stylobate: paved terrace on red granite
        b.spec.roof = C(dome ? '#d9a838' : '#6e3b2c');
      }
    }],
    trees: false,
  },
  {
    id: 'bolshoi', src: 'bolshoi', covers: ['bolshoi'], anchor: [55.76010, 37.61860],
    title: 'Bolshoi Theatre', ground: 'paved',
    sel: { circle: [55.76020, 37.61870, 60] },
    styles: [byBuilding([
      { osm: 'r6204093', wall: '#eee3c2', roof: '#6f7f72', force: true }, // cream facade, green-grey roof
    ])],
    trees: false,
  },
  {
    id: 'msu', src: 'msu', covers: ['msu'], anchor: [55.70340, 37.53000],
    title: 'Moscow State University main building', ground: 'grass',
    sel: { circle: [55.70350, 37.53050, 230] },
    styles: [stStone('#e4d6b6', '#8a8172'), stGoldTop], // cream stone, gilded star spire
    trees: true,
  },
  {
    id: 'ostankino', src: 'ostankino', covers: ['ostankino'], anchor: [55.81973, 37.61166],
    title: 'Ostankino Tower', ground: 'grass',
    sel: { circle: [55.81973, 37.61166, 45] },
    styles: [byBuilding([
      { osm: 'r3440930', wall: '#c9c9c4', roof: '#c9c9c4', force: true },
    ])],
    trees: false,
  },
  {
    id: 'moscow_city', src: 'moscow_city', covers: ['moscow_city'], anchor: [55.74850, 37.53850],
    title: 'Moscow International Business Center', ground: 'paved',
    sel: { circle: [55.74850, 37.53850, 320] },
    styles: [byBuilding([
      { osm: 'r14060559', wall: '#5d7d8f', roof: '#7b97a6', force: true },
      { osm: 'w52929368', wall: '#8a6a4c', roof: '#8a6a4c', force: true }, // Mercury: copper/bronze glass
      { osm: 'w52929377', wall: '#5d7d8f', roof: '#7b97a6', force: true },
      { osm: 'w334490265', wall: '#5d7d8f', roof: '#7b97a6', force: true },
      { osm: 'w336763322', wall: '#5d7d8f', roof: '#7b97a6', force: true },
    ])],
    trees: false,
  },
  {
    id: 'luzhniki', src: 'luzhniki', covers: ['luzhniki'], anchor: [55.71568, 37.55367],
    title: 'Luzhniki Stadium', ground: 'grass',
    sel: { circle: [55.71568, 37.55367, 230] },
    styles: [byBuilding([
      { osm: 'r4112951', wall: '#e4dccb', roof: '#eeeeea', force: true }, // beige bowl, white roof ring
    ])],
    trees: true,
  },
];
