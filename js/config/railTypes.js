/**
 * Rail types (OpenTTD RailType, rail_type.h:25-33 RAILTYPE_RAIL / ELECTRIC / MONO / MAGLEV).
 * Track type is a lazy tile field `tile.trk` (absent = plain rail, id 0). Electric is NOT a track type here:
 * it stays the separate `tile.elec` catenary flag (cmdElectrify.js); RAILTYPE_ELECTRIC appears only as a
 * selector entry that sets the flag on the line being built.
 *
 * Costs: OpenTTD RailBuildCost = BuildRail price * cost_multiplier >> 3 (rail.h:448-451). The multipliers
 * below are the railtypes.h "cost multiplier" entries: rail 8 (railtypes.h:79-80), electric 12 (:181-182),
 * monorail 16 (:279-280), maglev 24 (:377-378). TT COSTS.rail (120) is the x8 base, so monorail = 2x.
 * Intro: OpenTTD railtypes.h gives the monorail / maglev track type INVALID_DATE, i.e. it is introduced by its
 * first engine (engines.h monorail X2001 row 54 intro 28490 days = 1998; maglev Lev1 row 84 intro 36525 = 2020).
 */
import { COSTS } from './costs.js';

export const RAIL_TYPE_RAIL = 0;
export const RAIL_TYPE_MONO = 2;
export const RAIL_TYPE_MAGLEV = 3;

/** id -> {id, name, key (selector label), costMul, introYear (0 = always), engine (the OTTD intro engine)} */
export const RAIL_TYPES = {
  0: { id: 0, name: 'Rail', costMul: 8, introYear: 0, engine: null },
  2: { id: 2, name: 'Monorail', costMul: 16, introYear: 1998, engine: 'eng_mono_x2001' },
  3: { id: 3, name: 'Maglev', costMul: 24, introYear: 2020, engine: 'eng_maglev_lev1' },
};

/** Track-type ids with a non-zero id (monorail, maglev). */
export const SPECIAL_RAIL_TYPES = [RAIL_TYPE_MONO, RAIL_TYPE_MAGLEV];

/** Selector cycle of the rail tool: plain rail, electric (catenary flag), then the special track types. */
export const RAIL_SELECTOR = ['rail', 'electric', 'mono', 'maglev'];

/** Track type id (0..3) of a selector entry. */
export function selectorTrack(sel) {
  return sel === 'mono' ? RAIL_TYPE_MONO : sel === 'maglev' ? RAIL_TYPE_MAGLEV : RAIL_TYPE_RAIL;
}

/** True when the track type can be built in `year` (OpenTTD: introduced with its first engine). */
export function trackTypeAvailable(id, year) {
  const t = RAIL_TYPES[id];
  return !!t && (t.introYear === 0 || year >= t.introYear);
}

/** Build cost per tile (money, before construction inflation): OpenTTD RailBuildCost (rail.h:448-451). */
export function railBuildCost(id) {
  return Math.round(COSTS.rail * RAIL_TYPES[id].costMul / 8);
}

/** Convert cost per tile (OpenTTD RailConvertCost, rail.h:476-): monorail and maglev have no upgrade path
 * (no powered-rail link), so converting costs a rebuild: build(to) + clearing the old track. */
export function railConvertCost(to) {
  return railBuildCost(to) + COSTS.demolishTrack;
}
