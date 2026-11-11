/** Round AC UI2: read-only company infrastructure window (G7) and screenshot zoom menu entries (G9). */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { countInfrastructure, infrastructureMaintenance } from '../js/simulation/infrastructure.js';
import { getSetting, setSetting } from '../js/simulation/settings.js';
import { infrastructureSummary, infrastructureRows } from '../js/ui/windows/companyInfrastructure.js';
import { SHOT_ITEMS, TOOL_GROUPS } from '../js/ui/toolbar.js';
import { SHOT_ZOOMS, zoomShotName } from '../js/ui/screenshot.js';
import { FIXED_SHORTCUTS } from '../js/input/fixedShortcuts.js';
import { HOTKEY_ACTIONS, defaultKeys } from '../js/ui/hotkeys.js';

/** Small game with a working coal line (station, depot, rail pieces). */
function infraGame() {
  const game = flatGame();
  coalLine(game);
  return game;
}
const row = (rows, id) => rows.find((r) => r.id === id);

describe('company infrastructure window (G7)', () => {
  test('rows render the owned piece counts and they match countInfrastructure', () => {
    const game = infraGame();
    const c = countInfrastructure(game.state);
    const rows = infrastructureRows(game.state);
    expect(c.rail).toBeGreaterThan(0); // the coal line laid track
    for (const [id, n] of [['rail', c.rail], ['road', c.road], ['signals', c.signals],
      ['stations', c.stations], ['air', c.airports]]) {
      expect(row(rows, id).value).toBe(n);
      expect(row(rows, id).text).toBe(`${row(rows, id).label}: ${n}`);
    }
    expect(row(rows, 'sea').value).toBe(0); // TT has no sea/canal infrastructure
  });

  test('monthly cost is 0 with the note when infraMaintenance is off (default)', () => {
    const game = infraGame();
    expect(getSetting(game.state, 'infraMaintenance')).toBe(false);
    const s = infrastructureSummary(game.state);
    expect(s.monthly).toBe(0);
    expect(s.maintenanceOff).toBe(true);
    const cost = row(infrastructureRows(game.state), 'cost');
    expect(cost.note).toBe('infrastructure maintenance off');
    expect(cost.text).toContain('0');
  });

  test('with infraMaintenance on the cost equals infrastructureMaintenance()', () => {
    const game = infraGame();
    setSetting(game.state, 'infraMaintenance', true);
    const s = infrastructureSummary(game.state);
    expect(s.maintenanceOff).toBe(false);
    expect(s.monthly).toBe(infrastructureMaintenance(game.state));
    expect(s.monthly).toBeGreaterThan(0);
    const cost = row(infrastructureRows(game.state), 'cost');
    expect(cost.value).toBe(s.monthly);
    expect(cost.note).toBe('');
  });
});

describe('screenshot zoom menu entries (G9)', () => {
  test('the two extra menu entries exist with labels and no key', () => {
    expect(SHOT_ITEMS.shotDefaultZoom[0]).toBe('Screenshot at default zoom');
    expect(SHOT_ITEMS.shotZoomedIn[0]).toBe('Screenshot zoomed in');
    expect(SHOT_ITEMS.shotDefaultZoom[2]).toBe('');
    expect(SHOT_ITEMS.shotZoomedIn[2]).toBe('');
    const members = TOOL_GROUPS.find((g) => g[0] === 'shots')[3];
    expect(members).toContain('shotDefaultZoom');
    expect(members).toContain('shotZoomedIn');
  });

  test('zoom levels and file names differ', () => {
    expect(SHOT_ZOOMS.default).toBe(1);
    expect(SHOT_ZOOMS.zoomedIn).toBeGreaterThan(1);
    const d = new Date(2026, 0, 5);
    expect(zoomShotName('default', d)).toBe('transit-tycoon-default-2026-01-05.png');
    expect(zoomShotName('zoomedIn', d)).toBe('transit-tycoon-zoomedIn-2026-01-05.png');
    expect(zoomShotName('nope', d)).toBe(null);
  });

  test('the hotkey table gained no binding for the new entries', () => {
    expect(FIXED_SHORTCUTS.some((s) => /screenshot/i.test(s.label))).toBe(false);
    const shots = HOTKEY_ACTIONS.filter((a) => /screenshot/i.test(a.label));
    expect(shots.length).toBe(1); // the existing "." map-view screenshot only
    expect(shots[0].key).toBe('.');
    expect(defaultKeys().screenshot).toBe('.');
  });
});
