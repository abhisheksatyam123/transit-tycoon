/**
 * Aircraft helpers: straight-line (Bresenham) flight paths, altitude ramp and the
 * airport footprint layout. Aircraft ignore track/road connectivity entirely.
 */

/**
 * Straight tile line from (ax,ay) to (bx,by) inclusive (Bresenham, 8-connected).
 * Consecutive tiles may differ diagonally; the renderer shows the heading.
 * @returns {{x:number,y:number}[]}
 */
export function airLine(ax, ay, bx, by) {
  const out = [{ x: ax, y: ay }];
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 100000 && !(x === bx && y === by); guard++) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    out.push({ x, y });
  }
  return out;
}

/** Fraction of the path used for the takeoff and landing ramps. */
export const RAMP_FRACTION = 0.15;

/**
 * Altitude (0 ground .. 1 cruise) of an aircraft at its current path position.
 * Ramps up over the first RAMP_FRACTION of the path and down over the last one.
 * @param {{path:object[],pathIndex:number,progress:number}} v
 * @returns {number}
 */
export function altitudeAt(v) {
  const n = v.path.length - 1;
  if (n <= 0) return 0;
  const f = (v.pathIndex + v.progress) / n;
  if (f <= 0 || f >= 1) return 0;
  const up = f / RAMP_FRACTION, down = (1 - f) / RAMP_FRACTION;
  return Math.max(0, Math.min(1, up, down));
}

/**
 * Airport footprint layout (AIRPORT_W x AIRPORT_H, origin top-left).
 * Row 0: hangar, apron, apron, apron, terminal, control tower.
 * Row 1: apron x4, terminal x2 (cols 4-5).
 * Row 2: runway (all 6 tiles); the runway centre is (dx 2, dy 2).
 * Row 3: apron x6.
 * @returns {{dx:number,dy:number,part:string}[]}
 */
export function airportLayout() {
  const L = [];
  const cells = {
    '0,0': 'hangar', '0,4': 'terminal', '0,5': 'tower',
    '1,4': 'terminal', '1,5': 'terminal',
  };
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 6; dx++) {
      const key = `${dy},${dx}`;
      let part = cells[key];
      if (!part) part = dy === 2 ? 'runway' : 'apron';
      L.push({ dx, dy, part });
    }
  }
  return L;
}

/** True when a tile is the runway centre of an airport (goal tile for aircraft). */
export function isRunwayCentre(b) {
  return !!b && b.type === 'station' && b.kind === 'airport' && b.part === 'runway' && b.dx === 2 && b.dy === 2;
}
