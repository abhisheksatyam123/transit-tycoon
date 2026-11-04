/**
 * Modelled Moscow monuments at true metres (kit: ../model.js). Local frame before place(): x = right,
 * -y = forward (the monument's facing = place() heading), z = up. Dimensions from the reference photos in
 * scratchpad/osm3d/ref and published heights (Wikipedia): Worker and Kolkhoz Woman 24.5 m on a 34.5 m pavilion,
 * Victory Monument 141.8 m with Nike at ~100 m, Peter the Great 98 m, Gagarin 42.5 m, Triumphal Arch 28 m.
 */
import { box, lathe, cylinder, cone, sphere, prism, tube, panel, place, loft, extrudeY, ribbon } from '../model.js';

const STEEL = '#d6dade', TI = '#b9c0c8', BRONZE = '#5e4a34', DBRONZE = '#3f3428', GRANITE = '#8a847c', LGRANITE = '#c9c3b8', RGRANITE = '#7a3a32', STONE = '#e8e2d2', IRON = '#2e3236', GOLD = '#d9a838';

/** Limb as a tapered square tube through points with widths (one width per point). */
function limb(o, pts, ws, c) { for (let i = 0; i + 1 < pts.length; i++) tube(o, [pts[i], pts[i + 1]], (ws[i] + ws[i + 1]) / 2, c); }

/** Worker and Kolkhoz Woman: striding pair raising hammer and sickle, the woman's scarf flying back; on the stepped prow pavilion. */
export function workerKolkhozFaces() {
  const o = [];
  // pavilion pedestal (34.5 m): stepped tiers narrowing upward with a pointed prow at the front (-y)
  const tiers = [[0, 11, 40, 20], [11, 19, 32, 16], [19, 27, 25, 13], [27, 34.5, 19, 10.5]];
  for (const [z0, z1, L, W] of tiers) prism(o, [[-W / 2, L / 2], [-W / 2, -L / 2 + W / 2], [0, -L / 2], [W / 2, -L / 2 + W / 2], [W / 2, L / 2]], z0, z1 - z0, LGRANITE);
  const z = 34.5, S = STEEL;
  // worker (left, x<0) and kolkhoz woman (right, x>0): wide stride, front feet at -y
  for (const [x, w] of [[-1.7, 1], [1.7, 0]]) {
    const hip = [x, 0, z + 8.2];
    limb(o, [[x * 1.1, -7.2, z + 0.4], [x, -3.6, z + 4.6], hip], [2.0, 2.2, 2.6], S); // front leg
    limb(o, [[x * 1.2, 7.8, z + 0.4], [x, 4.0, z + 4.2], hip], [1.9, 2.1, 2.6], S); // rear leg
    if (w) tube(o, [hip, [x, -1.0, z + 14.8]], 3.8, S); // worker's torso, leaning forward
    else { // woman's skirt flaring back, then torso
      loft(o, [0, 1, 2].map((k) => { const zz = z + 3.0 + k * 2.8, r = 4.2 - k * 1.0, sh = 3.2 - k * 1.4; return Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * 2 * Math.PI; return [x + r * 0.8 * Math.cos(a), sh + r * Math.sin(a), zz]; }); }), S);
      tube(o, [[x, 0, z + 9.5], [x, -1.0, z + 14.6]], 3.3, S);
    }
    sphere(o, x, -1.6, z + 16.1, 1.05, S, 8);
  }
  // inner arms raised to the crossed hammer and sickle; outer arms stretched back
  limb(o, [[-0.8, -1.0, z + 14.2], [-0.4, -2.0, z + 18.2], [0, -2.6, z + 21.6]], [1.4, 1.2, 1.0], S);
  limb(o, [[0.8, -1.0, z + 14.2], [0.5, -2.0, z + 18.2], [0.1, -2.8, z + 21.6]], [1.4, 1.2, 1.0], S);
  limb(o, [[-2.9, -0.8, z + 14.0], [-4.0, 3.0, z + 12.8], [-4.6, 7.2, z + 12.4]], [1.4, 1.2, 1.0], S);
  limb(o, [[2.9, -0.8, z + 14.0], [4.2, 3.2, z + 13.4], [5.0, 7.8, z + 13.4]], [1.4, 1.2, 1.0], S);
  // hammer (handle + head) and sickle (arc) above the hands, reaching 24.5 m
  tube(o, [[0, -2.6, z + 21.0], [-0.2, -2.7, z + 24.0]], 0.45, S); box(o, -0.2, -2.7, z + 23.4, 2.4, 0.8, 1.0, S);
  tube(o, [[0.2, -2.8, z + 21.4], [0.6, -2.9, z + 22.6]], 0.4, S);
  const arc = Array.from({ length: 7 }, (_, k) => { const t = Math.PI * (0.15 + 0.85 * k / 6); return [0.6 + 1.6 * Math.cos(t) + 1.2, -2.9, z + 22.6 + 1.9 * Math.sin(t)]; });
  for (let k = 0; k + 1 < arc.length; k++) tube(o, [arc[k], arc[k + 1]], 0.35, S);
  // the woman's scarf: long ribbon flying back from her shoulders, widening
  ribbon(o, [[2.4, 0.2, z + 15.0], [3.4, 4.5, z + 14.6], [4.8, 9.5, z + 14.0], [5.4, 13.5, z + 14.6], [5.8, 16.0, z + 13.6]], [0.8, 1.4, 1.9, 1.6, 0.9], S);
  return o;
}

