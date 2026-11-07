/**
 * Player bridge types (OpenTTD src/table/bridge_land.h `_orig_bridge`, GPL-2.0 data).
 *
 * Field mapping (OTTD BridgeSpec -> here):
 * - avail_year: TimerGameCalendar::Year{N} -> introYear N (CalendarTime::MIN_YEAR -> 0 = always available).
 * - min_length / max_length: OTTD counts tiles *between* the two heads (heads not counted). Our build span
 *   counts the heads too (MAX_BRIDGE_LENGTH = 12 heads included), so span = length + 2 tiles. UINT16_MAX = no limit.
 * - price: OTTD price multiplier in 1/256ths style units (80 = wooden). costMult = price / 80, applied to the
 *   bridge surcharge per deck tile (config/costs.js bridgeRail / bridgeRoad). Wooden (the untyped default) = 1.0.
 * - speed: OTTD BridgeSpec::speed, "1 unit = 1/1.6 mph = 1 km-ish/h", so the value is km/h. A typed bridge caps a
 *   train or road vehicle on its tiles at this speed (OTTD train_cmd.cpp:437, roadveh likewise).
 * Palette/sprite/pillar fields are not modelled: the deck sprite is shared (renderer/pack/bridges.js).
 *
 * The untyped default bridge (tile.bridgeType absent) is the old single bridge: no speed cap, cost x1.
 */

export const UNLIMITED = Infinity;

/** Ordered as in the OTTD table. `id` is what tiles store in tile.bridgeType. */
export const BRIDGE_TYPES = [
  { id: 'wooden', name: 'Wooden', introYear: 0, minLen: 0, maxLen: UNLIMITED, price: 80, speed: 32 },
  { id: 'concrete', name: 'Concrete', introYear: 0, minLen: 0, maxLen: 2, price: 112, speed: 48 },
  { id: 'girder_steel', name: 'Girder, Steel', introYear: 1930, minLen: 0, maxLen: 5, price: 144, speed: 64 },
  { id: 'suspension_concrete', name: 'Suspension, Concrete', introYear: 0, minLen: 2, maxLen: 10, price: 168, speed: 80 },
  { id: 'suspension_steel', name: 'Suspension, Steel', introYear: 1930, minLen: 3, maxLen: UNLIMITED, price: 185, speed: 96 },
  { id: 'suspension_steel_2', name: 'Suspension, Steel (yellow)', introYear: 1930, minLen: 3, maxLen: UNLIMITED, price: 192, speed: 112 },
  { id: 'cantilever_steel', name: 'Cantilever, Steel', introYear: 1930, minLen: 3, maxLen: 7, price: 224, speed: 160 },
  { id: 'cantilever_steel_2', name: 'Cantilever, Steel (brown)', introYear: 1930, minLen: 3, maxLen: 8, price: 232, speed: 208 },
  { id: 'cantilever_steel_3', name: 'Cantilever, Steel (red)', introYear: 1930, minLen: 3, maxLen: 9, price: 248, speed: 240 },
  { id: 'girder_steel_2', name: 'Girder, Steel (2)', introYear: 1930, minLen: 0, maxLen: 2, price: 240, speed: 256 },
  { id: 'tubular_steel', name: 'Tubular, Steel', introYear: 1995, minLen: 2, maxLen: UNLIMITED, price: 255, speed: 320 },
  { id: 'tubular_steel_2', name: 'Tubular, Steel (2005)', introYear: 2005, minLen: 2, maxLen: UNLIMITED, price: 380, speed: 512 },
  { id: 'tubular_silicon', name: 'Tubular, Silicon', introYear: 2010, minLen: 2, maxLen: UNLIMITED, price: 510, speed: 608 },
];

const BY_ID = new Map(BRIDGE_TYPES.map((t) => [t.id, t]));

/** Type record for an id, or null for unknown ids (the untyped default is handled by callers). */
export function bridgeType(id) { return (id != null && BY_ID.get(id)) || null; }

/** Cost multiplier relative to the untyped bridge (= wooden price). */
export function bridgeCostMult(type) { return type.price / BRIDGE_TYPES[0].price; }

/** Bridge types available in `year` (OTTD avail_year). */
export function bridgeTypesAvailable(year) { return BRIDGE_TYPES.filter((t) => t.introYear === 0 || year >= t.introYear); }

/** Span limits in tiles, heads included: [min, max] (OTTD min/max_length + 2 heads). */
export function bridgeSpanLimits(type) { return [type.minLen + 2, type.maxLen === UNLIMITED ? UNLIMITED : type.maxLen + 2]; }

/** 'auto' choice (bridge tool default): the fastest type available in `year` whose span limits fit `len` tiles (heads included). */
export function autoBridgeType(year, len) {
  let best = null;
  for (const t of bridgeTypesAvailable(year)) {
    const [lo, hi] = bridgeSpanLimits(t);
    if (len >= lo && len <= hi && (!best || t.speed > best.speed)) best = t;
  }
  return best;
}
