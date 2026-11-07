/** Kremlin + Red Square ensemble (lead). */
import { stBasil, byBuilding } from '../styles.js';
import { toM } from '../osm.js';
import { box, cylinder, prism, place } from '../model.js';
import { mininPozharskyFaces } from './statueModels.js';

import { colour as C } from '../s3db.js';
// Positional colour rules (photo-checked): Senate, Spasskaya + corner towers, walls, Cathedral Square churches.
const near = (lat, lon, r) => { const c = toM(lat, lon); return (b) => Math.hypot(b.c[0] - c[0], b.c[1] - c[1]) < r; };
const SENATE = near(55.7525, 37.6190, 22), SPASSKAYA = near(55.7525, 37.6214, 14);
const TOWERS = [[55.7504, 37.6168], [55.7490, 37.6166], [55.7478, 37.6197], [55.7513, 37.6233], [55.7516, 37.6179]].map(([a, o]) => near(a, o, 9));
const SQUARE = [[55.7512, 37.6209], [55.7508, 37.6205], [55.7517, 37.6216], [55.7515, 37.6211]].map(([a, o]) => near(a, o, 6));
function kremlinColours(B) {
  for (const b of B) {
    const sp = b.spec;
    if (SENATE(b)) { sp.wall = C('#e8d8a0'); sp.roof = C('#5f7d6a'); sp.win = false; } // forced: OSM parts carry saturated tags
    if (SPASSKAYA(b) && !b.tags['building:colour']) { sp.wall = C('#a5402d'); sp.roof = C('#2f5d45'); }
    if (TOWERS.some((f) => f(b)) && !b.tags['building:colour']) { sp.wall = C('#a5402d'); sp.roof = C('#2f5d45'); }
    if (SQUARE.some((f) => f(b)) && !b.tags['building:colour']) { sp.wall = C('#ece2c8'); sp.roof = C('#d8b244'); }
  }
}

// Kremlin wall tops: swallow-tail merlons (M-shaped profile, extruded through the wall) every 4 m along each long
// building=wall outline; faces go on b.extraFaces (metres, scaled with the ensemble by bake.js).
const MERLON = { period: 4, w: 2.2, h: 1.6, t: 1.2 };
function kremlinMerlons(B) {
  for (const b of B) {
    if (!b.tags || b.tags.building !== 'wall') continue;
    const r = b.poly.outer[0], n = r.length; let per = 0;
    for (let i = 0; i < n; i++) per += Math.hypot(r[(i + 1) % n][0] - r[i][0], r[(i + 1) % n][1] - r[i][1]);
    if (per < 100) continue;
    const top = b.spec.top, col = b.spec.wall, out = [];
    const hw = MERLON.w / 2, ht = MERLON.t / 2;
    // M profile in (u along wall, z): flat base, two merlon tips with a V swallow-tail notch
    const prof = [[-hw, 0], [hw, 0], [hw, MERLON.h], [hw / 2, MERLON.h], [0, MERLON.h - 0.6], [-hw / 2, MERLON.h], [-hw, MERLON.h]];
    for (let i = 0; i < n; i++) {
      const a = r[i], q = r[(i + 1) % n], L = Math.hypot(q[0] - a[0], q[1] - a[1]);
      if (L < 2) continue;
      const d = [(q[0] - a[0]) / L, (q[1] - a[1]) / L], nn = [-d[1], d[0]];
      for (let s = MERLON.period / 2; s < L - 1; s += MERLON.period) {
        const cx = a[0] + d[0] * s, cy = a[1] + d[1] * s;
        const P = (u, z, e) => [cx + d[0] * u + nn[0] * e, cy + d[1] * u + nn[1] * e, top + z];
        out.push({ pts: prof.map(([u, z]) => P(u, z, ht)), col, kind: 'wall' });
        out.push({ pts: prof.map(([u, z]) => P(u, z, -ht)).reverse(), col, kind: 'wall' });
        for (let k = 0; k < prof.length; k++) { const j = (k + 1) % prof.length; out.push({ pts: [P(prof[k][0], prof[k][1], -ht), P(prof[j][0], prof[j][1], -ht), P(prof[j][0], prof[j][1], ht), P(prof[k][0], prof[k][1], ht)], col, kind: 'wall' }); }
      }
    }
    b.extraFaces = out;
  }
}

