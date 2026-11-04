// Quick test render: bun tools/lm3d/try.js <raw.json> <out.png> <zoom> [lat0,lon0,lat1,lon1]
import { writeFileSync } from 'node:fs';
import { loadBuildings, toM, inRing } from './osm.js';
import { partFaces, centroid } from './roofs.js';
import { render } from './raster.js';
import { encodeRGBA } from './png.js';
const [src, out, z, box] = process.argv.slice(2);
let B = loadBuildings(src);
if (box) { const [a, b, c, d] = box.split(',').map(Number); const p0 = toM(a, b), p1 = toM(c, d);
  const X0 = Math.min(p0[0], p1[0]), X1 = Math.max(p0[0], p1[0]), Y0 = Math.min(p0[1], p1[1]), Y1 = Math.max(p0[1], p1[1]);
  B = B.filter((q) => { const c = centroid(q.poly.outer[0]); return c[0] >= X0 && c[0] <= X1 && c[1] >= Y0 && c[1] <= Y1; }); }
const faces = []; for (const b of B) faces.push(...partFaces(b.poly, b.spec));
const t0 = performance.now(); const img = render(faces, +z);
writeFileSync(out, encodeRGBA(img.w, img.h, img.rgba));
console.log('buildings', B.length, 'faces', faces.length, 'img', img.w, 'x', img.h, (performance.now() - t0).toFixed(0), 'ms');
