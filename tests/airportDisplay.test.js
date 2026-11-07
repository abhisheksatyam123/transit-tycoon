/** Display-only sub-tile offsets of grounded planes (airportDisplay.js). */
import { describe, expect, test } from 'bun:test';
import { groundOffset, OFFSET_MAX, roleNodeIndex } from '../js/simulation/airportDisplay.js';
import { OTTD_AIRPORT_NODES } from '../js/simulation/airportPositions.js';

const TYPES = ['small', 'commuter', 'city', 'metropolitan', 'international'];

describe('airport display offsets', () => {
  test('every mapped type has a role node for terminal, hangar and runway', () => {
    for (const t of TYPES) {
      for (const part of ['terminal', 'hangar', 'runway']) {
        const i = roleNodeIndex(t, part);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(OTTD_AIRPORT_NODES[t].nodes[i]).toBeDefined();
      }
    }
  });

  test('offsets stay within the tile for every part', () => {
    for (const t of TYPES) for (const part of ['terminal', 'hangar', 'runway', 'apron']) {
      const o = groundOffset(t, part);
      expect(Math.abs(o.dx)).toBeLessThanOrEqual(OFFSET_MAX + 1e-9);
      expect(Math.abs(o.dy)).toBeLessThanOrEqual(OFFSET_MAX + 1e-9);
    }
  });

  test('terminal, tower and hangar planes get a zero offset (base drawing)', () => {
    for (const t of TYPES) for (const part of ['terminal', 'tower', 'hangar']) {
      expect(groundOffset(t, part)).toEqual({ dx: 0, dy: 0 });
    }
  });

  test('apron offset still comes from the OTTD node, within OFFSET_MAX', () => {
    const o = groundOffset('small', 'apron');
    expect(o).not.toBeNull();
    expect(Math.abs(o.dx)).toBeLessThanOrEqual(OFFSET_MAX + 1e-9);
    expect(Math.abs(o.dy)).toBeLessThanOrEqual(OFFSET_MAX + 1e-9);
  });

  test('unknown type gives no offset', () => {
    expect(groundOffset('heliport', 'apron')).toBeNull();
  });
});