// Spasskaya clock: white disc with black hands on the Red Square (south-east) face, ~63 m high.
function spasskayaClock(toM) {
  const o = [], z = 63;
  box(o, 0, 6.2, z, 5.6, 0.2, 5.6, C('#e8e6dc'));
  box(o, 0, 6.25, z + 2.6, 0.25, 0.1, 1.5, C('#1a1a1a'));
  box(o, 0, 6.25, z + 2.8, 0.1, 0.1, 1.1, C('#1a1a1a'));
  return place(o, toM, 55.7525, 37.6214, 0);
}

// St Basil's onions x1.2 about their own centroid (plan-scale), so they read at zoom 1.
function enlargeOnions(B) {
  const ctr = toM(55.75248, 37.62302);
  for (const b of B) {
    if (!b.spec.pattern || Math.hypot(b.c[0] - ctr[0], b.c[1] - ctr[1]) > 34) continue;
    const r = b.poly.outer[0], cx = r.reduce((a, p) => a + p[0], 0) / r.length, cy = r.reduce((a, p) => a + p[1], 0) / r.length;
    b.poly.outer[0] = r.map((p) => [cx + (p[0] - cx) * 1.2, cy + (p[1] - cy) * 1.2, ...p.slice(2)]);
  }
}

/** Kremlin Senate & Arsenal parts are tagged pure #FFD700 / sea-green in OSM; photos show pale ochre walls, white trim, muted green-grey roofs. */
function senateMuted(B) {
  const gold = (v) => (v || '').toLowerCase() === '#ffd700';
  for (const b of B) {
    const w = b.tags['building:colour'], r = b.tags['roof:colour'];
    if (gold(w)) b.spec.wall = C('#e8d8a0');
    if (gold(r) || (r || '').toLowerCase() === '#2e8b57') b.spec.roof = C('#5f7d6a');
  }
}

export const KREMLIN = [
  {
    id: 'kremlin', src: 'kremlin', covers: ['kremlin', 'red_square', 'gum'], anchor: [55.7492, 37.6175], title: 'Moscow Kremlin, Red Square, St Basil\'s Cathedral & GUM', ground: 'grass',
    sel: { poly: [[55.74885, 37.61130], [55.75060, 37.61090], [55.75290, 37.61190], [55.75470, 37.61500], [55.75610, 37.61700],
      [55.75610, 37.61840], [55.75600, 37.62290], [55.75440, 37.62340], [55.75180, 37.62420], [55.75020, 37.62340], [55.74930, 37.62180]] },
    styles: [stBasil, enlargeOnions, kremlinColours, senateMuted, kremlinMerlons, byBuilding([
      { osm: 'r51497', wall: '#dcbb6c', roof: '#8d969a' }, // Arsenal: ochre
      { osm: 'r225033', wall: '#efe4c6', roof: '#5f7d6a', force: true }, // Grand Kremlin Palace: cream, green roof
      { osm: 'r1359335', wall: '#ece0bf', roof: '#47805e' }, // Armoury
      { osm: 'r3031379', wall: '#e9e7e2', roof: '#9a9c9e' }, // State Kremlin Palace: white marble + glass
      { osm: 'r3062892', wall: '#f0e2c0', roof: '#8d969a' }, // Manege
      { osm: 'r3330565', wall: '#e6d5ae', roof: '#62786c', glassRound: '#a9c6d6' }, // GUM
      { osm: 'r452031', wall: '#e6d5ae', roof: '#62786c' }, // Middle Trading Rows
      { osm: 'r5963922', wall: '#b8402f', roof: '#a3abb0', force: true, win: false }, // Historical Museum: red brick, silver roofs
      { osm: 'r7624254', wall: '#c4553f', roof: '#3f7a4f' }, // Kazan Cathedral
      { osm: 'r3272726', wall: '#6e2a26', roof: '#4a2522', win: false }, // Lenin Mausoleum: red/black granite
    ])],
    trees: true,
    extraFaces: (toM) => [...mininPozharskyFaces(toM), ...spasskayaClock(toM)], // Martos monument in front of St Basil's (node 995935368)
  },
];
