import { test, expect } from 'bun:test';
import { TileManager } from '../js/openloco/map/tileManager.js';
import { ElementType, SurfaceSlope } from '../js/openloco/map/elements.js';
import { TrackElement, RoadElement, StationElement, SignalElement } from '../js/openloco/map/transportElements.js';
import * as C from '../js/openloco/commands/index.js';
import * as barrel from '../js/openloco/index.js';

const A = C.Flags.apply;
const P = (x, y, z = 16) => ({ x: x * 32, y: y * 32, z });
function world() {
  const tm = TileManager.createFlat(12, 12);
  const ctx = C.createContext({ tm });
  ctx.stations = C.createStationManager(tm);
  return { tm, ctx, run: (cmd, args, flags = A) => C.doCommand(ctx, cmd, args, flags) };
}
const count = (tm, pos, cls) => [...tm.get(pos)].filter((e) => e instanceof cls).length;
const trk = (pos, rotation = 0, trackId = 0) => ({ pos, rotation, trackId, trackObjectId: 0 });

test('barrel exports the commands', () => {
  for (const n of ['createTrackCommand', 'removeTrackCommand', 'createRoadCommand', 'removeRoadCommand', 'createRoadStationCommand', 'removeTrainStationCommand', 'createSignalsAutoCommand', 'createRoadModCommand']) {
    expect(typeof barrel[n]).toBe('function');
  }
});

test('straight track + curve then remove; query costs without applying', () => {
  const { tm, ctx, run } = world();
  const q = C.createTrackCommand(ctx, trk(P(2, 2)), 0);
  expect(q.ok).toBe(true); expect(q.cost).toBe(200);
  expect(count(tm, P(2, 2), TrackElement)).toBe(0); // query did not apply
  expect(run(C.createTrackCommand, trk(P(2, 2))).cost).toBe(200);
  expect(count(tm, P(2, 2), TrackElement)).toBe(1);
  // curve (5 pieces, cost factor 1005/256 of 200)
  const c = run(C.createTrackCommand, trk(P(6, 6), 0, 6));
  expect(c.ok).toBe(true); expect(c.cost).toBe(Math.trunc(200 * 1005 / 256));
  let total = 0;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) total += count(tm, P(x, y), TrackElement);
  expect(total).toBe(1 + 5);
  const r = run(C.removeTrackCommand, { ...trk(P(6, 6), 0, 6), index: 0 });
  expect(r.ok).toBe(true); expect(r.cost).toBeGreaterThan(0);
  expect(run(C.removeTrackCommand, { ...trk(P(2, 2)), index: 0 }).ok).toBe(true);
  total = 0;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) total += count(tm, P(x, y), TrackElement);
  expect(total).toBe(0);
  expect(run(C.removeTrackCommand, { ...trk(P(2, 2)), index: 0 }).ok).toBe(false);
});

test('inflation factor scales costs; z alignment and edge failures', () => {
  const { ctx } = world();
  ctx.currencyFactors = [2048, 2048, 2048, 2048, 2048];
  expect(C.createTrackCommand(ctx, trk(P(2, 2)), 0).cost).toBe(400);
  expect(C.createTrackCommand(ctx, trk(P(2, 2, 12)), 0).ok).toBe(false);
  expect(C.createTrackCommand(ctx, trk(P(-1, 2)), 0).ok).toBe(false);
});

test('collision failures', () => {
  const { tm, ctx, run } = world();
  expect(run(C.createTrackCommand, trk(P(3, 3))).ok).toBe(true);
  const dup = run(C.createTrackCommand, trk(P(3, 3)));
  expect(dup.ok).toBe(false); expect(dup.error).toBe('already_built_here');
  tm.insertElement(ElementType.building, P(4, 3), 4, 0xf).setClearZ(20);
  const b = C.createTrackCommand(ctx, trk(P(4, 3)), 0);
  expect(b.ok).toBe(false);
  expect(count(tm, P(4, 3), TrackElement)).toBe(0);
});

