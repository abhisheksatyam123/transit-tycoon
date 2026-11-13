/** R5f: VDNKh exhibition park (2x2): central pavilion with tall spire and star, triumphal arch gate, gold fountain. */
import { footprintPixel, heightPx, PX } from '../pixelArt.js';
import { registerLandmark } from './registry.js';

/** Build VDNKh (footprint 2x2): ground park is drawn separately; only the monuments here. */
function buildVdnkh(w, h) {
  const top = heightPx(97);
  const s = footprintPixel(w, h, top);
  // fountain (gold, round) on the front-right
  s.cylinder(0.62, 0.5, 0.2, 0, 5, PX.gold);
  s.cylinder(0.62, 0.5, 0.12, 5, 9, PX.gold);
  s.cylinder(0.62, 0.5, 0.02, 9, 20, PX.cream);
  // triumphal arch (Main Entrance) on the left: two piers and a lintel, dark passage
  const au = -0.7;
  s.box(au - 0.06, -0.3, au + 0.06, -0.18, 0, 34, PX.cream, { windows: null });
  s.box(au - 0.06, 0.18, au + 0.06, 0.3, 0, 34, PX.cream, { windows: null });
  s.box(au - 0.08, -0.32, au + 0.08, 0.32, 34, 42, PX.sand, { windows: null });
  s.poly3([[au + 0.06, -0.18, 0], [au + 0.06, 0.18, 0], [au + 0.06, 0.18, 24], [au + 0.06, -0.18, 24]], PX.black, 0.6, false);
  // central pavilion: wide white base, stepped drum, gold-tipped spire with red star
  s.box(-0.36, -0.3, 0.36, 0.3, 0, 26, PX.white);
  s.box(-0.24, -0.2, 0.24, 0.2, 26, 40, PX.white);
  s.box(-0.14, -0.12, 0.14, 0.12, 40, 52, PX.cream);
  s.spire(0, 0, 0.1, 52, top - 4, PX.gold, true);
  return s.toSprite();
}

registerLandmark('vdnkh', (w, h) => buildVdnkh(w, h));
