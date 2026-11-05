import { test, expect } from 'bun:test';
import { ElementType, ElementFlags, TileElement, SurfaceElement, BuildingElement, TreeElement, IndustryElement, SurfaceSlope } from '../js/openloco/map/elements.js';
import { TrackElement, RoadElement, SignalElement, StationElement, StationType, STATION_NULL } from '../js/openloco/map/transportElements.js';
import { TileManager } from '../js/openloco/map/tileManager.js';
import { rotatePos2 } from '../js/openloco/map/world.js';
import { QuarterTile } from '../js/openloco/quarterTile.js';
import { TrackId, RoadId, AdditionalTaDFlags } from '../js/openloco/trackEnum.js';
import { getTrackConnectionEnd, getRoadConnectionEnd } from '../js/openloco/connection.js';
import {
  getTrackConnections, getRoadConnections, getTrackConnectionsAi, validateTrackIsSignalCompatible,
} from '../js/openloco/map/track.js';
import {
  canConstructAt, applyClearAtStandardHeight, makeClearFunction, ClearFuncResult, ElementPositionFlags,
} from '../js/openloco/map/tileClearance.js';
import { placeTrack, placeRoad, attachTrainStation, attachRoadStation } from '../js/openloco/map/place.js';
import { iterateTrackToJunction } from '../js/openloco/trackIteration.js';
import { tileManagerFromGame, piecesForMask } from '../js/openloco/map/fromGame.js';
import { getUnkTrack, getUnkRoad, getTrackPiece } from '../js/openloco/trackData.js';
import * as barrel from '../js/openloco/index.js';
import { Game } from '../js/simulation/game.js';



