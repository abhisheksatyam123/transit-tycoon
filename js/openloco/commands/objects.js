/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: field names/layout of include/OpenLoco/Objects/{Track,Road,Bridge,TrackExtra,RoadExtra,TrainStation,
 *         RoadStation,TrainSignal,LevelCrossing,Tree}Object.h (only the fields the game commands read).
 *
 * Object data is injected: `ctx.objects` is `{track:[...], road:[...], bridge:[...], trackExtra:[...], roadExtra:[...],
 * trainStation:[...], roadStation:[...], signal:[...], levelCrossing:[...], tree:[...]}` indexed by object id
 * (what the map elements store). createDefaultObjects() returns a minimal, self-consistent set:
 * these are PLACEHOLDER numbers (not copied from any data file) chosen so costs are small round values:
 * all cost factors are in "cost units at inflation factor 1024 / 2^10", i.e. cost == factor at the default inflation.
 */
import { TrackTraitFlags, RoadTraitFlags, CommonTraitFlags } from '../trackEnum.js';

const ALL_TRACK = Object.values(TrackTraitFlags).reduce((a, b) => a | b, 0);
const ALL_ROAD = Object.values(RoadTraitFlags).reduce((a, b) => a | b, 0);

export const RoadObjectFlags = Object.freeze({
  isOneWay: 1, isRail: 2, allowsJunctions: 4, anyRoadTypeCompatible: 8, noSlipSurface: 16, hasRackRail: 32,
  isRoad: 64, allowUseByAllCompanies: 128, canHaveStreetLights: 256,
});
export const RoadStationFlags = Object.freeze({ none: 0, recolourable: 1, passenger: 2, freight: 4, roadEnd: 8 });

/**
 * Default object tables.
 *  track[0]  "railway": all pieces, junctions ok, compatible with itself only, mods [0,1,2,3]; track[1] "monorail" (no junction pieces,
 *            compatible with nothing); trackExtra[0..3] (any piece); road[0] "road" (junctions, isRoad, mods [0,1]); road[1] "tram"
 *            (junctions, tram track, compatible with road[0] and tracks); bridge[0] (maxHeight 8 micro-Z, clearHeight 32, no disabled
 *            config; bridge[1] disables junctions); trainStation[0] (height 16 bigZ = 4 smallZ, all pieces except junction),
 *            roadStation[0] bus stop (all road pieces), roadStation[1] road-end terminal; signal[0]; levelCrossing[0]; tree[0].
 * @param {object} [overrides] per-table replacement, e.g. {track: [...]}.
 */
export function createDefaultObjects(overrides = {}) {
  const straightish = ALL_TRACK & ~TrackTraitFlags.junction;
  const objs = {
    track: [
      { name: 'railway', trackPieces: ALL_TRACK, stationTrackPieces: straightish, mods: [0, 1, 2, 3], compatibleTracks: 0b01, compatibleRoads: 0b11,
        buildCostFactor: 200, sellCostFactor: 150, tunnelCostFactor: 400, costIndex: 0 },
      { name: 'monorail', trackPieces: straightish, stationTrackPieces: straightish, mods: [0, 1, 2, 3], compatibleTracks: 0b10, compatibleRoads: 0,
        buildCostFactor: 300, sellCostFactor: 200, tunnelCostFactor: 400, costIndex: 0 },
    ],
    road: [
      { name: 'road', roadPieces: ALL_ROAD, buildCostFactor: 100, sellCostFactor: 70, tunnelCostFactor: 200, costIndex: 1, mods: [0, 1],
        compatibleRoads: 0b11, compatibleTracks: 0b01, stations: [0, 1],
        flags: RoadObjectFlags.allowsJunctions | RoadObjectFlags.isRoad | RoadObjectFlags.allowUseByAllCompanies },
      { name: 'tram', roadPieces: ALL_ROAD, buildCostFactor: 150, sellCostFactor: 100, tunnelCostFactor: 200, costIndex: 1, mods: [0, 1],
        compatibleRoads: 0b11, compatibleTracks: 0b01, stations: [0],
        flags: RoadObjectFlags.allowsJunctions },
    ],
    bridge: [
      { name: 'girder', maxHeight: 8, clearHeight: 32, costIndex: 2, baseCostFactor: 100, heightCostFactor: 20, sellCostFactor: 80, disabledTrackCfg: 0 },
      { name: 'no-junction', maxHeight: 8, clearHeight: 32, costIndex: 2, baseCostFactor: 100, heightCostFactor: 20, sellCostFactor: 80, disabledTrackCfg: CommonTraitFlags.junction },
    ],
    trackExtra: [0, 1, 2, 3].map((i) => ({ name: `trackmod${i}`, trackPieces: ALL_TRACK, costIndex: 0, buildCostFactor: 40 + i * 10, sellCostFactor: 30 + i * 10 })),
    roadExtra: [0, 1].map((i) => ({ name: `roadmod${i}`, roadPieces: ALL_ROAD, costIndex: 1, buildCostFactor: 20 + i * 10, sellCostFactor: 15 + i * 10 })),
    trainStation: [{ name: 'station', height: 16, trackPieces: straightish, buildCostFactor: 150, sellCostFactor: 100, costIndex: 3 }],
    roadStation: [
      { name: 'bus stop', height: 16, roadPieces: ALL_ROAD, buildCostFactor: 60, sellCostFactor: 40, costIndex: 3, flags: RoadStationFlags.passenger, mods: [0] },
      { name: 'terminal', height: 16, roadPieces: ALL_ROAD, buildCostFactor: 80, sellCostFactor: 50, costIndex: 3, flags: RoadStationFlags.roadEnd | RoadStationFlags.freight, mods: [0] },
    ],
    signal: [{ name: 'semaphore', costFactor: 30, sellCostFactor: 20, costIndex: 0 }],
    levelCrossing: [{ name: 'crossing', costFactor: 25, costIndex: 0 }],
    tree: [{ name: 'tree', clearCostFactor: 8, costIndex: 4 }],
  };
  return { ...objs, ...overrides };
}

/** Look up an object, throwing a clear error if the provider lacks it. */
export function getObject(ctx, table, id) {
  const o = ctx.objects[table] && ctx.objects[table][id];
  if (!o) throw new Error(`openloco commands: missing ${table} object ${id}`);
  return o;
}
