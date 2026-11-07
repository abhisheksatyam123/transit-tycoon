/**
 * Procedural industry sprites. Each industry tile draws one "piece" chosen from a per-type
 * layout by its local offset inside the footprint, so multi-tile industries depth-sort per tile.
 */
import { makeSprite, texRng, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { shade } from '../palette.js';
import { box, gableRoof, quad, poly, cylinder, tree, windows, P } from './shapes.js';

const cache = new SpriteCache();
const TALL = 120;

/**
 * Normalise an industry type id/name to an internal style key.
 * @param {string} typeId
 * @returns {string}
 */
export function industryStyle(typeId) {
  const s = String(typeId || '').toLowerCase();
  // TY2 toyland set (procedural stand-ins; checked first: 'cotton_candy_forest' also contains 'forest')
  if (s.includes('candy')) return 'candy';
  if (s.includes('sweet')) return 'sweet';
  if (s.includes('toffee')) return 'toffee';
  if (s.includes('sugar')) return 'sugarmine';
  if (s.includes('plastic')) return 'plastic';
  if (s.includes('cola')) return 'cola';
  if (s.includes('fizzy')) return 'fizzy';
  if (s.includes('bubble')) return 'bubble';
  if (s.includes('battery')) return 'battery';
  if (s.includes('toy_shop')) return 'toyshop';
  if (s.includes('toy')) return 'toyfactory';
  if (s.includes('coal')) return 'coal';
  if (s.includes('power')) return 'power';
  if (s.includes('saw')) return 'sawmill';
  if (s.includes('forest') || s.includes('wood')) return 'forest';
  if (s.includes('refin')) return 'refinery';
  if (s.includes('oil')) return 'oil';
  if (s.includes('farm')) return 'farm';
  if (s.includes('iron') || s.includes('ore')) return 'iron';
  if (s.includes('steel')) return 'steel';
  if (s.includes('factory')) return 'factory';
  if (s.includes('bank')) return 'bank';
  // T-IN extra chain industries (extraIndustries)
  if (s.includes('quarry')) return 'quarry';
  if (s.includes('paper')) return 'paper';
  if (s.includes('printing')) return 'printing';
  if (s.includes('building')) return 'building';
  if (s.includes('food')) return 'food';
  return 'factory';
}

/** Piece layouts per style (indexed by local tile index, wrapping). */
const LAYOUT = {
  coal: ['headframe', 'heap', 'shed', 'heap'],
  power: ['chimney', 'hall', 'cooling', 'coalyard'],
  forest: ['trees', 'trees', 'logs', 'trees'],
  sawmill: ['sawhall', 'logs', 'planks', 'shed'],
  oil: ['pump', 'pump', 'tank', 'pump'],
  refinery: ['column', 'tanks', 'tanks', 'flare'],
  farm: ['barn', 'field', 'field', 'silo', 'field', 'field'],
  factory: ['factory', 'chimney', 'factory', 'yard'],
  iron: ['headframe', 'oreheap', 'shed', 'oreheap'],
  steel: ['blast', 'hall', 'chimney', 'oreyard'],
  bank: ['hall', 'hall'],
  quarry: ['pit', 'heap', 'pit', 'oreyard'],
  paper: ['chimney', 'hall', 'logs', 'chimney'],
  printing: ['shed', 'hall', 'shed', 'planks'],
  building: ['kiln', 'heap', 'kiln', 'shed'],
  food: ['silo', 'barn', 'silo', 'hall'],
  // TY2 toyland stand-ins built from the pieces above
  candy: ['trees', 'trees', 'logs', 'trees'],
  sweet: ['factory', 'chimney', 'factory', 'yard'],
  toffee: ['pit', 'heap', 'pit', 'oreyard'],
  sugarmine: ['headframe', 'oreheap', 'shed', 'oreheap'],
  plastic: ['tank', 'tanks', 'tank', 'pump'],
  cola: ['tank', 'pump', 'tank', 'pump'],
  fizzy: ['factory', 'tank', 'chimney', 'yard'],
  bubble: ['tank', 'hall', 'tank', 'shed'],
  battery: ['shed', 'hall', 'shed', 'silo'],
  toyfactory: ['factory', 'chimney', 'hall', 'yard'],
  toyshop: ['hall', 'hall'],
};

/** Ground tint per style. */
const GROUND = {
  coal: '#5d5a52', power: '#8c8c86', forest: '#4a7a2e', sawmill: '#8a7a5a', oil: '#a39b7a',
  refinery: '#8c8c86', farm: '#7aa04a', factory: '#8e8e88', iron: '#7a6458', steel: '#7d7a76', bank: '#9a9a92',
  quarry: '#8a8478', paper: '#b8b2a4', printing: '#8b7aa8', building: '#9c968a', food: '#c9a24a',
  candy: '#f9a8d4', sweet: '#f472b6', toffee: '#92400e', sugarmine: '#e7e5e4', plastic: '#7dd3fc', cola: '#451a03',
  fizzy: '#34d399', bubble: '#bae6fd', battery: '#84cc16', toyfactory: '#c026d3', toyshop: '#f0abfc',
};

/** Pieces that emit smoke: offsets (u,v,z) relative to tile centre. */
export const SMOKE = {
  chimney: [0.05, 0.05, 66], cooling: [0, 0, 44], blast: [0.05, -0.05, 56], flare: [0.05, 0.05, 50],
  sawhall: [0.2, -0.2, 34],
};

/** @type {Record<string,(ctx:CanvasRenderingContext2D, r:()=>number, style:string)=>void>} */
const PIECES = {
  headframe(ctx, r, style) {
    box(ctx, -0.35, 0.05, 0.05, 0.4, 0, 12, style === 'iron' ? '#8a5a40' : '#6b5a48');
    const legs = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
    ctx.strokeStyle = '#3b3b3b';
    ctx.lineWidth = 1.6;
    for (const [u, v] of legs) {
      const [x0, y0] = P(u, v, 0), [x1, y1] = P(u * 0.3, v * 0.3, 46);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.lineWidth = 0.8;
    for (let z = 12; z < 44; z += 10) {
      const k = 1 - z / 60;
      const a = P(-0.2 * k, 0.2 * k, z), b = P(0.2 * k, 0.2 * k, z), c = P(0.2 * k, -0.2 * k, z);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    }
    const [wx, wy] = P(0, 0, 48);
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI * 2); ctx.stroke();
  },
  heap(ctx, r) { heapOf(ctx, r, '#1f1f1f', '#3a3a3a'); },
  oreheap(ctx, r) { heapOf(ctx, r, '#7a3b26', '#a3553a'); },
  shed(ctx, r, style) {
    box(ctx, -0.36, -0.3, 0.3, 0.3, 0, 14, style === 'sawmill' ? '#9a7b52' : '#7b7466');
    windows(ctx, 'v', -0.3, 0.26, 0.3, 5, 3, 'rgba(20,30,40,0.8)', 4);
    gableRoof(ctx, -0.4, -0.34, 0.34, 0.34, 14, 8, 'u', '#5b6470');
  },
  chimney(ctx) {
    box(ctx, -0.35, -0.35, 0.2, 0.2, 0, 14, '#8b6d5a');
    cylinder(ctx, 0.05, 0.05, 0.12, 6, 64, '#a0522d', 0.08);
    const [x, y] = P(0.05, 0.05, 50);
    ctx.fillStyle = '#f1f1f1';
    ctx.fillRect(x - 3.4, y, 6.8, 2);
  },
  hall(ctx, r, style) {
    const c = style === 'steel' ? '#6a6f78' : '#9b8c7a';
    box(ctx, -0.4, -0.38, 0.38, 0.38, 0, 24, c);
    windows(ctx, 'v', -0.36, 0.34, 0.38, 8, 4, 'rgba(250,220,140,0.6)', 8);
    windows(ctx, 'u', -0.34, 0.34, 0.38, 8, 3, 'rgba(30,40,60,0.8)', 8);
    for (let i = 0; i < 3; i++) gableRoof(ctx, -0.4 + i * 0.26, -0.38, -0.14 + i * 0.26, 0.38, 24, 6, 'v', '#56606a');
  },
  cooling(ctx) {
    cylinder(ctx, 0, 0, 0.42, 0, 22, '#c8c4bc', 0.3);
    cylinder(ctx, 0, 0, 0.3, 22, 40, '#c8c4bc', 0.34);
  },
  coalyard(ctx, r) {
    quad(ctx, -0.45, -0.45, 0.45, 0.45, 0.2, '#4a4844');
    heapOf(ctx, r, '#1f1f1f', '#3a3a3a', 0.7);
  },
  trees(ctx, r) {
    const pts = [];
    for (let i = 0; i < 7; i++) pts.push([(r() - 0.5) * 0.8, (r() - 0.5) * 0.8]);
    pts.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [u, v] of pts) tree(ctx, u, v, 0.9 + r() * 0.4, '#2f6b2a', true);
  },
  logs(ctx) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3 - i; j++) {
        const [x, y] = P(-0.2 + j * 0.16 + i * 0.08, 0.1, 3 + i * 5);
        ctx.fillStyle = '#7a4f2a';
        ctx.fillRect(x - 18, y - 2.5, 26, 5);
        ctx.fillStyle = '#d9b382';
        ctx.beginPath(); ctx.ellipse(x + 8, y, 2.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7a4f2a'; ctx.lineWidth = 0.5; ctx.stroke();
      }
    }
  },
  sawhall(ctx) {
    box(ctx, -0.4, -0.32, 0.36, 0.32, 0, 18, '#a0794c');
    windows(ctx, 'v', -0.34, 0.3, 0.32, 6, 3, 'rgba(30,20,10,0.8)', 6);
    gableRoof(ctx, -0.44, -0.36, 0.4, 0.36, 18, 10, 'u', '#6e3b2a');
    cylinder(ctx, 0.2, -0.2, 0.06, 20, 32, '#555', 0.05);
  },
  planks(ctx) {
    for (let k = 0; k < 2; k++) box(ctx, -0.3 + k * 0.35, -0.2, -0.05 + k * 0.35, 0.25, 0, 8 + k * 3, '#d4a86a');
  },
  pump(ctx, r) {
    quad(ctx, -0.18, -0.18, 0.18, 0.18, 0.5, '#5c5a52');
    const [x, y] = P(0, 0, 0);
    const tilt = (r() - 0.5) * 0.4;
    ctx.strokeStyle = '#2d2d2d';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x, y - 18); ctx.lineTo(x + 6, y); ctx.stroke();
    ctx.save();
    ctx.translate(x, y - 18);
    ctx.rotate(tilt);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(-14, -2, 24, 4);
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(-18, 0); ctx.lineTo(-14, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x - 16, y - 16); ctx.lineTo(x - 16, y - 2); ctx.stroke();
  },
  tank(ctx) {
    cylinder(ctx, -0.1, 0, 0.3, 0, 14, '#d6d3cc');
    cylinder(ctx, 0.25, 0.25, 0.14, 0, 10, '#c9c5bd');
  },
  tanks(ctx) {
    cylinder(ctx, -0.18, -0.18, 0.2, 0, 14, '#e5e2da');
    cylinder(ctx, 0.2, -0.15, 0.17, 0, 12, '#d9d5cc');
    cylinder(ctx, -0.12, 0.22, 0.17, 0, 12, '#d9d5cc');
    cylinder(ctx, 0.22, 0.24, 0.15, 0, 16, '#ccc8bf');
  },
  column(ctx) {
    box(ctx, -0.4, -0.4, 0.4, 0.4, 0, 3, '#7c7c76');
    cylinder(ctx, -0.15, -0.1, 0.11, 0, 50, '#b8bcc2', 0.09);
    cylinder(ctx, 0.18, 0.08, 0.09, 0, 40, '#a8adb4', 0.07);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 0.7;
    for (let z = 8; z < 48; z += 8) {
      const [x, y] = P(-0.15, -0.1, z);
      ctx.beginPath(); ctx.ellipse(x, y, 5, 2.5, 0, 0, Math.PI); ctx.stroke();
    }
  },
  flare(ctx) {
    box(ctx, -0.3, -0.3, 0.1, 0.1, 0, 10, '#7a7f86');
    const [x, y] = P(0.05, 0.05, 0);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 46); ctx.stroke();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.ellipse(x, y - 50, 2.6, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.beginPath(); ctx.ellipse(x, y - 49, 1.2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  },
  field(ctx, r) {
    const crop = r() < 0.5;
    quad(ctx, -0.48, -0.48, 0.48, 0.48, 0.2, crop ? '#c9a94a' : '#6b4a2a');
    ctx.strokeStyle = crop ? '#a8873a' : '#4f3820';
    ctx.lineWidth = 0.8;
    for (let i = -0.4; i <= 0.41; i += 0.1) {
      const a = P(i, -0.46, 0.3), b = P(i, 0.46, 0.3);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    if (!crop) {
      ctx.fillStyle = '#4f8a2f';
      for (let i = 0; i < 20; i++) {
        const [x, y] = P((r() - 0.5) * 0.9, (r() - 0.5) * 0.9, 0.5);
        ctx.fillRect(x, y - 1, 1.2, 1.2);
      }
    }
  },
  barn(ctx) {
    box(ctx, -0.32, -0.26, 0.28, 0.26, 0, 14, '#a93226');
    poly(ctx, [-0.05, 0.26, 0, 0.12, 0.26, 0, 0.12, 0.26, 9, -0.05, 0.26, 9], '#f5f5f5');
    gableRoof(ctx, -0.36, -0.3, 0.32, 0.3, 14, 9, 'u', '#4b4b4b');
  },
  silo(ctx) {
    quad(ctx, -0.45, -0.45, 0.45, 0.45, 0.2, '#7aa04a');
    cylinder(ctx, -0.1, -0.05, 0.14, 0, 34, '#c7ccd1');
    cylinder(ctx, 0.2, 0.18, 0.12, 0, 28, '#b8bec4');
    // cows
    for (let i = 0; i < 3; i++) {
      const [x, y] = P(-0.3 + i * 0.12, 0.32, 0);
      ctx.fillStyle = '#fafafa'; ctx.fillRect(x - 2, y - 3, 4, 2.2);
      ctx.fillStyle = '#222'; ctx.fillRect(x - 1, y - 3, 1.4, 1.2);
    }
  },
  factory(ctx, r) {
    box(ctx, -0.4, -0.36, 0.38, 0.36, 0, 22, '#8d6e63');
    windows(ctx, 'v', -0.36, 0.34, 0.36, 7, 4, 'rgba(250,220,140,0.55)', 7);
    windows(ctx, 'u', -0.32, 0.32, 0.38, 7, 3, 'rgba(30,40,60,0.8)', 7);
    for (let i = 0; i < 3; i++) {
      const u0 = -0.4 + i * 0.26;
      poly(ctx, [u0, -0.36, 22, u0, 0.36, 22, u0 + 0.26, 0.36, 30, u0 + 0.26, -0.36, 30], '#6b7280', 'rgba(0,0,0,.3)');
      poly(ctx, [u0 + 0.26, -0.36, 22, u0 + 0.26, 0.36, 22, u0 + 0.26, 0.36, 30, u0 + 0.26, -0.36, 30], '#9ca3af');
    }
  },
  yard(ctx) {
    quad(ctx, -0.45, -0.45, 0.45, 0.45, 0.2, '#6f6f6a');
    const cols = ['#b45309', '#1d4ed8', '#15803d', '#b91c1c'];
    for (let i = 0; i < 4; i++) box(ctx, -0.35 + (i % 2) * 0.38, -0.3 + Math.floor(i / 2) * 0.35, -0.08 + (i % 2) * 0.38, -0.1 + Math.floor(i / 2) * 0.35, 0, 8, cols[i]);
  },
  blast(ctx) {
    box(ctx, -0.4, -0.4, 0.4, 0.4, 0, 6, '#5a5a5a');
    cylinder(ctx, -0.05, 0.05, 0.24, 6, 40, '#5f4b45', 0.18);
    cylinder(ctx, 0.05, -0.05, 0.06, 40, 54, '#3f3f3f');
    ctx.fillStyle = 'rgba(255,140,40,0.9)';
    const [x, y] = P(-0.05, 0.29, 10);
    ctx.fillRect(x - 3, y - 4, 6, 4);
  },
  pit(ctx) {
    quad(ctx, -0.45, -0.45, 0.45, 0.45, 0.2, '#a8a29e');
    quad(ctx, -0.3, -0.3, 0.3, 0.3, 0.1, '#57534e');
  },
  kiln(ctx) {
    cylinder(ctx, 0, 0, 0.24, 0, 30, '#c2410c', 0.2);
    cylinder(ctx, 0.2, -0.2, 0.12, 0, 16, '#9a3412', 0.1);
  },
  oreyard(ctx, r) {
    quad(ctx, -0.45, -0.45, 0.45, 0.45, 0.2, '#5d4a42');
    heapOf(ctx, r, '#7a3b26', '#a3553a', 0.7);
  },
};

/**
 * Pile of bulk material.
 * @param {CanvasRenderingContext2D} ctx
 * @param {()=>number} r
 * @param {string} dark
 * @param {string} light
 * @param {number} [s] scale
 */
function heapOf(ctx, r, dark, light, s = 1) {
  for (let i = 0; i < 3; i++) {
    const [x, y] = P((r() - 0.5) * 0.4, (r() - 0.5) * 0.4, 0);
    const w = (10 + r() * 8) * s, h = (8 + r() * 6) * s;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x, y - h * 2, x + w, y);
    ctx.closePath();
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, light); g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fill();
  }
}