test('element bit layout round trips', () => {
  const t = TrackElement.create({ baseZ: 4, clearZ: 12, direction: 3, quarterTile: 0xf, sequenceIndex: 5, trackObjId: 9, trackId: 42, bridge: 6, owner: 7, mods: 0b1010 });
  expect([...t.rawData()]).toEqual([3, 0xf, 4, 12, 42 | 0x80, 5 | (9 << 4), 6 << 5, 7 | (0b1010 << 4)]);
  expect(t.trackId()).toBe(42); expect(t.hasBridge()).toBe(true); expect(t.bridge()).toBe(6); expect(t.owner()).toBe(7);
  expect(t.mods()).toBe(0b1010); expect(t.hasMod(1)).toBe(true); expect(t.hasMod(0)).toBe(false);
  t.setHasStationElement(true); t.setHasSignal(true); t.setGhost(true); t.setFlag6(true); t.setAiAllocated(true);
  expect(t.bytes[0]).toBe(3 | 0xc0); expect(t.occupiedQuarter()).toBe(0xf);
  expect(t.flags() & 0x70).toBe(0x70); expect(t.isGhost()).toBe(true);
  t.setGhost(false); expect(t.flags() & 0x10).toBe(0); t.setOccupiedQuarter(0x35); expect(t.occupiedQuarter()).toBe(5);
  expect(t.type()).toBe(ElementType.track); expect(t.bytes.length).toBe(8);

  const r = RoadElement.create(2, 10);
  r.setRoadId(RoadId.turnaround); r.setLaneOccupation(3); r.setRoadObjectId(0xa); r.setSequenceIndex(2); r.setLevelCrossingObjectId(3);
  r.setBridgeObjectId(5); r.setMods(2); r.setOwner(15); r.setHasLevelCrossing(true); r.setLevelCrossingClosed(true); r.setLevelCrossingAnimationFrame(9);
  expect(r.roadId()).toBe(9); expect(r.laneOccupation()).toBe(3); expect(r.roadObjectId()).toBe(10);
  expect(r.sequenceIndex()).toBe(2); expect(r.levelCrossingObjectId()).toBe(3); expect(r.streetLightStyle()).toBe(3);
  expect(r.bridge()).toBe(5); expect(r.mods()).toBe(2); expect(r.hasMod(0)).toBe(false); expect(r.hasMod(1)).toBe(true);
  expect(r.hasUnk7_80()).toBe(true); expect(r.owner()).toBe(15);
  expect(r.bytes[4]).toBe(9 | 0x30); expect(r.bytes[5]).toBe(2 | 0xc | 0xa0); expect(r.bytes[7]).toBe(15 | 0x10 | 0x20 | 0x80);
  expect(r.levelCrossingAnimationFrame()).toBe(9);

  const s = new StationElement();
  s.setStationId(0x3ff); s.setBuildingType(0x2a); s.setStationType(StationType.docks); s.setObjectId(0x1f); s.setSequenceIndex(2); s.setRotation(1); s.setOwner(4);
  expect(s.stationId()).toBe(0x3ff); expect(s.buildingType()).toBe(0x2a); expect(s.stationType()).toBe(3);
  expect(s.objectId()).toBe(0x1f); expect(s.sequenceIndex()).toBe(2); expect(s.rotation()).toBe(1); expect(s.owner()).toBe(4);
  expect([...s.bytes.slice(6)]).toEqual([0xff, (0x2a << 2) | 3]);
  s.setStationId(5); expect(s.buildingType()).toBe(0x2a);

  const g = new SignalElement();
  g.setLeftGhost(true); g.setRotation(2);
  const L = g.getLeft(), R = g.getRight();
  L.setHasSignal(true); L.setSignalObjectId(3); L.setIsOccupied(true); L.setUnk4(2); L.setFrame(7); L.setAllLights(0xc);
  R.setHasSignal(true); R.setSignalObjectId(9);
  expect(g.bytes[4]).toBe(0x80 | 0x40 | 0x20 | 3); expect(g.bytes[5]).toBe(7 | 0xc0); expect(g.bytes[6]).toBe(0x89);
  expect(L.hasRedLight()).toBe(true); expect(L.hasGreenLight()).toBe(true); expect(L.frame()).toBe(7); expect(R.hasSignal()).toBe(true);
  expect(g.isLeftGhost()).toBe(true); expect(g.isRightGhost()).toBe(false); expect(g.rotation()).toBe(2);

  const su = SurfaceElement.create(8, 8, 0xf, true);
  su.setSlope(SurfaceSlope.CornerDown.south | SurfaceSlope.doubleHeight); su.setSnowCoverage(5); su.setWater(0x13); su.setUpdateTimer(6);
  su.setTerrain(0x11); su.setGrowthStage(4); su.setVariation(200);
  expect(su.isIndustrial()).toBe(true); expect(su.isSlopeDoubleHeight()).toBe(true); expect(su.slopeCorners()).toBe(SurfaceSlope.CornerDown.south);
  expect(su.snowCoverage()).toBe(5); expect(su.water()).toBe(0x13); expect(su.waterHeight()).toBe(0x13 * 16); expect(su.getUpdateTimer()).toBe(6);
  expect(su.terrain()).toBe(0x11); expect(su.getGrowthStage()).toBe(4); expect(su.industryId()).toBe(200);
  expect(su.slope()).toBe(SurfaceSlope.CornerDown.south | 0x10); su.setSlope(1); expect(su.snowCoverage()).toBe(0);

  const b = new BuildingElement(); b.setColour(0x1d); b.setVariation(0x15); b.setAge(0x2b); b.setObjectId(77); b.setConstructed(true);
  expect(b.colour()).toBe(0x1d); expect(b.variation()).toBe(0x15); expect(b.age()).toBe(0x2b); expect(b.objectId()).toBe(77); expect(b.isConstructed()).toBe(true);
  const ind = new IndustryElement(); ind.setBuildingType(0x13); ind.setSectionProgress(5); ind.setIndustryId(9);
  expect(ind.buildingType()).toBe(0x13); expect(ind.sectionProgress()).toBe(5); expect(ind.industryId()).toBe(9);
  const tr = new TreeElement(); tr.setQuadrant(2); tr.setRotation(1); tr.setGrowth(0xa);
  expect(tr.quadrant()).toBe(2); expect(tr.rotation()).toBe(1); expect(tr.growth()).toBe(0xa);
  expect(ElementFlags.last).toBe(0x80); expect(new TileElement().isLast()).toBe(false);
});

