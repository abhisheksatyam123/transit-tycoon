/**
 * Sprite id ranges extracted from OpenGFX (temperate set). Every group name is also written to
 * manifest.groups so the renderer can look up ids by name. Ranges are inclusive [from, to].
 */
export const GROUPS = {
  // terrain (templates: 3924 bare, 3981 grass (+slope offset 0..18), 4000 rough, 4023 rocks)
  'terrain.bare': [[3924, 3942]],
  'terrain.grass': [[3981, 3999]],
  'terrain.rough': [[4000, 4022]],
  'terrain.rocks': [[4023, 4041]],
  'water.flat': [[4061, 4061]],
  'water.shore': [[4062, 4069]],
  // trees (temperate wide/leaf/conifer; first 189 ids of 1576..)
  'trees.temperate': [[1576, 1764]],
  // roads: 1313-1331 paved city straights/junctions, 1332-1350 grass road, 1370-1405 level crossings, 1408-1413 depot
  'roads.city': [[1313, 1331]],
  'roads.grass': [[1332, 1350]],
  'roads.crossings': [[1370, 1405]],
  'roads.depot': [[1408, 1413]],
  // rail: 1005-1010 overlays, 1011-1036 track on grass, 1063-1068 depot, 1069-1086 station
  'rail.overlays': [[1005, 1010]],
  'rail.grass': [[1011, 1036]],
  'rail.depot': [[1063, 1068]],
  'rail.station': [[1069, 1086]],
  // houses (1420 plain paved, 1421-1575 buildings incl. church)
  'houses': [[1420, 1575]],
  // road/rail vehicles, aircraft, airport objects, stops
  'roadveh.buses': [[3092, 3667]],
  'rail.engines': [[2905, 2920]],
  'rail.wagons': [[2733, 2740]],
  'roadstops': [[2692, 2700]],
  'aircraft': [[3741, 3760]],
  'airport': [[2633, 2700]],
  'foundations': [[989, 1004]],
  // full temperate base ranges (OpenTTD port: every world sprite the base set provides)
  'all.rail_infra': [[1005, 1308]],
  'all.road_infra': [[1309, 1419]],
  'all.trees': [[1576, 2010]],
  'all.industries': [[2011, 2364]],
  'all.tunnels_bridges': [[2365, 2600]],
  'all.objects_airports_stops': [[2601, 2732]],
  'all.rail_vehicles': [[2733, 3016]],
  'all.effects': [[3073, 3091]],
  'all.road_vehicles': [[3092, 3667]],
  'all.ships_smoke_aircraft': [[3668, 3923]],
  'all.terrain_water': [[3924, 4076]],
  'all.farm_fields': [[4090, 4296]],
  // arctic-file rail vehicles (3017..3072): OpenTTD temperate engines also use some of these (e.g. Wills 2-8-0 = 3041)
  'all.rail_vehicles_arctic': [[3017, 3072]],
  // SPR_IMG_BUOY (693): the OpenGFX buoy art (base set has it only as the GUI icon; 4076 is an empty placeholder)
  'ships.buoy': [[693, 693]],
};
