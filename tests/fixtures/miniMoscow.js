/**
 * Synthetic 40x40 Moscow-shaped map (same shape as the baked MOSCOW object) for tests.
 * River along y=20 (with a bridge at x=10), ring road, radial avenues, two metro lines, 3 districts.
 */
import { encodeRLE } from '../../js/config/maps/rle.js';

const W = 40, H = 40;

/** Build the fixture object. */
export function miniMoscow() {
  const terrain = [], road = [], roadClass = [], rail = [], density = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const river = y === 20;
    terrain.push(river ? 'w' : 'g');
    // ring road on the border of x,y in 4..35
    let r = 0;
    const ring = (x === 4 || x === 35) && y >= 4 && y <= 35 || (y === 4 || y === 35) && x >= 4 && x <= 35;
    if (ring) {
      if (y === 4 || y === 35) r |= (x > 4 ? 8 : 0) | (x < 35 ? 2 : 0);
      if (x === 4 || x === 35) r |= (y > 4 ? 1 : 0) | (y < 35 ? 4 : 0);
      if (x === 4 && y === 4) r = 2 | 4;
      if (x === 35 && y === 4) r = 8 | 4;
      if (x === 4 && y === 35) r = 2 | 1;
      if (x === 35 && y === 35) r = 8 | 1;
    }
    // radial avenue x=20 (north-south) and y=12 (east-west)
    if (x === 20) r |= (y > 0 ? 1 : 0) | (y < H - 1 ? 4 : 0);
    if (y === 12) r |= (x > 0 ? 8 : 0) | (x < W - 1 ? 2 : 0);
    road.push(r.toString(16));
    roadClass.push(r ? 'p' : '.');
    rail.push('0');
    density.push(y < 4 || y > 35 || x < 4 || x > 35 ? '1' : (Math.abs(x - 20) < 8 && Math.abs(y - 20) < 8 ? '4' : '2'));
  }
  // water tiles get no road except the bridge at x=10 (N-S link across the river)
  for (let x = 0; x < W; x++) if (x !== 10) road[20 * W + x] = '0';
  road[20 * W + 10] = '5'; road[19 * W + 10] = (parseInt(road[19 * W + 10], 16) | 4).toString(16); road[21 * W + 10] = (parseInt(road[21 * W + 10], 16) | 1).toString(16);
  // symmetric fix-up for the bridge neighbour row
  for (let y = 0; y < H; y++) density[y * W + 0] = '0';
  const st = (x, y) => ({ name: `St${x}-${y}`, nameEn: `St${x}-${y}`, x, y });
  const metroLines = [
    { ref: '1', name: 'Линия 1', nameEn: 'Line 1', color: '#e4002b', ring: false, stations: [st(6, 12), st(12, 12), st(20, 12), st(28, 12), st(33, 12)] },
    { ref: '5', name: 'Кольцевая', nameEn: 'Ring', color: '#a0522d', ring: true, stations: [st(6, 6), st(33, 6), st(33, 33), st(6, 33)] },
  ];
  return {
    name: 'MiniMoscow', attribution: 'test', fetched: '2000-01-01', width: W, height: H, tileMeters: 200,
    bbox: { s: 0, w: 0, n: 0, e: 0 },
    terrain: encodeRLE(terrain.join('')), road: encodeRLE(road.join('')), roadClass: encodeRLE(roadClass.join('')),
    rail: encodeRLE(rail.join('')), density: encodeRLE(density.join('')),
    metroLines,
    railStations: [],
    districts: [{ name: 'Центр', nameEn: 'Centre', x: 20, y: 20 }, { name: 'Север', nameEn: 'North', x: 20, y: 6 }, { name: 'Юг', nameEn: 'South', x: 20, y: 33 }],
    landmarks: [{ id: 'kremlin', name: 'Kremlin', x: 20, y: 18 }],
  };
}