/** Conquerors of Space: OSM 3D models the titanium plume (top part r18445265 at 102.5 m, offset -2.8,+26.7 m from node 250525422); this adds the rocket on its tip. */
export function spaceRocketFaces() {
  const o = []; const x = -2.8, y = 26.7, z = 102.5;
  tube(o, [[x, y, z - 1], [x, y + 1.0, z + 3.6]], 1.5, TI);
  for (const f of (() => { const q = []; cone(q, 0, 0, 0, 0.75, 2.2, TI, 8); return q; })()) o.push({ ...f, pts: f.pts.map(([a, b, c]) => [x + a, y + 1.0 + b + c * 0.22, z + 3.6 + c]) });
  return o;
}

/** Victory Monument, Poklonnaya Hill: 141.8 m trihedral granite bayonet, bronze reliefs, Nike with trumpet at ~100 m, St George on a round plinth in front. */
export function victoryObeliskFaces() {
  const o = [];
  lathe(o, 0, 0, [[16, 0], [16, 1.2], [13.5, 1.2], [13.5, 2.4], [11, 2.4], [11, 3.6], [0, 3.6]], 24, GRANITE);
  // three-sided bayonet: triangle with slightly hollow faces (6 points), tapering, sharp tip
  const sec = (zz, r) => Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 3, rr = i % 2 ? r * 0.62 : r; return [rr * Math.cos(a), rr * Math.sin(a), zz]; });
  const H = 141.8, rings = [];
  for (const [zz, r] of [[3.6, 7.2], [20, 6.6], [60, 5.0], [100, 3.4], [125, 2.2], [137, 1.2]]) rings.push(sec(zz, r));
  loft(o, rings, '#a29c94', false);
  const tip = rings[rings.length - 1]; for (let i = 0; i < 6; i++) o.push({ pts: [tip[i], tip[(i + 1) % 6], [0, 0, H]], col: [162, 156, 148], kind: 'model' });
  // bronze relief bands (lower third) on the three faces
  for (const zz of [10, 18, 26]) loft(o, [sec(zz, 6.95), sec(zz + 3.2, 6.85)], BRONZE, false);
  // Nike (front, facing -y) with spread wings and trumpet, ~100 m
  const nz = 98, ny = -4.2;
  tube(o, [[0, ny, nz], [0, ny - 0.6, nz + 6.5]], 1.6, BRONZE); sphere(o, 0, ny - 0.7, nz + 7.4, 0.7, BRONZE, 8);
  panel(o, [[-0.6, ny + 0.2, nz + 6], [-5.5, ny + 1.2, nz + 9.5], [-6, ny + 1.4, nz + 6.5], [-0.6, ny + 0.4, nz + 3.5]], BRONZE);
  panel(o, [[0.6, ny + 0.2, nz + 6], [5.5, ny + 1.2, nz + 9.5], [6, ny + 1.4, nz + 6.5], [0.6, ny + 0.4, nz + 3.5]], BRONZE);
  tube(o, [[0.4, ny - 0.8, nz + 6.8], [1.2, ny - 3.6, nz + 8.8]], 0.4, BRONZE); // trumpet
  // St George slaying the dragon: round granite plinth in front of the obelisk
  lathe(o, 0, -26, [[4.5, 0], [4.5, 7], [4.8, 7], [4.8, 7.6], [0, 7.6]], 16, GRANITE);
  box(o, 0, -26, 7.6, 1.6, 4.4, 2.6, DBRONZE); tube(o, [[0, -28.2, 9.6], [0, -29.4, 11.6]], 0.9, DBRONZE);
  tube(o, [[0, -25.6, 10.2], [0, -25.4, 13.2]], 1.0, DBRONZE); tube(o, [[0.2, -26.6, 12.6], [0.8, -29.8, 8.6]], 0.25, DBRONZE);
  return o;
}

