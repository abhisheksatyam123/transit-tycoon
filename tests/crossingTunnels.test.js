import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { setCheatFlag, crossingTunnelsAllowed, isCheated } from '../js/simulation/cheats.js';

const N=1,E=2,S=4,W=8;

/** Two crossing hills: horizontal row y=24 x30-36, vertical col x=33 y20-28, both raised. */
function setup() {
  const g = flatGame();
  for (let x=30;x<=36;x++) g.tile(x,24).height=4;
  for (let y=20;y<=28;y++) g.tile(33,y).height=4;
  g.tile(30,24).height=1; g.tile(36,24).height=1;
  g.tile(33,20).height=1; g.tile(33,28).height=1;
  return g;
}

describe('crossing tunnels cheat (OpenTTD crossing_tunnels)', () => {
  test('without cheat, crossing tunnel fails', () => {
    const g = setup();
    expect(g.buildTunnel(30,24,36,24).ok).toBe(true);
    const r = g.buildTunnel(33,20,33,28);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/blocked|tunnel/i);
    expect(crossingTunnelsAllowed(g.state)).toBe(false);
  });
  test('with cheat, crossing tunnel succeeds, marks cheated, both tracks present', () => {
    const g = setup();
    expect(g.buildTunnel(30,24,36,24).ok).toBe(true);
    setCheatFlag(g.state, 'crossingTunnels', true);
    expect(crossingTunnelsAllowed(g.state)).toBe(true);
    expect(isCheated(g.state)).toBe(true);
    const r = g.buildTunnel(33,20,33,28);
    expect(r.ok).toBe(true);
    const cross = g.tile(33,24);
    expect(cross.tunnel).toBe(1);
    expect(cross.playerTunnel).toBe(1);
    // both axes on crossing tile: horizontal E|W and vertical N|S
    expect(cross.rail & (E|W)).toBe(E|W);
    expect(cross.rail & (N|S)).toBe(N|S);
    expect(g.tile(33,22).rail & (N|S)).toBe(N|S);
    expect(g.tile(33,22).tunnel).toBe(1);
  });
});
