/**
 * TY5 toyland vehicle art (OpenTTD toyland engines, table/engines.h Y climate). Each toyland model maps to the first
 * OpenGFX toyland sprite id of its art block (toyland-grf numbers, sprites/toyland/toyland-0601/0761/0841/0393 pnml):
 * road vehicles and 8-view locos take 8 consecutive ids (one per OpenTTD direction), 4-view wagons take 4.
 * `loaded` is the id of the loaded block (second block of a cargo pair), or null when the art has no loaded variant.
 * Packed by tools/ogfx/extract_toyland.js under key TOYLAND_VEH_KEY + id, so no existing manifest key moves.
 * Used only by the toyland view (pack/toyland.js) and by drawPackVehicle when the view is active; without the toyland
 * pack the temperate stand-in art (pack/vehicles.js ROAD_IMG / WAGON_IMG / RAIL_IMG) is drawn.
 * GPL-2.0 (OpenGFX).
 */
export const TOYLAND_VEH_KEY = 20000;

/** model id -> { kind: 'road'|'loco'|'wagon', base: first toyland id (dir 0), loaded: toyland id or null, views: 8|4 }. */
export const TOYLAND_VEH_ART = {
  // toyland buses: Ploddyphut MkI..III share the one toyland bus block (601)
  bus_ploddy1: { kind: 'road', base: 601, loaded: null, views: 8 },
  bus_ploddy2: { kind: 'road', base: 601, loaded: null, views: 8 },
  bus_ploddy3: { kind: 'road', base: 601, loaded: null, views: 8 },
  // toyland road trucks (cargo pairs: empty, loaded)
  trk_sugar: { kind: 'road', base: 609, loaded: 617, views: 8 },
  trk_cola: { kind: 'road', base: 625, loaded: 633, views: 8 },
  trk_candyfloss: { kind: 'road', base: 641, loaded: 649, views: 8 },
  trk_toffee: { kind: 'road', base: 657, loaded: 665, views: 8 },
  trk_toys: { kind: 'road', base: 673, loaded: null, views: 8 },
  trk_sweets: { kind: 'road', base: 689, loaded: null, views: 8 },
  trk_batteries: { kind: 'road', base: 697, loaded: 705, views: 8 },
  trk_fizzy: { kind: 'road', base: 713, loaded: 721, views: 8 },
  trk_plastic: { kind: 'road', base: 729, loaded: 737, views: 8 },
  trk_bubbles: { kind: 'road', base: 745, loaded: 753, views: 8 },
  // toyland locos (8-view): Powernaut Choo-Choo 393, Ploddyphut 841, MightyMover 849, Ploddyphut Diesel 857, Powernaut Diesel 865
  eng_powernaut_choo: { kind: 'loco', base: 393, loaded: null, views: 8 },
  eng_ploddy_choo: { kind: 'loco', base: 841, loaded: null, views: 8 },
  eng_mighty_choo: { kind: 'loco', base: 849, loaded: null, views: 8 },
  eng_ploddy_diesel: { kind: 'loco', base: 857, loaded: null, views: 8 },
  eng_powernaut_diesel: { kind: 'loco', base: 865, loaded: null, views: 8 },
  // toyland wagons (4-view, empty then loaded block)
  wag_sugar: { kind: 'wagon', base: 769, loaded: 773, views: 4 },
  wag_candyfloss: { kind: 'wagon', base: 777, loaded: 781, views: 4 },
  wag_toffee: { kind: 'wagon', base: 785, loaded: 789, views: 4 },
  wag_bubbles: { kind: 'wagon', base: 793, loaded: 797, views: 4 },
  wag_cola: { kind: 'wagon', base: 801, loaded: 805, views: 4 },
  wag_sweets: { kind: 'wagon', base: 809, loaded: null, views: 4 },
  wag_toys: { kind: 'wagon', base: 813, loaded: null, views: 4 },
  wag_batteries: { kind: 'wagon', base: 817, loaded: 821, views: 4 },
  wag_fizzy: { kind: 'wagon', base: 825, loaded: 829, views: 4 },
  wag_plastic: { kind: 'wagon', base: 833, loaded: 837, views: 4 },
};

/** Every toyland sprite id the vehicle art needs (base and loaded blocks, all views), sorted. */
export function toylandVehicleSprites() {
  const out = new Set();
  for (const a of Object.values(TOYLAND_VEH_ART)) {
    for (const b of [a.base, a.loaded]) if (b) for (let v = 0; v < a.views; v++) out.add(b + v);
  }
  return [...out].sort((x, y) => x - y);
}

/**
 * Toyland sprite id for a model facing OpenTTD direction dir (0..7), or undefined when the model has no toyland art.
 * @param {string} model
 * @param {number} dir
 * @param {boolean} loaded
 * @returns {number|undefined} key in the toyland view pack (TOYLAND_VEH_KEY + toyland id)
 */
export function toylandVehicleSpriteId(model, dir, loaded) {
  const a = TOYLAND_VEH_ART[model];
  if (!a) return undefined;
  const d = ((dir | 0) % 8 + 8) % 8;
  const block = loaded && a.loaded ? a.loaded : a.base;
  const t = a.views === 8 ? block + d : block + (d & 3);
  return TOYLAND_VEH_KEY + t;
}