/** Peter the Great (Tsereteli, 1997): 98 m; Peter (18 m) on the deck of a three-masted ship, rostral ship prows and stepped granite base on an island. */
export function peterFaces() {
  const o = [];
  lathe(o, 0, 0, [[24, 0], [24, 1.5], [19, 1.5], [19, 3], [0, 3]], 16, GRANITE); // island + steps
  // base of rostral prows (bronze waves) narrowing upward
  lathe(o, 0, 0, [[13, 3], [11.5, 10], [8, 16], [0, 16]], 10, DBRONZE);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 2 * Math.PI; tube(o, [[11 * Math.cos(a), 11 * Math.sin(a), 6], [15 * Math.cos(a), 15 * Math.sin(a), 8.5]], 1.4, BRONZE); }
  // hull of the ship along the facing axis, bow at -y
  const hull = (zz, s) => [[-3.5 * s, 13], [-4.5 * s, 4], [-3.8 * s, -9], [0, -16], [3.8 * s, -9], [4.5 * s, 4], [3.5 * s, 13]].map(([x, y]) => [x, y, zz]);
  loft(o, [hull(16, 0.6), hull(21, 1), hull(24, 1.05)], BRONZE);
  box(o, 0, 11, 24, 7, 4, 3, BRONZE); // stern castle
  // Peter: standing on the deck, right hand holding a scroll forward
  const z = 24.5;
  limb(o, [[-0.8, -2, z], [-0.7, -2, z + 7.5]], [1.2, 1.5], DBRONZE); limb(o, [[0.8, -1.5, z], [0.7, -2, z + 7.5]], [1.2, 1.5], DBRONZE);
  tube(o, [[0, -2, z + 7], [0, -2.2, z + 14.5]], 3.0, DBRONZE); sphere(o, 0, -2.3, z + 16.2, 1.2, DBRONZE, 8);
  limb(o, [[1.8, -2, z + 13.6], [2.8, -4.2, z + 11.8], [3.0, -6.0, z + 12.4]], [0.9, 0.8, 0.7], DBRONZE);
  limb(o, [[-1.8, -2, z + 13.6], [-2.4, -1.2, z + 10.4]], [0.9, 0.8], DBRONZE);
  loft(o, [[[-2.4, -1, z + 2], [2.4, -1, z + 2], [2.4, -3.4, z + 2], [-2.4, -3.4, z + 2]], [[-1.6, -1.2, z + 10], [1.6, -1.2, z + 10], [1.6, -2.8, z + 10], [-1.6, -2.8, z + 10]]], DBRONZE); // coat
  // masts with yards, furled sails and flags; main mast top + St Andrew flag at 98 m
  for (const [y, top, yards] of [[-8, 78, [44, 58, 70]], [2, 94, [46, 62, 78, 88]], [9, 72, [44, 56, 66]]]) {
    tube(o, [[0, y, 24], [0, y, top]], 0.9, DBRONZE);
    for (const yz of yards) { const hw = 8 - (yz - 40) * 0.09; tube(o, [[-hw, y, yz], [hw, y, yz]], 0.55, DBRONZE); ribbon(o, [[-hw * 0.9, y + 0.6, yz - 2.2], [hw * 0.9, y + 0.6, yz - 2.2]], 2.0, BRONZE); }
  }
  ribbon(o, [[0, 2, 95], [0, 6, 96.2], [0, 9.5, 95.2]], [1.6, 1.4, 1.1], GOLD); // flag
  for (const [y, top] of [[-8, 78], [2, 94], [9, 72]]) { tube(o, [[0, -15.5, 26], [0, y, top - 4]], 0.25, DBRONZE); tube(o, [[-4.5, y + 3, 24], [0, y, top - 6]], 0.2, DBRONZE); tube(o, [[4.5, y + 3, 24], [0, y, top - 6]], 0.2, DBRONZE); }
  tube(o, [[0, -16, 23], [0, -26, 31]], 0.7, DBRONZE); // bowsprit
  return o;
}

