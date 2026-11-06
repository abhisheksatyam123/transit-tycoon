/** Construction / demolition costs (money). */
export const COSTS = {
  rail: 120,
  road: 90,
  /** player bridge: extra per water deck tile (on top of the heads' normal track cost) */
  bridgeRail: 300,
  bridgeRoad: 220,
  /** player rail tunnel: extra per underground tile (on top of normal track cost); portals are normal track */
  tunnelRail: 350,
  railStation: 700,
  roadStop: 500,
  depotRail: 1200,
  depotRoad: 900,
  clearForest: 60,
  clearRock: 120,
  /** T29: removing a farm field (building over it) */
  clearField: 25,
  /** terraform: per height level moved on one tile corner (raise/lower/level, neighbours included) */
  terraformStep: 60,
  /** plant trees: per grass tile turned into forest */
  plantTree: 25,
  demolishTrack: 40,
  /** block signal (OpenTTD CMD_BUILD_SIGNALS): per two-way signal on a straight rail tile; removal refund */
  signal: 60,
  demolishSignal: 20,
  demolishStation: 300,
  demolishDepot: 400,
  demolishHouse: 900,
  demolishAirport: 6000,
  /** airport: flat cost for the 6x4 footprint (hangar depot included) */
  airport: 60000,
  /** monthly upkeep per tile */
  upkeepRail: 2,
  upkeepRoad: 1,
  upkeepStationTile: 12,
  upkeepDepot: 20,
  /** town authority actions (OpenTTD town action costs 2/4/9/35/48/53/117/175, scaled to this money scale) */
  advertiseSmall: 2000,
  advertiseMedium: 4000,
  advertiseLarge: 9000,
  statue: 35000,
  fundBuildings: 48000,
  /** OpenTTD town_action_costs entries 35 (road rebuild), 117 (exclusive rights), 175 (bribe), scaled x1000 like the rest */
  roadRebuild: 35000,
  buyRights: 117000,
  bribe: 175000,
  /** found a town (OpenTTD CMD_FOUND_TOWN): flat price for a new town centre, scaled by inflation */
  foundTown: 40000,
  /** company headquarters (OpenTTD CMD_BUILD_OBJECT OBJECT_HQ): flat price, inflated; relocating costs the same */
  buildHQ: 60000,
};

/** fund a new industry (OpenTTD CMD_BUILD_INDUSTRY): base price per industry type id, before inflation. */
export const INDUSTRY_FUND_COSTS = {
  coal_mine: 90000, power_station: 120000, forest: 60000, sawmill: 80000, oil_wells: 110000,
  refinery: 160000, farm: 70000, factory: 130000, iron_mine: 90000, steel_mill: 150000,
  bank: 150000,
};
