/**
 * OSM Simple 3D Buildings tags -> part spec {minH, wallH, roofH, shape, wall, roof, dir, orient}.
 * Heights in metres. Colours as [r,g,b]. See https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings
 */
const NAMED = {
  white: '#f2f0ea', black: '#3a3a3d', grey: '#8f8f8f', gray: '#8f8f8f', lightgrey: '#c8c8c8', lightgray: '#c8c8c8',
  darkgrey: '#5a5a5a', darkgray: '#5a5a5a', silver: '#c0c0c0', red: '#b8332a', darkred: '#7f1f1a', maroon: '#7a2a22',
  brown: '#7b4a2e', tan: '#d2b48c', beige: '#e6dcc0', yellow: '#e8cf5a', lightyellow: '#f3e6a8', gold: '#e3b23c',
  orange: '#d9813a', pink: '#e2a3a3', green: '#3d8a4a', darkgreen: '#285c3c', lightgreen: '#8cc48c', olive: '#7a7a3a',
  blue: '#3a5ea8', lightblue: '#a8c8e0', darkblue: '#24346a', navy: '#24346a', cyan: '#5ab8c8', teal: '#2f7f7f',
  turquoise: '#45b8a8', ivory: '#f4f0dc', cream: '#efe4c4', sandybrown: '#d9a36a', khaki: '#c8b878', salmon: '#e08870',
  coral: '#e07a5f', copper: '#4f9a7a', bronze: '#9b7a45', seagreen: '#2e8b57', mediumseagreen: '#3cb371',
  lightslategrey: '#778899', slategrey: '#708090', dimgrey: '#696969', wheat: '#f0dcae', peru: '#c0803f',
  sienna: '#a0522d', chocolate: '#c0602a', firebrick: '#a82424', crimson: '#c0203a', indianred: '#c05050',
  burlywood: '#d8b080', goldenrod: '#d8a520', darkgoldenrod: '#b8860b', palegoldenrod: '#ece8a8', moccasin: '#f8e0b0',
  antiquewhite: '#f6ead6', linen: '#f6f0e6', whitesmoke: '#f2f2f2', gainsboro: '#dcdcdc', snow: '#f8f6f6',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', forestgreen: '#2a7a2a', darkolivegreen: '#556b2f',
};
const MAT_WALL = { brick: '#a9533d', stone: '#cfc6b0', concrete: '#bdb8ad', glass: '#7fa6c4', plaster: '#e2d8c2',
  metal: '#9ea2a8', wood: '#8b6a4a', sandstone: '#d8c49a', limestone: '#ddd5bf', marble: '#ece8e0', granite: '#9a8a84', mirror: '#8fb0cc' };
const MAT_ROOF = { metal: '#7f878d', tile: '#a5523a', roof_tiles: '#a5523a', tiles: '#a5523a', copper: '#4f9a7a',
  gold: '#e3b23c', glass: '#9cc0d8', slate: '#5d6268', concrete: '#9a958c', tar_paper: '#6a6866', asphalt: '#5f5f62', grass: '#5f9a3e', stone: '#a8a090', wood: '#7a5a3a' };

/** Parse an OSM colour (hex or name) -> [r,g,b] or null. */
export function colour(v) {
  if (!v) return null;
  let s = String(v).trim().toLowerCase().replace(/[\s_]/g, '');
  if (NAMED[s]) s = NAMED[s];
  if (/^#?[0-9a-f]{6}$/.test(s)) { s = s.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); }
  if (/^#?[0-9a-f]{3}$/.test(s)) { s = s.replace('#', ''); return [0, 1, 2].map((i) => parseInt(s[i] + s[i], 16)); }
  return null;
}

const num = (v) => { if (v == null) return NaN; const m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? +m[0] : NaN; };
const LEVEL_M = 3.2;

/** Part spec from tags; null if it has no usable height information at all (uses defaults). */
export function partSpec(t) {
  let top = num(t.height);
  const levels = num(t['building:levels']), roofLevels = num(t['roof:levels']);
  let roofH = num(t['roof:height']);
  if (!Number.isFinite(roofH)) roofH = Number.isFinite(roofLevels) ? roofLevels * LEVEL_M : NaN;
  if (!Number.isFinite(top)) top = Number.isFinite(levels) ? levels * LEVEL_M + (Number.isFinite(roofH) ? roofH : 0) : 10;
  let minH = num(t.min_height);
  if (!Number.isFinite(minH)) { const ml = num(t['building:min_level']); minH = Number.isFinite(ml) ? ml * LEVEL_M : 0; }
  const shape = (t['roof:shape'] || 'flat').toLowerCase();
  if (!Number.isFinite(roofH)) roofH = shape === 'flat' ? 0 : shape === 'dome' || shape === 'onion' ? Math.min(top - minH, 6) * 0.9 : Math.min(top - minH, 4);
  if (shape === 'flat') roofH = 0;
  roofH = Math.max(0, Math.min(roofH, top - minH));
  const mat = (t['building:material'] || '').toLowerCase();
  const rmat = (t['roof:material'] || '').toLowerCase();
  const wall = colour(t['building:colour'] || t['colour']) || colour(MAT_WALL[mat]) || colour('#d8cfbe');
  const roof = colour(t['roof:colour']) || colour(MAT_ROOF[rmat]) || (shape === 'flat' ? colour('#8d8780') : colour('#7a848a'));
  const dirV = t['roof:direction'];
  const DIRS = { n: 0, nne: 22.5, ne: 45, ene: 67.5, e: 90, ese: 112.5, se: 135, sse: 157.5, s: 180, ssw: 202.5, sw: 225, wsw: 247.5, w: 270, wnw: 292.5, nw: 315, nnw: 337.5 };
  let dir = num(dirV);
  if (!Number.isFinite(dir) && dirV && DIRS[String(dirV).toLowerCase()] != null) dir = DIRS[String(dirV).toLowerCase()];
  return { minH, wallH: top - roofH, top, roofH, shape, wall, roof, dir: Number.isFinite(dir) ? dir : null,
    orient: (t['roof:orientation'] || 'along').toLowerCase(), glass: mat === 'glass' || mat === 'mirror' };
}