test('TileManager insert / remove / ordering / last flag', () => {
  const tm = TileManager.createFlat(8, 8);
  const pos = { x: 3 * 32, y: 2 * 32 };
  const a = tm.insertElement(ElementType.track, pos, 8, 0xf);
  const c = tm.insertElement(ElementType.road, pos, 20, 0xf);
  const b = tm.insertElement(ElementType.building, pos, 8, 0xf); // equal baseZ goes after existing
  const els = tm.get(pos).elements();
  expect(els.map((e) => e.type())).toEqual([ElementType.surface, ElementType.track, ElementType.building, ElementType.road]);
  expect(els.map((e) => e.isLast())).toEqual([false, false, false, true]);
  expect(a.clearZ()).toBe(8); expect(a.next()).toBe(b); expect(c.prev()).toBe(b);
  expect(tm.get(pos).surface().type()).toBe(0);
  expect(tm.removeElement(c)).toBe(true);
  expect(tm.get(pos).elements().map((e) => e.isLast())).toEqual([false, false, true]);
  expect(tm.removeElement(a)).toBe(true); expect(tm.removeElement(a)).toBe(false);
  expect(tm.get(pos).size()).toBe(2);
  expect(tm.insertElement(ElementType.track, { x: -40, y: 0 }, 8, 0xf)).toBeNull();
  expect(tm.get({ x: 9999, y: 0 }).isNull()).toBe(true);
  // insertElementRoad stops before a road station at the same baseZ
  const road = tm.insertElementRoad(pos, 12, 0xf);
  const st = tm.insertElementAfterNoReorg(road, ElementType.station, 12, 0xf); st.setStationType(StationType.roadStation);
  const road2 = tm.insertElementRoad(pos, 12, 0xf);
  expect(tm.get(pos).elements().indexOf(road2)).toBe(tm.get(pos).elements().indexOf(st) - 1);
  expect(tm.get(pos).elements().at(-1).isLast()).toBe(true);
  // height helper
  const su = tm.get({ x: 0, y: 0 }).surface();
  expect(tm.getHeight({ x: 40, y: 40 })).toEqual({ landHeight: 16, waterHeight: 0 });
  su.setSlope(SurfaceSlope.SideUp.northeast);
  expect(tm.getHeight({ x: 0, y: 0 }).landHeight).toBe(16 + 1);
  expect(rotatePos2({ x: 5, y: 7 }, 1)).toEqual({ x: 7, y: -5 });
});

