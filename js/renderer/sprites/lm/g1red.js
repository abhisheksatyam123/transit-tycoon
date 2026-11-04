/** R5e: Red Square (1x2) with St Basil's Cathedral at the south (+v) end and Lenin's Mausoleum by the Kremlin wall (-u). */
import { registerLandmark } from './registry.js';
import { build, C, stripeDome } from './g1lib.js';
import { PX } from '../pixelArt.js';

const BX = 0, BY = 0.62; // St Basil's centre

/** St Basil's: red brick base, drums, eight striped onion domes and a central tent spire (~66 px). */
function stBasil(s) {
  s.box(BX - 0.3, BY - 0.3, BX + 0.3, BY + 0.3, 0, 10, C.kBrick, { top: C.kBrickLt });
  s.cylinder(BX, BY, 0.14, 10, 30, C.kWhite);
  // ring of eight drums + domes
  const ring = [[0.2, 0, C.kRed, C.kWhite], [-0.2, 0, C.kGreen, C.kYellow], [0, 0.2, C.kBlue, C.kWhite], [0, -0.2, C.kYellow, C.kGreen],
    [0.14, 0.14, C.kGreen, C.kRed], [-0.14, 0.14, C.kRed, C.kWhite], [0.14, -0.14, C.kBlue, C.kWhite], [-0.14, -0.14, C.kYellow, C.kRed]];
  const items = ring.map(([du, dv, base, str]) => ({
    k: BX + du + BY + dv,
    f: () => {
      s.cylinder(BX + du, BY + dv, 0.07, 10, 22, C.kWhite);
      stripeDome(s, BX + du, BY + dv, 0.08, 22, 22, base, str);
    },
  }));
  items.push({ k: BX + BY, f: () => {
    s.cylinder(BX, BY, 0.09, 30, 38, C.kRed);
    stripeDome(s, BX, BY, 0.11, 38, 18, C.kGold, C.kRed);
    s.spire(BX, BY, 0.06, 56, 66, C.kGreen, true);
  } });
  items.sort((a, b) => a.k - b.k);
  for (const it of items) it.f();
}

/** Lenin's Mausoleum: low stepped dark red granite pyramid (~10 px). */
function mausoleum(s, u, v) {
  s.box(u - 0.16, v - 0.12, u + 0.16, v + 0.12, 0, 4, C.kGraniteDk);
  s.box(u - 0.12, v - 0.09, u + 0.12, v + 0.09, 4, 7, C.kGraniteRed, { top: C.kGraniteDk });
  s.box(u - 0.07, v - 0.05, u + 0.07, v + 0.05, 7, 10, C.kGraniteRed, { top: C.kGraniteDk });
}

/** Red Square footprint u in [-0.5,0.5], v in [-1,1]; Kremlin wall at u<0 side. */
function draw(s) {
  s.poly3([[-0.5, -1, 0], [0.5, -1, 0], [0.5, 1, 0], [-0.5, 1, 0]], C.kPaving, 1.0, false);
  for (let v = -0.9; v < 1; v += 0.2) s.line(s.P(-0.5, v, 0), s.P(0.5, v, 0), '#7a5f55', 0.5);
  mausoleum(s, -0.28, -0.1);
  stBasil(s);
}

registerLandmark('red_square', () => build(1, 2, 80, draw));
