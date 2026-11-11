/**
 * Game settings (difficulty / gameplay options), stored in state.settings.
 * Random-world games do not create state.settings (so day-0 hashes are unchanged); read options with getSetting(),
 * which falls back to DEFAULT_SETTINGS. The Settings window and scenarios write values with setSetting().
 */

/** Defaults; adding a key here must keep current behaviour for existing games. */
export const DEFAULT_SETTINGS = {
  /** OpenTTD-style: towns spawn private cars on roads. Off = no private car traffic. */
  townTraffic: true,
  /** monthly inflation of costs and cargo payments (OpenLoco Economy::updateMonthly) */
  /** building eras (gap #31b): towns build period-appropriate houses by year. Off = unchanged. */
  buildingEras: false,
  /** multi-tile houses (OpenTTD 1x2 / 2x2 temperate houses, largeHouses.js): towns may build them. Off = unchanged. */
  largeHouses: false,
  inflation: true,
  /** loan interest rate in OpenLoco units (percent per year, charged monthly as loan*rate/1200; World/Company.cpp:724). Editor default 10 in OL; 5 here keeps existing games unchanged. */
  loanInterestRate: 5,
  /** OpenLoco: max loan is inflation-adjusted (CompanyManager.cpp:1191, ChangeLoan.cpp getInflationAdjustedCost(ci 0, div 8)). Off keeps flat MAX_LOAN so current games/hash unchanged. */
  inflationAdjustsMaxLoan: false,
  /** cargo payment rate in percent of the OpenLoco formula (Moscow scenario uses less: busy prebuilt network) */
  cargoPaymentPercent: 100,
  /** OpenTTD difficulty.vehicle_costs: percent scale on vehicle purchase prices and monthly running costs (prices.js vehiclePrice, loco/vehicle.js monthlyRunningCost). 100 = unchanged. */
  vehicleCostPercent: 100,
  /** OpenTTD difficulty.construction_cost: percent scale on all construction, demolition and terraform costs (prices.js constructionTotal/buildCost). 100 = unchanged. */
  constructionCostPercent: 100,
  /** OpenTTD cargo aging in vehicles: cargo ages in 2.5-day periods while carried, so payment uses whole periods (orders.js transitDays). Off = continuous days. */
  cargoAgeInVehicle: false,
  /** vehicle breakdowns: 'none' | 'reduced' | 'normal' */
  breakdowns: 'normal',
  /** subsidies offered monthly */
  subsidies: true,
  /** OpenTTD difficulty.subsidy_multiplier as a payment multiplier (x2 default = current). Read when a subsidy is awarded; old awards keep theirs. */
  subsidyMultiplier: 2,
  /** OpenTTD difficulty.subsidy_duration: months an awarded subsidy lasts (12 = current). Read when awarded. */
  subsidyMonths: 12,
  /** OpenTTD vehicle.never_expire_vehicles: models never become obsolete (obsoleteYear is ignored for purchase). Off = unchanged. */
  neverExpireVehicles: false,
  /** OpenTTD vehicle.extend_vehicle_life: extends the maximum operational lifetime of all vehicle models by N years (0..30). Default 0 = unchanged. */
  extendVehicleLife: 0,
  /**
   * default service interval in days for NEW vehicles (0 = off). Only read when a vehicle is bought, so
   * the default can change without touching existing vehicles. Kept at 0 so existing games are unchanged.
   */
  serviceIntervalDays: 0,
  /** autorenew (OpenTTD/OpenLoco autoreplace by age): a vehicle past its max age that is stopped in a depot is replaced by a new one of the same model (price minus resale). Off by default. */
  autorenew: false,
  /** platformLength (OpenTTD economy.cpp LoadUnloadVehicle): a train longer than its platform loads and unloads only the wagons inside it. Off = unchanged. */
  platformLength: false,
  /** OpenTTD order.station_length_loading_penalty (def true in OpenTTD; TT default off = unchanged): a train longer than its platform takes longer to load (platformLength.js loadingTicksFor). */
  stationLengthLoadingPenalty: false,
  /** OpenTTD order.gradual_loading (def true in OpenTTD; TT default off = one-step loading): vehicles load in cycles of their load amount per part (gradualLoad.js). */
  gradualLoading: false,
  /** OpenTTD difficulty.infinite_money (def false): companies can always pay; affordability and bankruptcy checks are skipped (settings.js infiniteMoney). */
  infiniteMoney: false,
  /** OpenTTD economy.cargo_aging_rate (percent, def 100): scales the transit days used for cargo payment (economy.cpp GetTransportedGoodsIncome). */
  cargoAgingRate: 100,
  /** OpenTTD order.serviceathelipad (def true in OpenTTD; TT default off = current behaviour): a helicopter stopped on a helipad is serviced. */
  serviceAtHelipad: false,
  /** OpenTTD economy.found_town (def Forbidden in OpenTTD; TT default 'allowed' = current behaviour): 'forbidden' refuses new towns. */
  townFounding: 'allowed',
  /** pathCosts: OpenTTD YAPF-like rail pathfinder costs (slopes, curves, station bypass, occupied blocks, red signals). Off by default: preserves determinism. */
  pathCosts: false,
  /** tree growth: forest tiles occasionally spread to adjacent free grass once a month (treeGrowth.js). Off by default. */
  treeGrowth: false,
  /** autoslope (OpenTTD construction.autoslope): terraform under rail/road is allowed when every affected track stays on a valid slope (cmdTerraform.js). Off by default. */
  autoslope: false,
  /** gradients: OL pitch force (Vehicle2.cpp:193): uphill slopes subtract weight*sin*256 ebp from the tractive term, downhill adds it (vehicleMotion.gradeMph / landSpeedStep); heavy trains on steep grades stall. Off by default: changes deterministic results. */
  gradients: false,
  /** trainAcceleration: 'original' (current TT model, default) | 'realistic' (OTTD curve speed limits + tractive effort / drag / slope acceleration, loco/trainRealistic.js). Changes results; off by default. */
  trainAcceleration: 'original',
  /** roadOvertaking: OpenTTD road vehicle overtaking (roadOvertake.js): a faster road vehicle passes a slower one on a straight plain road when the opposite lane is free. Trams never. Off by default: changes results. */
  roadOvertaking: false,
  /** OpenTTD pf.roadveh_queue (pathfinding_settings.ini, def true; roadveh_cmd.cpp:919): a road vehicle waits for
   * a free bay at a road stop and enters when one frees. True = current TT behaviour (road vehicles always queue).
   * False = a road vehicle does not enter a stop that has no free bay; it keeps driving and comes back. */
  roadvehQueue: true,
  /** tramCurveCap: OpenTTD tram corner speed limits (GetCurveSpeedLimit via RoadVeh tram): trams take corners at capped speed instead of the OpenLoco road fraction. Off = trams use the road curve fraction like buses/trucks. */
  tramCurveCap: false,
  /** exclusive engine preview (OpenTTD engine.cpp): a new model is first offered to one company for a year. Off = unchanged. */
  enginePreview: false,
  /** shares: OpenTTD company shares (4 x 25%) in rival companies; the 4th share takes the company over (shares.js). Off by default. */
  shares: false,
  /** T29 OpenTTD temperate bank (produces/accepts Valuables) placed in towns of 1200+ people by the map generator. Off by default. */
  extraIndustries: false,
  /** OpenTTD economy.spawn_primary_industry_only (economy_settings.ini, def false): new and generated industries are raw (primary) types only; processing industries are not created. Existing industries are kept. */
  spawnPrimaryIndustryOnly: false,
  /** OpenTTD vehicle.disable_elrails (game_settings.ini, def false): electric engines may run on non-electrified track (the electrify requirement is dropped). Off = electric engines need catenary (current). */
  disableElrails: false,
  /** OpenTTD difficulty.train_flip_reverse_allowed (def 'all'): 'all' = trains may turn around anywhere; 'endOfLine' = only where the track ends (one rail link); 'none' = trains never turn around (they wait). Applies to the reverse command and to blocked-train turnarounds. */
  trainFlipReverse: 'all',
  /** OpenTTD pf.reverse_at_signals (pathfinding_settings.ini:55, def true): a train held at a red signal turns round after the blocked timeout. TT already did this (movement.js hold, BLOCK_TIMEOUT_TICKS), so true = current behaviour. Off = trains wait at red signals and never turn round. */
  reverseAtSignals: true,
  /** OpenTTD vehicle.smoke_amount (def 2): 0 = no vehicle smoke, 1 = half as much (chance halved), 2 = normal. Render-only (renderer/vehicleFx.js); no effect on simulation. */
  smokeAmount: 2,
  /** OpenTTD economy.larger_towns (town_cmd.cpp:2441, def 0): every Nth generated town is a city (random phase). 0 = no cities (no draws). */
  largerTowns: 0,
  /** OpenTTD economy.town_min_distance (town_cmd.cpp:373): minimum Manhattan distance between generated towns. 0 = automatic spacing (towns.js). */
  townMinDistance: 0,
  /** OpenTTD economy.initial_city_size (town_cmd.cpp:2063, def 2): layout size multiplier for city towns at generation (normal towns 1-3, capped at 6). */
  initialCitySize: 2,
  /** OpenTTD economy.multiple_industry_per_town: allow more than one industry of the same type in/near a town. Off = one of each type per town. */
  multipleIndustryPerTown: false,
  /** OpenTTD construction.raw_industry_construction (settings_type.h:496): 'normal' funds raw industries at a site (default); 'none' blocks raw (primary) industries; 'prospect' prospects them at a random site with the type's chance (cmdFound.js). Processing industries are always fundable. */
  rawIndustryConstruction: 'normal',
  /** T29 OpenLoco farm fields: farms plant field tiles around themselves and production scales with them. Off by default. */
  farmFields: false,
  /** gap #25 AI competitor companies (0..3 rivals, bus routes). 0 = none: nothing runs, no state is created. */
  aiCompanies: 0,
  /** OpenTTD difficulty.competitor_speed (0 very slow .. 4 very fast, default 2 medium): how often AI rivals take build/think actions (aiCompanies.js thinkPasses). 2 = once a month, as before. */
  competitorSpeed: 2,
  /** OpenTTD max_trains / max_roadveh / max_aircraft / max_ships: vehicles per company (vehicleLimit.js). Default 500 as OpenTTD. */
  maxTrains: 500,
  maxRoadVeh: 500,
  maxAircraft: 500,
  maxShips: 500,
  /** articulatedRV: articulated buses / lorries / trams (config ARTIC_VEHICLE_MODELS, articulated.js). Off = not offered. */
  articulatedRV: false,
  /** economy recessions (OpenTTD fluct): cargo and passengers halved for ~a year, every 1-3 years. Off by default. */
  /** EF economy type (OpenTTD economy.type, economy_settings.ini:197): 'openloco' = current TT/OpenLoco monthly production up/down and closures (default); 'frozen' = OpenTTD Frozen (ChangeIndustryProduction early return, industry_cmd.cpp:2926): no production changes and no closures; new industries still appear; 'smooth' = OpenTTD Smooth (industry_cmd.cpp:2943, loco/industry.js smoothMonthlyChange): small monthly % changes and closure at minimum. */
  economyType: 'openloco',
  economyRecessions: false,
  /** disasters (OpenTTD difficulty.disasters): a zeppelin crashes on an airport runway and blocks landings for a while; a small UFO destroys a road vehicle. Off by default. */
  disasters: false,
  /** plane crashes on landing (OpenTTD plane_crashes): 'off' | 'reduced' | 'normal'. Off by default. */
  planeCrashes: 'off',
  /** level crossings (OpenTTD barriers): a crossing is barred while a train is on or about to enter it; road vehicles and cars wait. Off by default. */
  levelCrossings: false,
  /** train vs road vehicle collisions at level crossings (OpenTTD train_cmd.cpp): a road vehicle on the crossing when a train enters it is destroyed. Off by default. */
  vehicleCollisions: false,
  /** cargo distribution for passengers and mail (OpenTTD cargodist, simplified): 'off' | 'asymmetric' | 'symmetric'. Off by default. */
  cargodist: 'off',
  /** timetable separation: vehicles on a complete timetable with shared orders depart at their evenly spaced slots. Off by default. */
  timetableSeparation: false,
  /** freight distribution (OpenTTD linkgraph distribution_default for cargo other than pax/mail): 'manual' (default, classic) | 'asymmetric' (acceptance-weighted destinations, no return demand) */
  freightDistribution: 'manual',
  /** capacity-constrained routing (OpenTTD MCF, simplified) for the cargodist link graphs. Off by default. */
  cargodistMcf: false,
  /** link graph schedule in months (OpenTTD linkgraph.recalc_interval; OTTD default 8 days). 1 = rebuild monthly (current). */
  linkgraphRecalcInterval: 1,
  /** months a link graph job runs before its routing is applied (OpenTTD linkgraph.recalc_time). 0 = applied at once (current). */
  linkgraphRecalcTime: 0,
  /** pax distribution: 'follow' (= cargodist setting) | 'manual' | 'asymmetric' | 'symmetric' (OpenTTD distribution_pax). */
  linkgraphDistributionPax: 'follow',
  /** mail distribution (OpenTTD distribution_mail). */
  linkgraphDistributionMail: 'follow',
  /** accuracy of the MCF: augmenting paths per demand pair = accuracy / 2 (OpenTTD linkgraph.accuracy, default 16 = 8 paths). */
  linkgraphAccuracy: 16,
  /** distance effect on demand, percent (OpenTTD linkgraph.demand_distance). 0 = distance ignored (current); OTTD default 100. */
  linkgraphDemandDistance: 0,
  /** effect of supply on symmetric demand, percent (OpenTTD linkgraph.demand_size). 100 = current; 0 = all destinations equal. */
  linkgraphDemandSize: 100,
  /** percent of capacity the first MCF pass saturates (OpenTTD short_path_saturation). 100 = current; OTTD default 80. */
  linkgraphShortPathSaturation: 100,
  /** infrastructure maintenance (OpenTTD economy.infrastructure_maintenance, economy.cpp CompaniesGenStatistics): monthly
   * fee for track, road and station tiles by count (infrastructure.js). Off = no fee (unchanged). */
  infraMaintenance: false,
  /** bankruptcy by loan (OpenTTD economy.cpp CompanyCheckBankrupt:557): a company is only in trouble when money - loan < -maxLoan.
   * Off = any negative balance counts as bankrupt (TT current behaviour). OpenTTD has no switch: always on. */
  bankruptcyNegativeLoanRule: false,
  /** single-player bankruptcy (OpenTTD economy.cpp:600-612): the local company's bankruptcy does not end the game.
   * Off = bankruptcy sets game over (TT current behaviour). OpenTTD has no switch: always on. */
  bankruptcySinglePlayerContinue: false,
  /** negative cash interest (OpenTTD economy.cpp:818-826): the yearly fee also charges interest on negative money, monthly here.
   * Off = interest on the loan only (TT current behaviour). OpenTTD has no switch: always on. */
  negativeCashInterest: false,
  /** plane speed factor 1..4 (OpenTTD vehicle.plane_speed, aircraft_cmd.cpp): aircraft max speed is divided by N. 1 = full speed (unchanged). */
  planeSpeedFactor: 1,
  /** town growth rate (OpenTTD economy.town_growth_rate): 'none' | 'slow' | 'normal' | 'fast' | 'veryfast'. 'normal' = current growth. */
  townGrowthRate: 'normal',
  /** town growth model (OpenTTD town_cmd.cpp UpdateTownGrowth/CountActiveStations): 'tt' = current TT build-speed growth (default,
   * unchanged). 'ottd' = growth period from stations with a pickup/delivery in the last 20 days; no active station => 1/12 chance. */
  townGrowthModel: 'tt',
  /** OpenTTD economy.allow_town_roads (def true): towns may extend/build their road network as they grow. Off = towns never build roads (houses still grow along existing roads). */
  allowTownRoads: true,
  /** OpenTTD economy.place_houses (def true): towns may construct new houses as they grow. Off = existing houses only (population stays put, roads may still grow). */
  placeHouses: true,
  /** OpenTTD economy.town_cargo_scale (percent 0..500, def 100): scales passengers and mail produced by town houses each production chunk. 100 = current. */
  townCargoScale: 100,
  /** OpenTTD economy.industry_cargo_scale (percent 0..500, def 100): scales cargo produced by industries each day. 100 = current. */
  industryCargoScale: 100,
  /** OpenTTD has no setting: it always keeps undelivered industry output in a waiting buffer (u16, cap 65535, gated by minimal_cargo). TT default false = undelivered output is discarded. On = kept per industry (cap 65535) and offered to stations in range at each monthly tick. */
  industryCargoBacklog: false,
  /** OpenTTD order.no_servicing_if_no_breakdowns (def true): with vehicle breakdowns disabled, vehicles skip mandatory depot servicing. false = service anyway. */
  noServicingIfNoBreakdowns: true,
  /** OpenTTD vehicle.freight_trains: default number of wagons when buying a freight train (0 = automatic, the current 4). */
  freightTrainWagons: 0,
  /** road driving side (OpenTTD road_side): 'right' (default, Russia) | 'left'. Render-only: lanes are mirrored; the sim is side-agnostic. Changeable only before road vehicles exist (OTTD). */
  roadSide: 'right',
  /** OpenTTD construction.max_bridge_length: longest player bridge in tiles, heads included (default 12 = trackRules MAX_BRIDGE_LENGTH). */
  maxBridgeLength: 12,
  /** OpenTTD construction.max_tunnel_length: longest player tunnel in tiles, portals included (default 16 = MAX_TUNNEL_LENGTH). */
  maxTunnelLength: 16,
  /** OpenTTD station.distant_join_stations (game_settings.ini, def true): Ctrl+click may join a station that is not next to the new one. */
  distantJoinStations: true,
  /** OpenTTD order.selectgoods (station_cmd.cpp:3991, 4583; def true): industries and towns deliver only to stations a vehicle has tried to load at. Off = every station in range takes cargo. */
  selectGoods: true,
  /** OpenTTD order.improved_load (economy.cpp ReserveConsist; def true in OpenTTD). TT default off = current greedy loading. On = among vehicles loading the same cargo at a station, the earliest arrival is served first. */
  improvedLoad: false,
  /** OpenTTD difficulty.town_council_tolerance (difficulty_settings.ini:298, def 0): 0 Lenient, 1 Tolerant, 2 Hostile, 3 Permissive; townAuthority.js refuseBelow. */
  townCouncilTolerance: 0,
  /** OpenTTD economy.dist_local_authority (economy_settings.ini, def 20, min 5): manhattan radius (tiles) of a town's local authority. authorityTown / refusalAt / monthly rating use it. */
  distLocalAuthority: 20,
  /** OpenTTD economy.bribe: allow bribing the local town authority to improve rating. Off = bribing disabled. */
  allowTownBribe: true,
  /** OpenTTD economy.feeder_payment_share: percent of a transfer leg's income credited to the feeder (orders.js transferCredit). Default 75. */
  feederPaymentShare: 75,
  /** OpenTTD station.station_spread: max bounding-box side (tiles) of one player station (default 12 = STATION_SPREAD). */
  stationSpread: 12,
  /** OpenTTD station.modified_catchment (game_settings.ini, def true): true = per-type catchment radius per tile (current TT). false = OpenTTD CA_UNMODIFIED: every station tile catches radius 4. */
  modifiedCatchment: true,
  /** OpenTTD vehicle.max_train_length: most wagons in a player train (default 12 = MAX_WAGONS). */
  maxTrainWagons: 12,
  /** OpenTTD vehicle.max_train_length: max train length in tiles (def 7 tiles, min 1, max 64). */
  maxTrainLength: 7,
  /** OpenTTD gui.autosave_interval: periodically saves the current game into the autosave slot in the background. */
  autosaveInterval: 'off',
  /** OpenTTD economy.exclusive_rights (economy_settings.ini, def true): town action 'Buy exclusive transport rights' is available. Off = the action is not offered and is refused (town_cmd.cpp TownActionBuyRights). TT default true = current. */
  exclusiveRights: true,
  /** OpenTTD construction.road_stop_on_town_road (world_settings.ini, def true): road stops may be built on town-owned road tiles. Off = refused (station_cmd.cpp). TT default true = current. */
  roadStopOnTownRoad: true,
  /** OpenTTD company.engine_renew_months (company_settings.ini, def 6): extra months past max age before autorenew (vehicle.cpp NeedsAutorenewing, 30 days each). TT default 0 = renew exactly past max age (current). */
  engineRenewMonths: 0,
  /** OpenTTD company.engine_renew_money (company_settings.ini, def 100000): company money needed before autoreplace/autorenew runs (vehicle.cpp NeedsServicing). TT default 0 = only the purchase cost is checked (current). */
  engineRenewMoney: 0,
  /** OpenTTD processing-industry abandonment (industry_cmd.cpp:3004-3007; always on in OpenTTD, no setting): secondary industries idle 5 years close at 1/180 per month. TT default off = no abandonment (current). */
  industryAbandonment: false,
  /** OpenTTD last-instance closure protection (industry_cmd.cpp:2758-2766; CanCloseLastInstance behaviour flag, not a setting): the last instance of an industry type cannot close. TT default off = it may close (current). */
  protectLastIndustry: false,
};

/** OpenTTD difficulty.infinite_money: true = no affordability or bankruptcy checks. */
export function infiniteMoney(state) {
  return getSetting(state, 'infiniteMoney') === true;
}

/** Read a setting (state.settings value or the default). */
export function getSetting(state, key) {
  const s = state && state.settings;
  if (s && Object.prototype.hasOwnProperty.call(s, key)) return s[key];
  return DEFAULT_SETTINGS[key];
}

/** Write a setting (creates state.settings lazily). */
export function setSetting(state, key, value) {
  if (!state.settings) state.settings = {};
  state.settings[key] = value;
}

/** All settings merged with defaults (for UI). */
export function allSettings(state) {
  return { ...DEFAULT_SETTINGS, ...(state && state.settings) };
}

/** OpenTTD road_side rule: the driving side can only change before any road vehicle exists. */
export function roadSideLocked(state) {
  const vs = state && state.vehicles;
  if (!vs) return false;
  for (const v of vs) if (v.kind === 'road') return true;
  return false;
}
