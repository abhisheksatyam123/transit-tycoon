/**
 * TY4 toyland infrastructure overrides: OpenGFX toyland replaces base sprite blocks with toyland art (the
 * ogfxt_toyland.pnml / sprites/toyland/*.pnml sets). Each entry is [toylandFirst, toylandLast, baseFirst]: toyland
 * sprite id t is the art of base sprite id t + (baseFirst - toylandFirst). Verified by sprite size and anchor against
 * the base definitions (tools/ogfx/pnml.js readSpriteDefs), except where noted in the comment.
 * Shared by the extractor (tools/ogfx/extract_toyland.js, which packs these toyland ids) and the runtime view
 * (pack/toyland.js, which redirects the base ids). Blocks with no verified base counterpart are left out
 * (streetlights 172-173, signals 271-286 (drawn procedurally, no sprite), monorail/maglev 206-244 (the game has no such track),
 * GUI, bridge block 1066-1145, rail stations 575-580 and 1087-1098 (no verified base counterpart)).
 * GPL-2.0 (OpenGFX).
 */
export const TOYLAND_OVERRIDE_BLOCKS = [
  // terrain: bare 0-56 -> 3924, grass 57-75 -> 3981 (the toffee quarry ground), water and shore 76-84 -> 4061,
  // rough 86-108 -> 4000, rocks 109-127 -> 4023
  [0, 56, 3924], [57, 75, 3981], [76, 84, 4061], [86, 108, 4000], [109, 127, 4023],
  // city roads 134-152 -> 1313, roads 153-171 -> 1332, rail 174-205 -> 1005
  [134, 152, 1313], [153, 171, 1332], [174, 205, 1005],
  // rail level crossings 287-298 -> 1370, 299-310 -> 1382, rail depot 311-316 -> 1063, rail stations 557-560 -> 1069,
  // 563-566 -> 1075 (size and anchor verified)
  [287, 298, 1370], [299, 310, 1382], [311, 316, 1063], [557, 560, 1069], [563, 566, 1075],
  // rail fences 587-594 -> 1301 (anchors differ by 1px; the toyland anchors are used)
  [587, 594, 1301],
  // bus stops 476-491 -> 2692, truck stops 492-507 -> 2708, docks 508-513 -> 2727
  [476, 491, 2692], [492, 507, 2708], [508, 513, 2727],
  // foundations 543-556 -> 990
  [543, 556, 990],
  // road depot 595-600 -> 1408
  [595, 600, 1408],
  // bridges 902-1057 -> 2437
  [902, 1057, 2437],
  // rail tunnels 1146-1169 -> 2365, road tunnels 1170-1177 -> 2389
  [1146, 1169, 2365], [1170, 1177, 2389],
  // TY6 brick station buildings 581-582 -> 1073/1074: see TOYLAND_LATE_BLOCKS
  [581, 582, 1073],
];

/**
 * Toyland ids packed by the extractor but not mapped in the view (TY6): their size/anchor does not match a base
 * sprite (561-562 and 567-574 against base 1073-1086). Same [toylandFirst, toylandLast, baseFirst] form; baseFirst
 * is the nominal slot, unused at runtime.
 */
export const TOYLAND_PACK_ONLY_BLOCKS = [[561, 562, 1073], [567, 574, 1079]];

/**
 * TY6 late blocks: packed after the vehicles (order 450000+) so earlier atlas positions do not move, and mapped in the view.
 * 581-582 are the brick station buildings (base 1073/1074, drawn by pack/transport.js); size and anchor match exactly.
 */
export const TOYLAND_LATE_BLOCKS = [[581, 582, 1073]];