/** Yuri Gagarin, Leninsky Prospekt (1980): 42.5 m; fluted titanium column flowing into the 12 m figure with arms stretched down-back; Vostok capsule at the base. */
export function gagarinFaces() {
  const o = [];
  lathe(o, 0, 0, [[6, 0], [6, 1], [4.2, 1], [4.2, 2], [0, 2]], 16, GRANITE);
  sphere(o, 4.6, 3.4, 3.3, 1.3, TI, 10); // Vostok descent capsule
  // fluted column (16 ribs) tapering from 2.6 m to 1.3 m radius, 2 -> 30.5 m
  const fl = (zz, r) => Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * 2 * Math.PI, rr = i % 2 ? r * 0.86 : r; return [rr * Math.cos(a), rr * Math.sin(a), zz]; });
  loft(o, [fl(2, 2.6), fl(12, 2.3), fl(24, 1.7), fl(30.5, 1.35)], TI);
  // figure: legs together rising out of the column, straight body, arms back like wings, head up
  const z = 30.5;
  loft(o, [fl(z, 1.35).filter((_, i) => i % 4 === 0), fl(z + 5, 1.05).filter((_, i) => i % 4 === 0)], TI, false);
  tube(o, [[0, 0, z + 4.5], [0, -0.2, z + 9.6]], 2.4, TI); sphere(o, 0, -0.3, z + 10.9, 0.95, TI, 8);
  limb(o, [[-1.4, 0, z + 9.2], [-2.6, 1.3, z + 6.6], [-3.4, 2.4, z + 4.6]], [0.8, 0.7, 0.6], TI);
  limb(o, [[1.4, 0, z + 9.2], [2.6, 1.3, z + 6.6], [3.4, 2.4, z + 4.6]], [0.8, 0.7, 0.6], TI);
  return o;
}

/** Pushkin, Pushkinskaya Square (Opekushin, 1880): 4 m bronze figure, head bowed, hat behind his back, on a 6 m dark granite pedestal with lanterns. */
export function pushkinFaces() {
  const o = [];
  box(o, 0, 0, 0, 6, 6, 0.6, '#4a4440'); box(o, 0, 0, 0.6, 4.2, 4.2, 4.6, '#55504a'); box(o, 0, 0, 5.2, 4.8, 4.8, 0.8, '#4a4440');
  limb(o, [[-0.3, 0, 6], [-0.3, 0, 7.8]], [0.5, 0.6], DBRONZE); limb(o, [[0.3, 0.2, 6], [0.3, 0, 7.8]], [0.5, 0.6], DBRONZE);
  loft(o, [[[-0.9, 0.7, 6.4], [0.9, 0.7, 6.4], [0.9, -0.7, 6.4], [-0.9, -0.7, 6.4]], [[-0.7, 0.5, 9.4], [0.7, 0.5, 9.4], [0.7, -0.5, 9.4], [-0.7, -0.5, 9.4]]], DBRONZE); // cloak
  sphere(o, 0, -0.35, 9.85, 0.42, DBRONZE, 8);
  for (const [x, y] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) { tube(o, [[x, y, 0], [x, y, 3.8]], 0.25, IRON); sphere(o, x, y, 4.1, 0.35, '#e8e0b0', 6); }
  return o;
}