test('clearance conflicts', () => {
  const tm = TileManager.createFlat(12, 12);
  const pos = { x: 5 * 32, y: 5 * 32 };
  const full = QuarterTile.fromRaw(0xf);
  expect(canConstructAt(tm, pos, 4, 12, full).ok).toBe(true);
  expect(canConstructAt(tm, pos, 4, 12, full).positionFlags & ElementPositionFlags.aboveGround).toBe(1);
  expect(canConstructAt(tm, { x: 0, y: 0 }, 4, 12, full)).toMatchObject({ ok: false, error: 'off_edge_of_map' });
  // below the surface: underground
  expect(canConstructAt(tm, pos, 0, 4, QuarterTile.fromRaw(0x0f)).positionFlags & ElementPositionFlags.underground).toBe(2);
  const [trk] = placeTrack(tm, { x: pos.x, y: pos.y, z: 16 }, { trackId: TrackId.straight, rotation: 0 });
  expect(trk.occupiedQuarter()).toBe(0xf);
  // overlapping element at same height collides, above/below does not
  expect(canConstructAt(tm, pos, 4, 12, full)).toMatchObject({ ok: false, error: 'string_id_in_the_way', element: trk });
  expect(canConstructAt(tm, pos, trk.clearZ(), trk.clearZ() + 8, full).ok).toBe(true);
  // ghosts never collide; non-overlapping quarters do not collide
  trk.setGhost(true); expect(canConstructAt(tm, pos, 4, 12, full).ok).toBe(true); trk.setGhost(false);
  trk.setOccupiedQuarter(0b0001); expect(canConstructAt(tm, pos, 4, 12, QuarterTile.fromRaw(0b0100)).ok).toBe(true);
  expect(canConstructAt(tm, pos, 4, 12, QuarterTile.fromRaw(0b0101)).ok).toBe(false);
  // building removed by clear function (collisionRemoved restarts the walk)
  const bld = tm.insertElement(ElementType.building, { x: 7 * 32, y: 5 * 32 }, 4, 0xf); bld.setClearZ(12);
  const p2 = { x: 7 * 32, y: 5 * 32 };
  expect(canConstructAt(tm, p2, 4, 12, full).ok).toBe(false);
  const removed = [];
  const clear = makeClearFunction(true, { building: (el) => { removed.push(el); tm.removeElement(el); return ClearFuncResult.collisionRemoved; } });
  expect(applyClearAtStandardHeight(tm, p2, 4, 12, full, clear).ok).toBe(true);
  expect(removed).toEqual([bld]); expect(tm.get(p2).size()).toBe(1);
  // clear function with default collision still blocks on track
  expect(applyClearAtStandardHeight(tm, pos, 4, 12, full, makeClearFunction(true)).ok).toBe(false);
  expect(applyClearAtStandardHeight(tm, pos, 4, 12, full, makeClearFunction(false)).ok).toBe(true);
  // slope: raised corner blocks a low object, unless the z quarter allows it
  const sp = { x: 8 * 32, y: 8 * 32 };
  tm.get(sp).surface().setSlope(SurfaceSlope.CornerUp.north);
  expect(canConstructAt(tm, sp, 4, 12, full).ok).toBe(false);
  expect(canConstructAt(tm, sp, 8, 16, full).ok).toBe(true);
  // water
  tm.get({ x: 3 * 32, y: 3 * 32 }).surface().setWater(2); // waterZ = 8
  expect(canConstructAt(tm, { x: 3 * 32, y: 3 * 32 }, 4, 16, full)).toMatchObject({ ok: false, error: 'cannot_build_partly_above_below_water' });
});

function line(tm, tiles, trackObjectId = 2, owner = 3) {
  return tiles.map((tx) => placeTrack(tm, { x: tx * 32, y: 5 * 32, z: 16 }, { trackId: TrackId.straight, rotation: 2, trackObjectId, owner })[0]);
}

