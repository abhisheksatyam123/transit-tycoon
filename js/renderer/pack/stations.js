/**
 * OpenGFX rail station and road stop sprites. Ported from OpenTTD src/station_cmd.cpp
 * (_station_display_datas_rail: track sprite on the station axis) and table/station_land.h
 * road stop layout (SPR_BUS_STOP_DT_* / SPR_TRUCK_STOP_DT_* = 2692 + 0..7, OpenGFX road stops
 * 2692-2723) (GPL-2.0). Our station axis 'y' -> OpenTTD Y-axis track (our N|S); 'x' -> our E|W.
 */

/** Rail station ground/track ids for a station axis ('x' or 'y'). */
export function railStationIds(axis) {
  return axis === 'y' ? [3981, 1012] : [3981, 1011];
}

/**
 * Road stop overlay ids. Drive-through stop sprites: W/E halves of the X and Y axis, offsets
 * 0..3 = bus (Y_W, Y_E, X_W, X_E), 4..7 = truck.
 * @param {'bus'|'truck'} kind
 * @param {number} mask road mask of the stop (N|S = 5 is X axis, E|W = 10 is Y axis)
 * @returns {number[]} stop overlay ids (empty when unknown)
 */
export function roadStopIds(kind, mask) {
  const base = (kind === 'truck' ? 2696 : 2692) + (mask === 5 ? 2 : 0);
  if (mask !== 5 && mask !== 10) return [];
  return [base, base + 1];
}