/**
 * Piece name for a tile at local offset (dx,dy) in a w-wide footprint.
 * @param {string} style
 * @param {number} dx
 * @param {number} dy
 * @param {number} w
 * @returns {string}
 */
export function industryPiece(style, dx, dy, w) {
  const layout = LAYOUT[style] || LAYOUT.factory;
  const i = dy * Math.max(1, w) + dx;
  return layout[((i % layout.length) + layout.length) % layout.length];
}

/** T29 farm field tile: ploughed furrows on a green ground (procedural; OpenGFX has no field tile in our pack). */
export function fieldSprite(variant) {
  return cache.get(`field:${variant % 3}`, () => makeSprite(TILE_W, TILE_H, HALF_W, HALF_H, (ctx) => {
    quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, '#8d9a3c');
    const cols = ['#c9a227', '#a8861f'];
    for (let i = 0; i < 5; i++) {
      const u = -0.4 + i * 0.2 + (variant % 3) * 0.03;
      poly(ctx, [u, -0.45, 0, u + 0.08, -0.45, 0, u + 0.08, 0.45, 0, u, 0.45, 0], cols[i & 1], null);
    }
  }));
}

/**
 * Industry tile sprite.
 * @param {string} style from {@link industryStyle}
 * @param {string} piece from {@link industryPiece}
 * @param {number} variant
 * @returns {import('./canvas.js').Sprite}
 */
export function industrySprite(style, piece, variant) {
  return cache.get(`i:${style}:${piece}:${variant % 4}`, () => makeSprite(TILE_W, TILE_H + TALL, HALF_W, HALF_H + TALL, (ctx) => {
    const r = texRng(variant * 13 + piece.length * 101 + style.length);
    quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, GROUND[style] || '#8a8a84');
    if (style !== 'forest' && style !== 'farm') quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, null, null);
    (PIECES[piece] || PIECES.shed)(ctx, r, style);
  }));
}

/**
 * Colour of an industry style used on minimap/legend fallbacks.
 * @param {string} style
 * @returns {string}
 */
export function industryColor(style) {
  return shade(GROUND[style] || '#8a8a84', 1.3);
}