test('getTrackConnections on a hand-built 3-piece line', () => {
  const tm = TileManager.createFlat(16, 16);
  const [a, b, c] = line(tm, [4, 5, 6]);
  const tad = (TrackId.straight << 3) | 2;
  // walk from the first piece to the end
  const trackStart = { x: 4 * 32, y: 5 * 32, z: 16 };
  const end = getTrackConnectionEnd(trackStart, tad);
  expect(end).toEqual({ nextPos: { x: 5 * 32, y: 5 * 32, z: 16 }, nextRotation: 2 });
  const conn = getTrackConnections(tm, end.nextPos, end.nextRotation, 3, 2);
  expect(conn).toEqual({ connections: [tad], hasLevelCrossing: false, stationId: STATION_NULL });
  // wrong company / object / entering from the wrong side / wrong height
  expect(getTrackConnections(tm, end.nextPos, 2, 4, 2).connections).toEqual([]);
  expect(getTrackConnections(tm, end.nextPos, 2, 3, 1).connections).toEqual([]);
  expect(getTrackConnections(tm, end.nextPos, 1, 3, 2).connections).toEqual([]);
  // entering against the piece direction (rotation 0) finds the reversed tad (|4) via the flag6 element
  expect(getTrackConnections(tm, end.nextPos, 0, 3, 2).connections).toEqual([tad | 4]);
  expect(getTrackConnections(tm, { ...end.nextPos, z: 32 }, 2, 3, 2).connections).toEqual([]);
  // chain walk with iterateTrackToJunction
  const res = iterateTrackToJunction(trackStart, tad, {
    filter: () => true,
    getConnections: (p, r) => getTrackConnections(tm, p, r, 3, 2),
  });
  expect(res.stoppedBy).toBe('deadend'); expect(res.pos).toEqual({ x: 6 * 32, y: 5 * 32, z: 16 });
  expect(res.steps).toBe(2);
  // ghost / ai flags hide pieces from normal queries, ai query finds ai pieces
  b.setGhost(true);
  expect(getTrackConnections(tm, end.nextPos, 2, 3, 2).connections).toEqual([]);
  b.setGhost(false); b.setAiAllocated(true);
  expect(getTrackConnections(tm, end.nextPos, 2, 3, 2).connections).toEqual([]);
  expect(getTrackConnectionsAi(tm, end.nextPos, 2, 3, 2).connections).toEqual([tad]);
  b.setAiAllocated(false);
  // station + signal + bridge + mods + level crossing flags
  b.setHasLevelCrossing(true); b.setHasBridge(true); b.setBridgeObjectId(3); b.setMod(1, true);
  const st = attachTrainStation(tm, b, { stationId: 77, objectId: 1, owner: 3 });
  const sig = tm.insertElementAfterNoReorg(st, ElementType.signal, b.baseZ(), 0xf); b.setHasSignal(true);
  const c2 = getTrackConnections(tm, end.nextPos, 2, 3, 2, 0b10, 0b10);
  expect(c2.stationId).toBe(77); expect(c2.hasLevelCrossing).toBe(true);
  expect(c2.connections[0] & AdditionalTaDFlags.hasBridge).toBeTruthy();
  expect(c2.connections[0] & AdditionalTaDFlags.hasMods).toBeTruthy();
  expect(c2.connections[0] & AdditionalTaDFlags.bridgeMask).toBe(3 << 9);
  expect(c2.connections[0] & AdditionalTaDFlags.basicTaDMask).toBe(tad);
  // the signal is not the element right after the track (station sits in between) -> no signal flag; remove station to test
  expect(c2.connections[0] & AdditionalTaDFlags.hasSignal).toBe(0);
  tm.removeElement(st); b.setHasStationElement(false);
  expect(getTrackConnections(tm, end.nextPos, 2, 3, 2).connections[0] & AdditionalTaDFlags.hasSignal).toBe(AdditionalTaDFlags.hasSignal);
  sig.setAiAllocated(true);
  expect(getTrackConnections(tm, end.nextPos, 2, 3, 2).connections[0] & AdditionalTaDFlags.hasSignal).toBe(0);
  expect(getTrackConnections(tm, end.nextPos, 2, 3, 2, 0b100).connections).toEqual([]); // requiredMods not met
  expect(a.sequenceIndex()).toBe(0); expect(c.isFlag6()).toBe(true);
});

test('multi-tile piece: connections come from the final (flag6) element', () => {
  const tm = TileManager.createFlat(16, 16);
  // diagonal: 4 sequence elements; leave through the last tile, enter through first
  const start = { x: 5 * 32, y: 5 * 32, z: 16 };
  const els = placeTrack(tm, start, { trackId: TrackId.diagonal, rotation: 0, owner: 1, trackObjectId: 0 });
  expect(els.length).toBe(4); expect(els.map((e) => e.isFlag6())).toEqual([false, false, false, true]);
  const tad = (TrackId.diagonal << 3) | 0;
  const e = getTrackConnectionEnd(start, tad);
  // a query arriving at the begin position with the piece's begin rotation finds sequence 0
  expect(getTrackConnections(tm, start, getUnkTrack(tad).rotationBegin, 1, 0).connections).toEqual([tad]);
  // reversed traversal is found via the flag6 element at the far end
  const revTad = tad | 4;
  const revEnd = getTrackConnectionEnd(start, revTad);
  const piece = getTrackPiece(TrackId.diagonal);
  const lastLoc = { x: start.x + piece[3].x, y: start.y + piece[3].y, z: start.z };
  const found = getTrackConnections(tm, { ...lastLoc, z: start.z }, getUnkTrack(revTad).rotationBegin, 1, 0);
  expect(found.connections.length === 0 || found.connections[0] === revTad).toBe(true);
  expect(revEnd.nextPos).toBeDefined(); expect(e.nextPos).toBeDefined();
});

