/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: include/OpenLoco/Map/Track/TrackEnum.h, include/OpenLoco/Map/Track/TrackModSection.h,
 *         include/OpenLoco/Map/Tile.h (kRotationOffset), src/OpenLoco/Map/Track/Track.h (AdditionalTaDFlags)
 * Enum values and bit masks are identical to the C++ originals.
 */

/** TrackId — Locomotion track piece identifiers. */
export const TrackId = Object.freeze({
  straight: 0,
  diagonal: 1,
  leftCurveVerySmall: 2,
  rightCurveVerySmall: 3,
  leftCurveSmall: 4,
  rightCurveSmall: 5,
  leftCurve: 6,
  rightCurve: 7,
  leftCurveLarge: 8,
  rightCurveLarge: 9,
  diagonalLeftCurveLarge: 10,
  diagonalRightCurveLarge: 11,
  sBendLeft: 12,
  sBendRight: 13,
  straightSlopeUp: 14,
  straightSlopeDown: 15,
  straightSteepSlopeUp: 16,
  straightSteepSlopeDown: 17,
  leftCurveSmallSlopeUp: 18,
  rightCurveSmallSlopeUp: 19,
  leftCurveSmallSlopeDown: 20,
  rightCurveSmallSlopeDown: 21,
  leftCurveSmallSteepSlopeUp: 22,
  rightCurveSmallSteepSlopeUp: 23,
  leftCurveSmallSteepSlopeDown: 24,
  rightCurveSmallSteepSlopeDown: 25,
  // OneSided pieces
  straightLeftSide: 26,
  straightRightSide: 27,
  leftCurveVerySmallInner: 28,
  leftCurveVerySmallOuter: 29,
  rightCurveVerySmallOuter: 30,
  rightCurveVerySmallInner: 31,
  sBendLeftSideToRightSide: 32,
  sBendRightSideToLeftSide: 33,
  straightLeftSideSteepSlopeUp: 34,
  straightRightSideSteepSlopeUp: 35,
  straightLeftSideSteepSlopeDown: 36,
  straightRightSideSteepSlopeDown: 37,
  sBendSingleToLeftSide: 38,
  sBendSingleToRightSide: 39,
  sBendLeftSideToSingle: 40,
  sBendRightSideToSingle: 41,
  turnaroundClockwise: 42,
  turnaroundAnticlockwise: 43,
});

/** RoadId — Locomotion road piece identifiers. */
export const RoadId = Object.freeze({
  straight: 0,
  leftCurveVerySmall: 1,
  rightCurveVerySmall: 2,
  leftCurveSmall: 3,
  rightCurveSmall: 4,
  straightSlopeUp: 5,
  straightSlopeDown: 6,
  straightSteepSlopeUp: 7,
  straightSteepSlopeDown: 8,
  turnaround: 9,
});

/** CommonTraitFlags — shared by track and road misc data (.flags). */
export const CommonTraitFlags = Object.freeze({
  none: 0,
  slope: 1 << 0,
  steepSlope: 1 << 1,
  curveSlope: 1 << 2,
  diagonal: 1 << 3,
  verySmallCurve: 1 << 4,
  smallCurve: 1 << 5,
  curve: 1 << 6,
  largeCurve: 1 << 7,
  sBendCurve: 1 << 8,
  oneSided: 1 << 9,
  startsAtHalfHeight: 1 << 10,
  junction: 1 << 11,
});

/** TrackTraitFlags — track compatibility mask (.compatibleFlags). */
export const TrackTraitFlags = Object.freeze({
  none: 0,
  diagonal: 1 << 0,
  largeCurve: 1 << 1,
  normalCurve: 1 << 2,
  smallCurve: 1 << 3,
  verySmallCurve: 1 << 4,
  slope: 1 << 5,
  steepSlope: 1 << 6,
  oneSided: 1 << 7,
  slopedCurve: 1 << 8,
  sBend: 1 << 9,
  junction: 1 << 10,
});

/** RoadTraitFlags — road compatibility mask (.compatibleFlags). */
export const RoadTraitFlags = Object.freeze({
  none: 0,
  smallCurve: 1 << 0,
  verySmallCurve: 1 << 1,
  slope: 1 << 2,
  steepSlope: 1 << 3,
  unk4: 1 << 4,
  turnaround: 1 << 5,
  junction: 1 << 6,
});

/** PreviewTrackFlags — bit flags stored per tile of a track/road piece. */
export const PreviewTrackFlags = Object.freeze({
  none: 0,
  unk0: 1 << 0,
  unk1: 1 << 1,
  unk2: 1 << 2,
  unk3: 1 << 3,
  unk4: 1 << 4,
  unused: 1 << 6,
  diagonal: 1 << 7,
});

/** AdditionalTaDFlags — bits OR'd into a trackAndDirection value (Track.h). */
export const AdditionalTaDFlags = Object.freeze({
  basicTaDMask: 0b0000_0001_1111_1111,
  basicRaDMask: 0b0000_0000_0111_1111,
  bridgeMask: 0b0000_1110_0000_0000,
  isOvertaking: 1 << 7,
  isChangingLane: 1 << 8,
  hasBridge: 1 << 12,
  hasMods: 1 << 13,
  hasSignal: 1 << 15,
  basicTaDWithSignalMask: 0b0000_0001_1111_1111 | (1 << 15),
  basicRaDWithSignalMask: 0b0000_0000_0111_1111 | (1 << 15),
});

/** ModSection (TrackModSection.h) — how track mods apply. */
export const ModSection = Object.freeze({ single: 0, block: 1, allConnected: 2 });

/** trackAndDirection value meaning "no track" (Track.cpp: kNullTad). */
export const NULL_TAD = 0xffff;

/** kRotationOffset (Tile.h) — world-unit (32 = 1 tile) offset per rotation index 0..15. */
export const ROTATION_OFFSET = Object.freeze([
  Object.freeze({ x: -32, y: 0 }),
  Object.freeze({ x: 0, y: 32 }),
  Object.freeze({ x: 32, y: 0 }),
  Object.freeze({ x: 0, y: -32 }),
  Object.freeze({ x: -32, y: 0 }),
  Object.freeze({ x: 0, y: 32 }),
  Object.freeze({ x: 32, y: 0 }),
  Object.freeze({ x: 0, y: -32 }),
  Object.freeze({ x: -32, y: 0 }),
  Object.freeze({ x: 0, y: 32 }),
  Object.freeze({ x: 32, y: 0 }),
  Object.freeze({ x: 0, y: -32 }),
  Object.freeze({ x: -32, y: 32 }),
  Object.freeze({ x: 32, y: 32 }),
  Object.freeze({ x: 32, y: -32 }),
  Object.freeze({ x: -32, y: -32 }),
]);