test('slope rules: bridge needed, bridge cost, junction on slope', () => {
  const { tm, ctx, run } = world();
  const slope = C.createTrackCommand(ctx, trk(P(2, 2), 0, 14), 0);
  expect(slope.ok).toBe(false); expect(slope.error).toBe('bridge_needed');
  const bridged = run(C.createTrackCommand, { ...trk(P(2, 2), 0, 14), bridge: 0 });
  expect(bridged.ok).toBe(true); expect(bridged.cost).toBeGreaterThan(200);
  expect([...tm.get(P(2, 2))].some((e) => e instanceof TrackElement && e.hasBridge())).toBe(true);
  // matching ground slope removes the bridge requirement for a flat piece at wrong height
  const tooHigh = C.createTrackCommand(ctx, { ...trk(P(8, 8, 16 + 4 * 4 * 12), 0, 0), bridge: 0 }, 0);
  expect(tooHigh.ok).toBe(false);
  // a slope track cannot form a junction with another track
  expect(run(C.createTrackCommand, trk(P(5, 5))).ok).toBe(true);
  tm.get(P(5, 5)).surface().setSlope(SurfaceSlope.CornerUp.north);
  const bad = C.createTrackCommand(ctx, trk(P(5, 5), 1), 0);
  expect(bad.ok).toBe(false);
});

test('signal rejected on a junction, accepted on plain track, both sides cost double', () => {
  const { tm, ctx, run } = world();
  run(C.createTrackCommand, trk(P(2, 2))); run(C.createTrackCommand, trk(P(3, 2)));
  const sig = (pos, sides) => ({ pos, rotation: 0, trackId: 0, index: 0, type: 0, trackObjType: 0, sides });
  const one = C.createSignalCommand(ctx, sig(P(2, 2), C.SIGNAL_LEFT), 0);
  const both = C.createSignalCommand(ctx, sig(P(2, 2), C.SIGNAL_LEFT | C.SIGNAL_RIGHT), 0);
  expect(one.ok).toBe(true); expect(both.ok).toBe(true); expect(both.cost).toBe(one.cost * 2);
  expect(run(C.createSignalCommand, sig(P(2, 2), C.SIGNAL_LEFT | C.SIGNAL_RIGHT)).ok).toBe(true);
  const el = [...tm.get(P(2, 2))].find((e) => e instanceof SignalElement);
  expect(el.getLeft().hasSignal()).toBe(true); expect(el.getRight().hasSignal()).toBe(true);
  const tr = [...tm.get(P(2, 2))].find((e) => e instanceof TrackElement);
  expect(tr.hasSignal()).toBe(true);
  // removing the track removes the signal too
  expect(run(C.removeTrackCommand, { ...trk(P(2, 2)), index: 0 }).ok).toBe(true);
  expect(count(tm, P(2, 2), SignalElement)).toBe(0);
  // junction: a crossing track on the same tile
  run(C.createTrackCommand, trk(P(6, 6))); run(C.createTrackCommand, trk(P(6, 6), 1));
  const j = run(C.createSignalCommand, sig(P(6, 6), C.SIGNAL_LEFT));
  expect(j.ok).toBe(false); expect(j.error).toBe('signals_cannot_be_built_on_a_junction');
});

test('auto signals place and remove along a section', () => {
  const { tm, run } = world();
  for (let x = 1; x < 9; x++) run(C.createTrackCommand, trk(P(x, 3)));
  const args = { pos: P(4, 3), rotation: 0, trackId: 0, index: 0, type: 0, trackObjType: 0, sides: C.SIGNAL_LEFT, step: 2 };
  const r = run(C.createSignalsAutoCommand, args);
  expect(r.ok).toBe(true);
  let n = 0; for (let x = 0; x < 12; x++) n += count(tm, P(x, 3), SignalElement);
  expect(n).toBeGreaterThan(0);
  const rm = run(C.removeSignalsAutoCommand, { ...args, flags: C.SIGNAL_LEFT });
  expect(rm.ok).toBe(true);
  n = 0; for (let x = 0; x < 12; x++) n += count(tm, P(x, 3), SignalElement);
  expect(n).toBe(0);
});

