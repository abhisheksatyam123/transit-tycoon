/** Ensembles groupA (see ../ensembles.js for fields). R7c-A: six Moscow landmarks, photo-checked. */
import { byBuilding } from '../styles.js';
import { colour as C, colour } from '../s3db.js';
import { toM } from '../osm.js';
import { stStone, stGoldTop } from './groupBStyles.js';

export const GROUP_A = [
  {
    id: 'christ_saviour', src: 'christ_saviour', covers: ['christ_saviour'], anchor: [55.74423, 37.60531],
    title: 'Cathedral of Christ the Saviour', ground: 'grass',
    sel: { circle: [55.74423, 37.60531, 75] }, trees: true,
    styles: [byBuilding([
      { osm: 'r7314898', wall: '#f3f1ea', force: true }, // white walls
    ]), (B) => { // gold domes/onions; other roofs dark red-brown like the photo
      const ctr = toM(55.74423, 37.60531);
      for (const b of B) {
        if (Math.hypot(b.c[0] - ctr[0], b.c[1] - ctr[1]) > 50) continue; // only the cathedral mass
        if (b.tags['roof:colour']) continue;
        const dome = b.spec.shape === 'dome' || b.spec.shape === 'onion';
        if (b.spec.top <= 10.5) { b.spec.roof = C('#b9b0a3'); b.spec.wall = C('#8f857a'); b.spec.win = false; continue; } // stylobate: paved terrace on red granite
        b.spec.roof = C(dome ? '#d9a838' : '#6e3b2c');
      }
    }], // stylobate: warm grey granite terrace
    trees: false,
  },
  {
    id: 'bolshoi', src: 'bolshoi', covers: ['bolshoi'], anchor: [55.76010, 37.61860],
    title: 'Bolshoi Theatre', ground: 'paved',
    sel: { circle: [55.76020, 37.61870, 60] },
    styles: [byBuilding([
      { osm: 'r6204093', wall: '#eee3c2', roof: '#6f7f72', force: true }, // cream facade, green-grey roof
    ])],
    extraFaces: (toM) => { // 8-column Doric portico + pediment + bronze quadriga, on the square side
      const o = [], a = toM(55.76010, 37.61860), C = colour('#eee3c2'), BR = colour('#4a3a22');
      const x0 = a[0] - 22, y0 = a[1] + 28, base = 0;
      for (let i = 0; i < 8; i++) {
        const cx = x0 + i * 6.3;
        const rad = 0.95, h = 18;
        for (let k = 0; k < 8; k++) { const t0 = (k / 8) * 2 * Math.PI, t1 = ((k + 1) / 8) * 2 * Math.PI;
          o.push({ pts: [[cx + rad * Math.cos(t0), y0 + rad * Math.sin(t0), base], [cx + rad * Math.cos(t1), y0 + rad * Math.sin(t1), base], [cx + rad * Math.cos(t1), y0 + rad * Math.sin(t1), base + h], [cx + rad * Math.cos(t0), y0 + rad * Math.sin(t0), base + h]], col: C, kind: 'model' });
        }
      }
      const bx = (x, y, z0, sx, sy, h, c) => { const x1 = x + sx, y1 = y + sy, z1 = z0 + h; const q = (p, r, s2, t) => o.push({ pts: [p, r, s2, t], col: c, kind: 'model' });
        q([x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]); q([x, y, z0], [x1, y, z0], [x1, y, z1], [x, y, z1]); q([x1, y, z0], [x1, y1, z0], [x1, y1, z1], [x1, y, z1]); q([x1, y1, z0], [x, y1, z0], [x, y1, z1], [x1, y1, z1]); q([x, y1, z0], [x, y, z0], [x, y, z1], [x, y1, z1]); };
      bx(x0 - 3, y0 - 1.5, 0, 6.3 * 7 + 6, 1.5, 1.2, C); // stylobate
      bx(x0 - 2, y0 - 1.5, 18, 6.3 * 7 + 4, 1.5, 2.2, C); // entablature
      const px = x0 - 2, py = y0 - 1.5, pw = 6.3 * 7 + 4;
      o.push({ pts: [[px, py, 20.2], [px + pw, py, 20.2], [px + pw / 2, py, 26]], col: C, kind: 'model' }); // pediment
      const cxq = px + pw / 2, qz = 20.2;
      for (let i = 0; i < 4; i++) bx(cxq - 6 + i * 3.2, py - 2.2, qz, 1.0, 1.1, 2.4, BR); // horses (bodies, simplified)
      bx(cxq - 3, py - 4.5, qz + 2.4, 6, 3, 1.6, BR); // chariot
      return o;
    },
    trees: true,
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
    ]), (B) => { // antenna above 385 m: red/white aviation bands (photo), split into ~9 m slices
      const RED = C('#c23a2e'), WHITE = C('#f2f0ea'), add = [];
      for (let i = B.length - 1; i >= 0; i--) {
        const b = B[i]; if (b.spec.minH < 384) continue;
        B.splice(i, 1);
        const n = Math.max(1, Math.round((b.spec.top - b.spec.minH) / 9));
        for (let k = 0; k < n; k++) {
          const z0 = b.spec.minH + ((b.spec.top - b.spec.minH) * k) / n, z1 = b.spec.minH + ((b.spec.top - b.spec.minH) * (k + 1)) / n;
          const col = Math.floor((z0 + 1) / 9) % 2 ? RED : WHITE;
          add.push({ ...b, spec: { ...b.spec, minH: z0, wallH: z1, top: z1, roofH: 0, shape: 'flat', wall: col, roof: col, win: false, pattern: null } });
        }
      }
      B.push(...add);
    }], // stylobate: warm grey granite terrace
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