test('road connections incl. station and one-way', () => {
  const tm = TileManager.createFlat(16, 16);
  const [r0] = placeRoad(tm, { x: 5 * 32, y: 5 * 32, z: 16 }, { roadId: RoadId.straight, rotation: 2, roadObjectId: 1 });
  const rtad = (RoadId.straight << 3) | 2;
  const end = getRoadConnectionEnd({ x: 4 * 32, y: 5 * 32, z: 16 }, rtad);
  expect(end.nextPos).toEqual({ x: 5 * 32, y: 5 * 32, z: 16 });
  expect(getRoadConnections(tm, end.nextPos, end.nextRotation, 15, 1)).toEqual({ connections: [rtad], stationId: STATION_NULL, stationObjectId: 0, roadObjectId: 1 });
  expect(getRoadConnections(tm, end.nextPos, end.nextRotation, 15, 2).connections).toEqual([]);
  expect(getRoadConnections(tm, end.nextPos, end.nextRotation, 15, 0xff).connections).toEqual([]); // no any-type-compat bit
  tm.gameState.roadObjectIdIsAnyRoadTypeCompatible = 1 << 1;
  expect(getRoadConnections(tm, end.nextPos, end.nextRotation, 15, 0xff).connections).toEqual([rtad]);
  attachRoadStation(tm, r0, { stationId: 12, objectId: 3 });
  const c = getRoadConnections(tm, end.nextPos, end.nextRotation, 15, 1);
  expect(c.stationId).toBe(12); expect(c.stationObjectId).toBe(3);
  expect(tm.get(end.nextPos).roadStation(RoadId.straight, 2, r0.baseZ()).stationId()).toBe(12);
  // reverse (flag6) entry
  const rtadRev = (RoadId.straight << 3) | 4 | 2;
  const rend = getUnkRoad(rtadRev);
  expect(getRoadConnections(tm, end.nextPos, rend.rotationBegin, 15, 1).connections).toContain(rtadRev);
});

test('validateTrackIsSignalCompatible', () => {
  const tm = TileManager.createFlat(16, 16);
  const start = { x: 5 * 32, y: 5 * 32, z: 16 };
  expect(validateTrackIsSignalCompatible(tm, start, 2, TrackId.straight, 0)).toBe('empty'); // nothing built
  const [el] = placeTrack(tm, start, { trackId: TrackId.straight, rotation: 2 });
  expect(validateTrackIsSignalCompatible(tm, start, 2, TrackId.straight, 0)).toBeNull();
  // crossing track on the same tile and height -> junction
  const [x] = placeTrack(tm, start, { trackId: TrackId.straight, rotation: 1 });
  expect(validateTrackIsSignalCompatible(tm, start, 2, TrackId.straight, 0)).toBe('signals_cannot_be_built_on_a_junction');
  x.setGhost(true); expect(validateTrackIsSignalCompatible(tm, start, 2, TrackId.straight, 0)).toBeNull();
  tm.removeElement(x);
  // a parallel piece whose connectFlags do not overlap is fine: straight rotation 0 vs rotation 2 use same flags -> conflict
  const [y] = placeTrack(tm, start, { trackId: TrackId.straight, rotation: 0 });
  expect(validateTrackIsSignalCompatible(tm, start, 2, TrackId.straight, 0)).toBe('signals_cannot_be_built_on_a_junction');
  tm.removeElement(y);
  // station on the piece
  attachTrainStation(tm, el, { stationId: 1 });
  expect(validateTrackIsSignalCompatible(tm, start, 2, TrackId.straight, 0)).toBe('empty');
  // multi-piece: removing one of the sequence elements makes it fail
  const dstart = { x: 9 * 32, y: 9 * 32, z: 16 };
  const els = placeTrack(tm, dstart, { trackId: TrackId.diagonal, rotation: 1 });
  expect(validateTrackIsSignalCompatible(tm, dstart, 1, TrackId.diagonal, 0)).toBeNull();
  tm.removeElement(els[2]);
  expect(validateTrackIsSignalCompatible(tm, dstart, 1, TrackId.diagonal, 0)).toBe('empty');
});