test('train station create / query / replace / remove', () => {
  const { tm, ctx, run } = world();
  run(C.createTrackCommand, trk(P(4, 4)));
  const st = { ...trk(P(4, 4)), index: 0, type: 0 };
  const q = C.createTrainStationCommand(ctx, st, 0);
  expect(q.ok).toBe(true); expect(q.cost).toBe(600); // divisor 8 => 150 * 4
  expect(count(tm, P(4, 4), StationElement)).toBe(0);
  expect(ctx.stations.stations.size).toBe(0); // query allocation is rolled back
  const a = run(C.createTrainStationCommand, st);
  expect(a.ok).toBe(true);
  expect(count(tm, P(4, 4), StationElement)).toBe(1);
  const track = [...tm.get(P(4, 4))].find((e) => e instanceof TrackElement);
  expect(track.hasStationElement()).toBe(true);
  expect(track.clearZ()).toBe(track.baseZ() + 8 + 4);
  expect(ctx.stations.stations.size).toBe(1);
  expect([...ctx.stations.stations.values()][0].stationTileSize).toBe(1);
  // signals cannot be placed on a station tile (validateTrackIsSignalCompatible -> 'empty')
  const bad = run(C.createSignalCommand, { pos: P(4, 4), rotation: 0, trackId: 0, index: 0, type: 0, trackObjType: 0, sides: C.SIGNAL_LEFT });
  expect(bad.ok).toBe(false);
  // neighbouring tile joins the same station
  run(C.createTrackCommand, trk(P(5, 4)));
  expect(run(C.createTrainStationCommand, { ...trk(P(5, 4)), index: 0, type: 0 }).ok).toBe(true);
  expect(ctx.stations.stations.size).toBe(1);
  const r = run(C.removeTrainStationCommand, { pos: P(4, 4), rotation: 0, trackId: 0, index: 0, type: 0 });
  expect(r.ok).toBe(true); expect(r.cost).toBe(400);
  expect(count(tm, P(4, 4), StationElement)).toBe(0);
  expect(track.hasStationElement()).toBe(false);
  expect(track.clearZ()).toBe(track.baseZ() + 8);
  expect(run(C.removeTrainStationCommand, { pos: P(4, 4), rotation: 0, trackId: 0, index: 0, type: 0 }).ok).toBe(false);
});

test('station refuses a junction', () => {
  const { run } = world();
  run(C.createTrackCommand, trk(P(4, 4))); run(C.createTrackCommand, trk(P(4, 4), 1));
  const r = run(C.createTrainStationCommand, { ...trk(P(4, 4)), index: 0, type: 0 });
  expect(r.ok).toBe(false); expect(r.error).toBe('station_cannot_be_built_on_a_junction');
});

test('road, level crossing over track, removal', () => {
  const { tm, ctx, run } = world();
  const road = (pos, rotation = 0, roadId = 0) => ({ pos, rotation, roadId, roadObjectId: 0 });
  const r = run(C.createRoadCommand, road(P(2, 8)));
  expect(r.ok).toBe(true); expect(r.cost).toBe(Math.trunc(100 * 256 / 256));
  expect(run(C.createRoadCommand, road(P(2, 8))).error).toBe('already_built_here');
  // level crossing: track rot0, road rot1 on the same tile
  run(C.createTrackCommand, trk(P(6, 8)));
  const lc = run(C.createRoadCommand, road(P(6, 8), 1));
  expect(lc.ok).toBe(true);
  expect(lc.cost).toBe(100 + 25); // road + level crossing object
  const el = [...tm.get(P(6, 8))].find((e) => e instanceof RoadElement);
  expect(el.hasLevelCrossing()).toBe(true);
  expect([...tm.get(P(6, 8))].find((e) => e instanceof TrackElement).hasLevelCrossing()).toBe(true);
  // crossing at a curve / non-straight is refused
  run(C.createTrackCommand, trk(P(8, 8)));
  expect(C.createRoadCommand(ctx, road(P(8, 8), 0), 0).ok).toBe(false);
  // removal clears the crossing flag on the track
  expect(run(C.removeRoadCommand, { pos: P(6, 8), rotation: 1, roadId: 0, sequenceIndex: 0, objectId: 0 }).ok).toBe(true);
  expect([...tm.get(P(6, 8))].find((e) => e instanceof TrackElement).hasLevelCrossing()).toBe(false);
  expect(run(C.removeRoadCommand, { pos: P(2, 8), rotation: 0, roadId: 0, sequenceIndex: 0, objectId: 0 }).cost).toBe(70);
  expect(count(tm, P(2, 8), RoadElement)).toBe(0);
});

test('road junction places junction pieces and rejects incompatible crossings', () => {
  const { tm, run } = world();
  const road = (pos, rotation = 0, roadId = 0, roadObjectId = 0) => ({ pos, rotation, roadId, roadObjectId });
  expect(run(C.createRoadCommand, road(P(3, 3))).ok).toBe(true);
  const j = run(C.createRoadCommand, road(P(3, 3), 1));
  expect(j.ok).toBe(true);
  expect(count(tm, P(3, 3), RoadElement)).toBeGreaterThanOrEqual(2);
  // a tram over the road is an overlay of a different road object
  expect(run(C.createRoadCommand, road(P(3, 3), 0, 0, 1)).ok).toBe(true);
});

