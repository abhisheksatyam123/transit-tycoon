/** Waypoint rename (OpenTTD waypoint_gui.cpp / CmdRenameStation on waypoints): lazy name, blank reset, rival refused, save/load, display name. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { createStation } from '../js/simulation/stations.js';
import { renameWaypoint, waypointDisplayName, waypointDefaultName, isWaypointRecord } from '../js/simulation/cmdRename.js';

function setup() {
  const g = flatGame(23);
  // mirror cmdWaypoint.js: the builder names the record 'Waypoint n' / 'Road waypoint n'
  const st = createStation(g.state, 5, 5);
  st.tiles.push({ x: 5, y: 5, kind: 'waypoint', radius: 0 });
  st.name = `Waypoint ${st.id}`;
  const road = createStation(g.state, 9, 9);
  road.tiles.push({ x: 9, y: 9, kind: 'waypoint', road: true, radius: 0 });
  road.name = `Road waypoint ${road.id}`;
  return { g, st, road };
}

describe('renameWaypoint', () => {
  test('rename sets the name; display name uses it', () => {
    const { g, st } = setup();
    expect(st.name).toBe(`Waypoint ${st.id}`);
    expect(waypointDisplayName(st)).toBe(waypointDefaultName(st));
    const r = g.renameWaypoint(st.id, '  Gate Four ');
    expect(r.ok).toBe(true);
    expect(st.name).toBe('Gate Four');
    expect(waypointDisplayName(st)).toBe('Gate Four');
  });

  test('blank name resets to the default label', () => {
    const { g, st } = setup();
    expect(g.renameWaypoint(st.id, 'Gate').ok).toBe(true);
    const r = g.renameWaypoint(st.id, '   ');
    expect(r.ok).toBe(true);
    expect(st.name).toBe(`Waypoint ${st.id}`);
    expect(waypointDisplayName(st)).toBe(`Waypoint ${st.id}`);
  });

  test('road waypoints get the road default label; reset restores it', () => {
    const { g, road } = setup();
    expect(isWaypointRecord(road)).toBe(true);
    expect(waypointDisplayName(road)).toBe(`Road waypoint ${road.id}`);
    g.renameWaypoint(road.id, 'Ring Rd');
    g.renameWaypoint(road.id, '');
    expect(road.name).toBe(`Road waypoint ${road.id}`);
  });

  test('unknown id, non-waypoint station, too long, control chars and duplicates are refused', () => {
    const { g, st } = setup();
    expect(g.renameWaypoint(999999, 'X').ok).toBe(false);
    const plain = createStation(g.state, 20, 20);
    plain.tiles.push({ x: 20, y: 20, kind: 'rail', radius: 0 });
    expect(g.renameWaypoint(plain.id, 'X').ok).toBe(false);
    expect(g.renameWaypoint(st.id, 'x'.repeat(33)).ok).toBe(false);
    expect(g.renameWaypoint(st.id, 'bad\u0007name').ok).toBe(false);
    const other = createStation(g.state, 21, 21);
    other.tiles.push({ x: 21, y: 21, kind: 'waypoint', radius: 0 });
    expect(g.renameWaypoint(other.id, 'Dup').ok).toBe(true);
    const dup = g.renameWaypoint(st.id, 'dup');
    expect(dup.ok).toBe(false);
    expect(dup.error).toMatch(/already exists/);
    expect(st.name).toBe(`Waypoint ${st.id}`);
  });

  test('rival-owned waypoint is refused', () => {
    const { g, st } = setup();
    st.ownerId = 99;
    const r = renameWaypoint({ state: g.state }, st.id, 'Hijack');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/rival/i);
    expect(st.name).toBe(`Waypoint ${st.id}`);
  });

  test('dry run validates without storing', () => {
    const { g, st } = setup();
    expect(g.renameWaypoint(st.id, 'Trial', { dryRun: true }).ok).toBe(true);
    expect(st.name).toBe(`Waypoint ${st.id}`);
  });

  test('name survives save / load', () => {
    const { g, st } = setup();
    g.renameWaypoint(st.id, 'Saved Gate');
    const loaded = parseState(serializeState(g.state));
    const back = loaded.stations.find((s) => s.id === st.id);
    expect(back.name).toBe('Saved Gate');
    expect(waypointDisplayName(back)).toBe('Saved Gate');
  });
});
