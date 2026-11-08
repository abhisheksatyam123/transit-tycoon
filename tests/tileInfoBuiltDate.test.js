import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { formatDate } from '../js/simulation/date.js';

describe('tileInfo built date metadata (OTTD r24 #2)', () => {
  test('station records builtDate and tileInfo shows Built line', () => {
    const game = flatGame();
    // Advance date so builtDate is deterministic and non-default-looking
    game.stepDays(45);
    const expectedDate = formatDate(game.state.date);
    const r = game.buildRailStation(20, 24, 'x', 2);
    expect(r.ok).toBe(true);
    const st = game.state.stations.find((s) => s.id === r.stationId);
    expect(st).toBeTruthy();
    expect(st.builtDate).toEqual({
      year: game.state.date.year,
      month: game.state.date.month,
      day: game.state.date.day,
    });
    const info = game.tileInfo(20, 24);
    expect(info).toBeTruthy();
    expect(info.lines.join('\n')).toContain(`Built: ${expectedDate}`);
  });

  test('depot records builtDate and tileInfo shows Built line', () => {
    const game = flatGame();
    game.stepDays(30);
    const expectedDate = formatDate(game.state.date);
    // Rail depot on empty land, exit facing east (2) - standalone is fine
    const r = game.buildDepot(25, 25, 'rail', 2);
    expect(r.ok).toBe(true);
    const d = game.state.depots.find((x) => x.id === r.depotId);
    expect(d).toBeTruthy();
    expect(d.builtDate).toEqual({
      year: game.state.date.year,
      month: game.state.date.month,
      day: game.state.date.day,
    });
    const info = game.tileInfo(25, 25);
    expect(info).toBeTruthy();
    expect(info.lines.join('\n')).toContain(`Built: ${expectedDate}`);
  });

  test('road depot records builtDate and tileInfo shows Built line', () => {
    const game = flatGame();
    game.stepDays(10);
    const expectedDate = formatDate(game.state.date);
    const r = game.buildDepot(28, 25, 'road', 1); // north exit
    expect(r.ok).toBe(true);
    const d = game.state.depots.find((x) => x.id === r.depotId);
    expect(d.builtDate).toEqual({
      year: game.state.date.year,
      month: game.state.date.month,
      day: game.state.date.day,
    });
    const info = game.tileInfo(28, 25);
    expect(info.lines.join('\n')).toContain('Road depot');
    expect(info.lines.join('\n')).toContain(`Built: ${expectedDate}`);
  });

  test('legacy station/depot without builtDate query cleanly', () => {
    const game = flatGame();
    const rs = game.buildRailStation(20, 24, 'x', 2);
    const rd = game.buildDepot(25, 25, 'rail', 2);
    expect(rs.ok && rd.ok).toBe(true);
    const st = game.state.stations.find((s) => s.id === rs.stationId);
    const d = game.state.depots.find((x) => x.id === rd.depotId);
    // Simulate legacy save: no builtDate
    delete st.builtDate;
    delete d.builtDate;
    const stInfo = game.tileInfo(20, 24);
    expect(stInfo).toBeTruthy();
    expect(stInfo.lines.join('\n')).not.toContain('Built:');
    expect(() => game.tileInfo(20, 24)).not.toThrow();
    const dInfo = game.tileInfo(25, 25);
    expect(dInfo).toBeTruthy();
    expect(dInfo.lines.join('\n')).not.toContain('Built:');
    expect(() => game.tileInfo(25, 25)).not.toThrow();
  });

  test('save/load roundtrip preserves builtDate for stations and depots', () => {
    const game = flatGame();
    game.stepDays(77);
    const rs = game.buildRailStation(20, 24, 'x', 2);
    const rd = game.buildDepot(25, 25, 'rail', 2);
    expect(rs.ok && rd.ok).toBe(true);
    const stBefore = game.state.stations.find((s) => s.id === rs.stationId);
    const dBefore = game.state.depots.find((x) => x.id === rd.depotId);
    const stDate = { ...stBefore.builtDate };
    const dDate = { ...dBefore.builtDate };

    const json = serializeState(game.state);
    const loaded = parseState(json);
    const stAfter = loaded.stations.find((s) => s.id === rs.stationId);
    const dAfter = loaded.depots.find((x) => x.id === rd.depotId);
    expect(stAfter.builtDate).toEqual(stDate);
    expect(dAfter.builtDate).toEqual(dDate);
  });
});