test('road station on a straight road; refuses a junction; removal through the road', () => {
  const { tm, ctx, run } = world();
  const rd = (pos, rotation = 0) => ({ pos, rotation, roadId: 0, roadObjectId: 0 });
  run(C.createRoadCommand, rd(P(2, 6)));
  const st = { ...rd(P(2, 6)), index: 0, type: 0 };
  const q = C.createRoadStationCommand(ctx, st, 0);
  expect(q.ok).toBe(true); expect(q.cost).toBe(240);
  expect(count(tm, P(2, 6), StationElement)).toBe(0);
  const a = run(C.createRoadStationCommand, st);
  expect(a.ok).toBe(true);
  const els = [...tm.get(P(2, 6))];
  expect(els.map((e) => e.constructor.name)).toEqual(['SurfaceElement', 'RoadElement', 'StationElement']);
  expect(els[1].hasStationElement()).toBe(true); expect(els[1].clearZ()).toBe(els[1].baseZ() + 8 + 4);
  expect(ctx.stations.stations.size).toBe(1);
  // removing the road removes the station with it
  const rr = run(C.removeRoadCommand, { pos: P(2, 6), rotation: 0, roadId: 0, sequenceIndex: 0, objectId: 0 });
  expect(rr.ok).toBe(true); expect(rr.cost).toBe(160 + 70);
  expect(count(tm, P(2, 6), StationElement)).toBe(0);
  // junction refused
  run(C.createRoadCommand, rd(P(6, 6))); run(C.createRoadCommand, rd(P(6, 6), 1));
  const bad = run(C.createRoadStationCommand, { ...rd(P(6, 6)), index: 0, type: 0 });
  expect(bad.ok).toBe(false); expect(bad.error).toBe('station_cannot_be_built_on_a_junction');
  // explicit removal of a missing station fails
  expect(run(C.removeRoadStationCommand, { pos: P(2, 6), rotation: 0, roadId: 0, index: 0, roadObjectId: 0 }).ok).toBe(false);
});

test('road end station refused on a through road, accepted at an end', () => {
  const { run, ctx } = world();
  const rd = (pos, rotation = 0) => ({ pos, rotation, roadId: 0, roadObjectId: 0 });
  for (const x of [3, 4, 5]) run(C.createRoadCommand, rd(P(x, 2)));
  const mid = C.createRoadStationCommand(ctx, { ...rd(P(4, 2)), index: 0, type: 1 }, 0);
  expect(mid.ok).toBe(false); expect(mid.error).toBe('station_type_can_only_be_built_at_road_ends');
  expect(C.createRoadStationCommand(ctx, { ...rd(P(3, 2)), index: 0, type: 1 }, 0).ok).toBe(true);
});

test('track and road mods apply, cost and remove', () => {
  const { tm, run } = world();
  run(C.createTrackCommand, trk(P(2, 2)));
  const mod = { pos: P(2, 2), rotation: 0, trackId: 0, index: 0, trackObjType: 0, type: 1, modSection: 0 };
  const a = run(C.createTrackModCommand, mod);
  expect(a.ok).toBe(true); expect(a.cost).toBe(40);
  const t = [...tm.get(P(2, 2))].find((e) => e instanceof TrackElement);
  expect(t.hasMod(0)).toBe(true);
  expect(run(C.removeTrackModCommand, mod).cost).toBe(30);
  expect(t.hasMod(0)).toBe(false);
  // mod set at creation time is charged and sold back with the track
  const m = run(C.createTrackCommand, { ...trk(P(4, 2)), mods: 0b11 });
  expect(m.cost).toBe(200 + 40 + 50);
  expect(run(C.removeTrackCommand, { ...trk(P(4, 2)), index: 0 }).cost).toBe(150 + 30 + 40);
  run(C.createRoadCommand, { pos: P(2, 6), rotation: 0, roadId: 0, roadObjectId: 0 });
  const rm = { pos: P(2, 6), rotation: 0, roadId: 0, index: 0, roadObjType: 0, type: 2, modSection: 0 };
  expect(run(C.createRoadModCommand, rm).cost).toBe(30);
  const r = [...tm.get(P(2, 6))].find((e) => e instanceof RoadElement);
  expect(r.hasMod(1)).toBe(true);
  expect(run(C.removeRoadModCommand, rm).ok).toBe(true);
  expect(r.hasMod(1)).toBe(false);
});

test('ghost placement flags the element and does not charge-collide with a real one', () => {
  const { tm, run } = world();
  const g = run(C.createTrackCommand, trk(P(2, 2)), A | C.Flags.ghost);
  expect(g.ok).toBe(true);
  expect([...tm.get(P(2, 2))].find((e) => e instanceof TrackElement).isGhost()).toBe(true);
  expect(run(C.removeTrackCommand, { ...trk(P(2, 2)), index: 0 }, A).ok).toBe(false); // ghost needs the ghost flag
  expect(run(C.removeTrackCommand, { ...trk(P(2, 2)), index: 0 }, A | C.Flags.ghost).ok).toBe(true);
});
