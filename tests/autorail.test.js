import { test, expect, describe } from 'bun:test';
import { isDiagonalDrag, autorailRoute, choosePiece } from '../js/ui/tools/autorail.js';
import { pathOk } from '../js/simulation/shapes.js';

describe('autorail piece chooser', () => {
  test('diagonal detection needs |dx| === |dy| and a non-zero delta', () => {
    expect(isDiagonalDrag(0, 0, 3, 3)).toBe(true);
    expect(isDiagonalDrag(5, 5, 2, 8)).toBe(true);
    expect(isDiagonalDrag(0, 0, 3, 0)).toBe(false);
    expect(isDiagonalDrag(0, 0, 3, 2)).toBe(false);
    expect(isDiagonalDrag(4, 4, 4, 4)).toBe(false);
  });

  test('diagonal drag yields a valid 4-connected staircase; other drags yield null', () => {
    const r = autorailRoute(0, 0, 3, 3);
    expect(r.loop).toBe(false);
    expect(pathOk(r.path)).toBe(true);
    expect(r.path[0]).toEqual({ x: 0, y: 0 });
    expect(r.path[r.path.length - 1]).toEqual({ x: 3, y: 3 });
    expect(autorailRoute(0, 0, 4, 1)).toBeNull();
    expect(autorailRoute(2, 2, 2, 2)).toBeNull();
  });

  test('single-tile click picks the piece whose line the cursor is nearest to', () => {
    // X piece lies on v=0.5, Y piece on u=0.5: a cursor near the Y line picks Y.
    expect(choosePiece(0.5, 0.05)).toBe('y');
    expect(choosePiece(0.5, 0.95)).toBe('y');
    expect(choosePiece(0.05, 0.5)).toBe('x');
    expect(choosePiece(0.95, 0.5)).toBe('x');
    expect(choosePiece(0.5, 0.5)).toBe('x'); // centre tie goes to X
    expect(choosePiece(0.2, 0.3)).toBe('x'); // |u-0.5|=0.3 >= |v-0.5|=0.2
    expect(choosePiece(0.3, 0.2)).toBe('y');
  });
});