/** Triumphal Arch, Victory Square (Bove 1834, rebuilt 1968): 28 m; white stone, single arch, 12 cast-iron columns, dark entablature, attic, six-horse Chariot of Glory. */
export function triumphArchFaces() {
  const o = [];
  const W = 11.5, D = 4.6;
  const arch = Array.from({ length: 9 }, (_, k) => { const t = Math.PI - (k / 8) * Math.PI; return [3.8 * Math.cos(t), 9.2 + 3.8 * Math.sin(t)]; });
  extrudeY(o, [[-W, 0], [-3.8, 0], ...arch, [3.8, 0], [W, 0], [W, 17.6], [-W, 17.6]], -D, D, STONE);
  box(o, 0, 0, 0, 2 * W + 1.6, 2 * D + 3.2, 1.6, LGRANITE); // plinth under the columns
  // entablature (dark, projecting over the column pairs) and cornice
  box(o, 0, 0, 17.6, 2 * W + 3.4, 2 * D + 3.6, 1.6, IRON); box(o, 0, 0, 19.2, 2 * W + 4.2, 2 * D + 4.4, 0.9, '#3a3e42');
  // attic with dark inscription panels, then the chariot pedestal
  box(o, 0, 0, 20.1, 2 * W - 1.0, 2 * D, 4.4, STONE);
  for (const s of [-1, 1]) box(o, 0, s * (D + 0.05), 21.0, 9.0, 0.2, 2.6, IRON);
  box(o, 0, 0, 24.5, 2 * W - 3, 2 * D - 0.6, 0.6, STONE);
  // 12 columns: three per side on each facade
  for (const s of [-1, 1]) for (const x of [-11.0, -9.0, -4.8, 4.8, 9.0, 11.0]) lathe(o, x, s * (D + 1.2), [[0.75, 1.6], [0.62, 16.8], [0.95, 17.6]], 10, IRON);
  // warrior statues on pedestals between the inner columns and the arch
  for (const s of [-1, 1]) for (const x of [-6.9, 6.9]) { box(o, x, s * (D + 0.9), 1.6, 1.6, 1.2, 1.4, LGRANITE); tube(o, [[x, s * (D + 0.9), 3.0], [x, s * (D + 0.9), 5.8]], 0.8, IRON); sphere(o, x, s * (D + 0.9), 6.2, 0.4, IRON, 6); }
  // Chariot of Glory: six horses abreast facing forward (-y), Glory standing in the chariot behind them
  for (let i = 0; i < 6; i++) {
    const x = -3.0 + i * 1.2;
    box(o, x, -0.6, 26.0, 0.55, 2.2, 0.9, IRON); tube(o, [[x, -1.6, 26.7], [x, -2.4, 28.0]], 0.4, IRON);
    tube(o, [[x, -1.4, 26.0], [x, -1.6, 25.1]], 0.25, IRON); tube(o, [[x, 0.3, 26.0], [x, 0.4, 25.1]], 0.25, IRON);
  }
  box(o, 0, 1.4, 25.1, 2.6, 1.4, 1.2, IRON); tube(o, [[0, 1.6, 26.3], [0, 1.6, 28.6]], 0.8, IRON); tube(o, [[0.3, 1.5, 28.2], [0.6, 0.6, 29.4]], 0.25, IRON);
  return o;
}

/** Minin & Pozharsky (Martos, 1818), Red Square in front of St Basil's: Minin standing, pointing to the Kremlin; Pozharsky seated with shield; red granite pedestal (8.8 m total). */
export function mininPozharskyFaces(toM) {
  const o = [];
  box(o, 0, 0, 0, 5.2, 3.8, 0.7, RGRANITE); box(o, 0, 0, 0.7, 4.4, 3.0, 3.6, RGRANITE); box(o, 0, 0, 4.3, 4.8, 3.4, 0.6, RGRANITE);
  box(o, 0, -1.55, 1.4, 3.2, 0.12, 1.8, BRONZE); // bronze relief panel
  const z = 4.9, P = '#4f6a5c';
  // Minin (standing, right hand raised toward the Kremlin)
  limb(o, [[-0.5, 0.2, z], [-0.5, 0.2, z + 1.8]], [0.4, 0.5], P); tube(o, [[-0.5, 0.2, z + 1.7], [-0.5, 0.2, z + 3.2]], 0.9, P); sphere(o, -0.5, 0.15, z + 3.55, 0.3, P, 6);
  limb(o, [[-0.1, 0.2, z + 3.0], [0.6, -0.6, z + 3.9], [1.2, -1.2, z + 4.3]], [0.25, 0.22, 0.2], P);
  // Pozharsky (seated, shield and sword)
  box(o, 0.8, 0.5, z, 1.2, 1.0, 0.8, P); tube(o, [[0.8, 0.5, z + 0.8], [0.8, 0.4, z + 2.1]], 0.8, P); sphere(o, 0.8, 0.35, z + 2.45, 0.28, P, 6);
  lathe(o, 1.45, 0.2, [[0.6, z + 0.5], [0.6, z + 0.6], [0, z + 0.6]], 8, P);
  return place(o, toM, 55.7528014, 37.6226239, 312);
}
