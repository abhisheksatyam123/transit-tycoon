/** Depot rename (renameDepot): lazy name, reset to "Depot at x,y", rival refused, save/load, labels. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { depotDisplayName, depotDefaultName } from '../js/simulation/cmdRename.js';
import { depotRows } from '../js/ui/windows/depotList.js';

function setup() {
  const g = flatGame(23);
  const L = coalLine(g);
  const d = g.state.depots.find((x) => x.id === L.depotId);
  return { g, L, d };
}

describe('renameDepot', () => {
  test('rename sets lazy name; label uses it', () => {
    const { g, d } = setup();
    expect(d.name).toBeUndefined();
    expect(depotDisplayName(d)).toBe(depotDefaultName(d));
    const r = g.renameDepot(d.id, '  North Shed ');
    expect(r.ok).toBe(true);
    expect(d.name).toBe('North Shed');
    expect(depotDisplayName(d)).toBe('North Shed');
    expect(depotRows(g.state).find((x) => x.id === d.id).name).toBe('North Shed');
  });

  test('blank name resets to default by deleting the field', () => {
    const { g, d } = setup();
    expect(g.renameDepot(d.id, 'Shed').ok).toBe(true);
    const r = g.renameDepot(d.id, '   ');
    expect(r.ok).toBe(true);
    expect('name' in d).toBe(false);
    expect(depotDisplayName(d)).toBe(`Depot at ${d.x},${d.y}`);
  });

  test('unknown depot, too long, control chars and duplicates are refused', () => {
    const { g, d } = setup();
    expect(g.renameDepot(999999, 'X').ok).toBe(false);
    expect(g.renameDepot(d.id, 'x'.repeat(33)).ok).toBe(false);
    expect(g.renameDepot(d.id, 'bad\u0007name').ok).toBe(false);
    const other = g.state.depots.find((x) => x.id !== d.id);
    if (other) {
      expect(g.renameDepot(other.id, 'Dup').ok).toBe(true);
      const dup = g.renameDepot(d.id, 'dup');
      expect(dup.ok).toBe(false);
      expect(dup.error).toMatch(/already exists/);
      expect(d.name).toBeUndefined();
    }
  });

  test('keeping its own name (case change) is allowed; dryRun stores nothing', () => {
    const { g, d } = setup();
    g.renameDepot(d.id, 'Yard');
    expect(g.renameDepot(d.id, 'yard').ok).toBe(true);
    expect(g.renameDepot(d.id, 'Other', { dryRun: true }).ok).toBe(true);
    expect(d.name).toBe('yard');
  });

  test('rival-owned depot is refused for the player', () => {
    const { g, d } = setup();
    d.ownerId = 7;
    const r = g.renameDepot(d.id, 'Stolen');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/rival/i);
    expect(d.name).toBeUndefined();
  });

  test('name survives save/load and the reset state stays default', () => {
    const { g, d } = setup();
    g.renameDepot(d.id, 'Harbour Depot');
    const s2 = parseState(serializeState(g.state));
    const d2 = s2.depots.find((x) => x.id === d.id);
    expect(d2.name).toBe('Harbour Depot');
    expect(depotDisplayName(d2)).toBe('Harbour Depot');
    g.renameDepot(d.id, '');
    const s3 = parseState(serializeState(g.state));
    const d3 = s3.depots.find((x) => x.id === d.id);
    expect(d3.name).toBeUndefined();
  });
});