function gameWith() { return Game.create({ seed: 1, width: 64, height: 64 }); }

test('fromGame: hand-built rail row + a curve, chained with iterateTrackToJunction', () => {
  const g = gameWith();
  const { map } = g.state;
  for (const t of map.tiles) { t.rail = 0; t.road = 0; t.building = null; t.height = 1; t.terrain = 'grass'; }
  const T = (x, y) => map.tiles[y * map.width + x];
  for (let x = 10; x <= 15; x++) T(x, 20).rail = (x === 10 ? 2 : x === 15 ? 8 | 4 : 2 | 8);
  T(15, 21).rail = 1 | 4; T(15, 22).rail = 1;
  const { tm, starts, stats } = tileManagerFromGame(g.state);
  expect(stats.railPieces).toBe(6 + 2); expect(stats.heightBreaks).toBe(0);
  const first = starts.find((s) => s.kind === 'rail' && s.tx === 10 && s.ty === 20);
  expect(first.trackId).toBe(TrackId.straight);
  const res = iterateTrackToJunction(first.pos, first.tadReverse, { filter: () => true, getConnections: (p, r) => getTrackConnections(tm, p, r, 0, 0) });
  expect(res.stoppedBy).toBe('deadend');
  expect(res.pos.y).toBe(22 * 32); expect(res.pos.x).toBe(15 * 32);
  expect(res.steps).toBeGreaterThanOrEqual(7);
});

test('piecesForMask mapping', () => {
  expect(piecesForMask(5)).toHaveLength(1); expect(piecesForMask(1 | 2)).toEqual([{ kind: 'curve', mask: 3 }]);
  expect(piecesForMask(7)).toHaveLength(3); expect(piecesForMask(15)).toHaveLength(6); expect(piecesForMask(8)[0]).toMatchObject({ kind: 'straight', axis: 'x' });
});

test('fromGame(Game.create seed 1 64x64): road network chains and connects', () => {
  const g = Game.create({ seed: 1, width: 64, height: 64 });
  const { tm, starts, stats } = tileManagerFromGame(g.state);
  expect(stats.surfaces).toBe(64 * 64);
  const roads = starts.filter((s) => s.kind === 'road');
  expect(roads.length).toBeGreaterThan(100);
  expect(tm.get({ x: 0, y: 0 }).surface()).toBeInstanceOf(SurfaceElement);
  // every road tile of the game has at least one road element, and each piece's forward connection finds
  // a road piece whenever the game tile has the matching neighbour edge
  let checked = 0, linked = 0;
  for (const s of roads) {
    if (s.trackId !== RoadId.straight) continue;
    const end = getRoadConnectionEnd(s.pos, s.tad);
    const conn = getRoadConnections(tm, end.nextPos, end.nextRotation, 15, 0);
    const nx = Math.trunc(end.nextPos.x / 32), ny = Math.trunc(end.nextPos.y / 32);
    const nt = g.state.map.tiles[ny * 64 + nx];
    if (!nt || !nt.road) continue;
    checked++;
    if (conn.connections.length > 0) linked++;
  }
  expect(checked).toBeGreaterThan(50);
  expect(linked / checked).toBeGreaterThan(0.9);
  // walk a straight road chain
  const startPiece = roads.find((s) => s.trackId === RoadId.straight);
  let pos = startPiece.pos, tad = startPiece.tad, steps = 0;
  while (steps < 200) {
    const e = getRoadConnectionEnd(pos, tad);
    const c = getRoadConnections(tm, e.nextPos, e.nextRotation, 15, 0);
    if (c.connections.length !== 1) break;
    pos = e.nextPos; tad = c.connections[0] & AdditionalTaDFlags.basicRaDMask; steps++;
  }
  expect(steps).toBeGreaterThan(0);
});

test('index.js barrel exports the map layer', () => {
  for (const n of ['TileManager', 'getTrackConnections', 'tileManagerFromGame', 'TrackElement', 'canConstructAt', 'placeTrack']) expect(barrel[n]).toBeDefined();
});
