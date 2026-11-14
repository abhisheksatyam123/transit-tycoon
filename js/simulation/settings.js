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
  /** OpenTTD invisibility: Ctrl+Shift+1..8 HIDES the matching transparency class instead of fading it (input.js). Off = Ctrl+Shift+digit is the same alias as Ctrl+digit (fade). Display only; never read by the simulation. */
  transparencyInvisibleHides: false,
  inflation: true,
  /** loan interest rate in OpenLoco units (percent per year, charged monthly as loan*rate/1200; World/Company.cpp:724). Editor default 10 in OL; 5 here keeps existing games unchanged. */
  loanInterestRate: 5,
  /** OpenLoco: max loan is inflation-adjusted (CompanyManager.cpp:1191, ChangeLoan.cpp getInflationAdjustedCost(ci 0, div 8)). Off keeps flat MAX_LOAN so current games/hash unchanged. */
  inflationAdjustsMaxLoan: false,
  /** per-vehicle-type income and expenditure history (opt-in; off = unchanged). On: the finance window shows this year vs last year revenue by vehicle type. Read-only; no effect on money or the ledger. */
  financeByVehicleType: false,
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
  /**
   * OpenTTD refit of a loaded vehicle (vehicle_cmd.cpp:376-506: no "must be empty" check). Default off = TT's
   * current rule: a vehicle must be unloaded before a depot refit. On: a loaded vehicle may be refitted in a
   * depot; the same cargo is kept and truncated to the new capacity, another cargo is dropped, and the depot
   * ORDER refit rule is unchanged.
   */
  partialRefit: false,
  /**
   * OpenTTD order_cmd.cpp:1665-1669: a depot order that carries a refit always goes to the depot, even when it is
   * also "service if needed" and service is not due. Off = today's rule: a not-due service-only order is skipped,
   * so a refit on that order never runs.
   */
  depotRefitAlwaysVisits: false,
  /** OpenTTD GetRefitCost (vehicle_cmd.cpp:319-354): per-model refit cost, permille of purchase price (model.refitCost). A cargo-carrying part without refitCost falls back to the flat 10%; the locomotive without refitCost is free of charge (contributes 0). Default off = flat 10% of the whole vehicle (refit.js). */
  modelRefitCost: false,
  /** OpenTTD CARGO_AUTO_REFIT (economy.cpp HandleStationRefit): an empty vehicle loading at a station order with refitAuto refits to the cargo with most waiting for its next stop. Default off (orders.js autoRefitTarget). */
  stationAutoRefit: false,
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
  /** trainSlopeSteepness: OpenTTD vehicle.train_slope_steepness (default 3 %, range 0-10). Scales the train grade term in gradeMph; only matters when gradients is on. */
  trainSlopeSteepness: 3,
  /** roadSlopeSteepness: OpenTTD vehicle.roadveh_slope_steepness (default 7 %, range 0-10). Scales the road-vehicle grade term in gradeMph; only matters when gradients is on. */
  roadSlopeSteepness: 7,
  /** trainAcceleration: 'original' (current TT model, default) | 'realistic' (OTTD curve speed limits + tractive effort / drag / slope acceleration, loco/trainRealistic.js). Changes results; off by default. */
  trainAcceleration: 'original',
  /** roadAcceleration: 'original' (current OpenLoco landSpeedStep, default) | 'realistic' (OTTD power / tractive effort / drag with the full loaded weight, plus the 75 % cardinal and 50 % reverse caps, loco/roadRealistic.js). Changes results; off by default. */
  roadAcceleration: 'original',
  /** wagonSpeedLimits: OpenTTD vehicle.wagon_speed_limits (train_cmd.cpp ConsistChanged): a train is limited by
   * the slowest wagon with a nonzero speed; a wagon speed of 0 (or absent) = unlimited. Off = the engine speed only
   * (current behaviour). No wagon data has a nonzero speed yet, so even On is inert today. */
  wagonSpeedLimits: false,
  /** roadOvertaking: OpenTTD road vehicle overtaking (roadOvertake.js): a faster road vehicle passes a slower one on a straight plain road when the opposite lane is free. Trams never. Off by default: changes results. */
  roadOvertaking: false,
  /** OpenTTD pf.roadveh_queue (pathfinding_settings.ini, def true; roadveh_cmd.cpp:919): a road vehicle waits for
   * a free bay at a road stop and enters when one frees. True = current TT behaviour (road vehicles always queue).
   * False = a road vehicle does not enter a stop that has no free bay; it keeps driving and comes back. */
  roadvehQueue: true,
  /** tramCurveCap: OpenTTD tram corner speed limits (GetCurveSpeedLimit via RoadVeh tram): trams take corners at capped speed instead of the OpenLoco road fraction. Off = trams use the road curve fraction like buses/trucks. */
  tramCurveCap: false,
  /** tramQueue: OpenTTD roadveh_cmd.cpp:634-701 (RoadVehFindCloseTo): trams are indexed in the road occupancy
   * layer like buses/trucks, so a tram queues behind a loading/blocked tram or bus in its lane, buses queue
   * behind trams, and the stop-bay rules (bayInUse / bayEntryRefused) cover trams. Oncoming trams still pass.
   * Off = trams stay on their own unindexed layer and pass through each other (current behaviour). */
  tramQueue: false,
  /** roadvehDriveThrough: OpenTTD roadveh_cmd.cpp:698 anti-deadlock backup — a road vehicle (tram included)
   * blocked by a moving (not loading) vehicle for 1480 OpenTTD ticks (20 days) drives through it and carries
   * on instead of turning around. Off = the TT 3-day turn-around (BLOCK_TIMEOUT_TICKS) stays. Blocked behind
   * a loading vehicle both modes wait / try another bay (tryFreeBay). */
  roadvehDriveThrough: false,
  /** exclusive engine preview (OpenTTD engine.cpp): a new model is first offered to one company for a year. Off = unchanged. */
  enginePreview: false,
  /** OpenTTD engine.cpp block_preview (20 months): a company that declined or let an engine preview time out is not offered that model for 20 months. Off = offered again at once (current). Lazy: rec.block is written only when on. */
  enginePreviewBlock: false,
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
  /** OpenTTD economy.town_layout (economy_settings.ini: town_layout): road grid used by generated towns. 'mixed' = each site gets its own layout (the classic generator). Only new maps; the generator reads state.mapgen.townLayout, this setting only remembers the New Game default. */
  townLayout: 'mixed',
  /** OpenTTD economy.initial_city_size (town_cmd.cpp:2063, def 2): layout size multiplier for city towns at generation (normal towns 1-3, capped at 6). */
  initialCitySize: 2,
  /** OpenTTD economy.multiple_industry_per_town: allow more than one industry of the same type in/near a town. Off = one of each type per town. */
  multipleIndustryPerTown: false,
  /** OpenTTD construction.raw_industry_construction (settings_type.h:496): 'normal' funds raw industries at a site (default); 'none' blocks raw (primary) industries; 'prospect' prospects them at a random site with the type's chance (cmdFound.js). Processing industries are always fundable. */
  rawIndustryConstruction: 'normal',
  /** T29 OpenLoco farm fields: farms plant field tiles around themselves and production scales with them. Off by default. */
  farmFields: false,
  /**
   * OpenTTD climate growth goals exactly: arctic TOWN_GROWTH_WINTER / tropic TOWN_GROWTH_DESERT fire only while the
   * town has no activity and exceeds 90 / 60 people, funded towns skip the goals, and no arctic farm fields at or above
   * the snow line (town_cmd.cpp:3941-3949, industry_cmd.cpp:1052-1056). Off = today's TT gates, unchanged.
   */
  climateGrowthOttd: false,
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
  /** station rating penalty when a train crashes (OpenTTD train_cmd.cpp ~3360: ModifyStationRatingAround -160, radius 30): the crashed train's company's stations within 30 tiles lose 160 rating points. Needs vehicleCollisions. Off by default. */
  trainCrashStationRating: false,
  /** train crash passenger deaths (OpenTTD Vehicle::Crash): each crashed consist loses a random 0..passengers (RandomRange(pass+1)) instead of its full load. Needs vehicleCollisions. Off by default (no extra random draws). */
  trainCrashRandomVictims: false,
  /** road vehicle destroyed at a level crossing: the news counts the victims (driver +1 and passengers, OpenTTD RoadVehicle::Crash). Needs vehicleCollisions. Off by default (fixed news text). */
  trainCrashRoadNewsCount: false,
  /** cargo distribution for passengers and mail (OpenTTD cargodist, simplified): 'off' | 'asymmetric' | 'symmetric'. Off by default. */
  cargodist: 'off',
  /** timetable separation: vehicles on a complete timetable with shared orders depart at their evenly spaced slots. Off by default. */
  timetableSeparation: false,
  /** timetable lateness (OpenTTD lateness counter): early vehicles wait longer, late ones shorter, cumulative over the round, seeded by the start date. Off by default. */
  timetableLateness: false,
  /** timetable estimates (OpenTTD estimated vs timetabled travel/wait times): measured times are kept per order as display-only estimates and autofill can keep longer waits (Ctrl). Off by default. */
  timetableEstimates: false,
  /** timetable sub-day display (G6): timetable totals show days and hours ("3d 04h"). Display only; stored values stay whole days. Off by default. */
  timetableSubDay: false,
  /** G7: timetabled conditional orders may carry a wait, held with the lateness clock (needs timetableLateness too). Off by default. */
  timetableLatenessConditional: false,
  /** OpenTTD timekeeping_units (TimekeepingUnits): 'economy' = current behaviour (default); 'calendar' = the calendar clock (state.calendar, calendarClock.js) runs at calendarTicksPerDay, used for the toolbar year. Opt-in. */
  timekeepingUnits: 'economy',
  /** calendar clock speed in logic ticks per calendar day (96 = current economy day; 24..384). Only read when timekeepingUnits is 'calendar' (calendarClock.js). */
  calendarTicksPerDay: 96,
  /** freight distribution (OpenTTD linkgraph distribution_default for cargo other than pax/mail): 'manual' (default, classic) | 'asymmetric' (acceptance-weighted destinations, no return demand) | 'symmetric' (return demand too; needs cargodistDemandParity, else runs as asymmetric) */
  freightDistribution: 'manual',
  /** capacity-constrained routing (OpenTTD MCF, simplified) for the cargodist link graphs. Off by default. */
  cargodistMcf: false,
  /** OpenTTD-style capacity routing (batched, deterministic approximation of OpenTTD MCF pass 1) for cargodist link graphs. Off by default; when off, cargodistMcf/routing above is unchanged. */
  cargodistCapacityRouting: false,
  /** OpenTTD DemandCalculator demand (integer units per pair: supply-weighted symmetric or asymmetric, acceptance as a gate) instead of the default demand shares. Off by default; needs a pax/mail or freight distribution. Uses linkgraphAccuracy, linkgraphDemandSize and linkgraphDemandDistance (0 = no distance term, the current default). */
  cargodistDemandParity: false,
  /** link graph schedule in months. OpenTTD linkgraph.recalc_interval default is 8 in economy seconds x SECONDS_PER_DAY=2 = 4 days (linkgraph_settings.ini:45, timer_game_common.h:168). TT is monthly, not the OpenTTD cadence (known gap, see GAPS.md). 1 = rebuild monthly (current). */
  linkgraphRecalcInterval: 1,
  /** months a link graph job runs before its routing is applied (OpenTTD linkgraph.recalc_time; default 32 economy seconds x 2 = 16 days, linkgraph_settings.ini:58). Not the OpenTTD delay: TT counts months (known gap, see GAPS.md). 0 = applied at once (current). */
  linkgraphRecalcTime: 0,
  /** days-based link graph interval (OpenTTD linkgraph.recalc_interval: default 4 days, linkgraph_settings.ini:45). 0 (default) = keep the month schedule above (current behaviour); 1..90 = start one link graph job every N days and ignore the month keys. */
  linkgraphIntervalDays: 0,
  /** minimum days a link graph job runs before its routing is applied (OpenTTD linkgraph.recalc_time: default 16 days, linkgraph_settings.ini:58; the join slot makes the effective default delay 18 days). 0 (default) = applied at once, as today. Only read when linkgraphIntervalDays > 0. */
  linkgraphTimeDays: 0,
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
  /** Opt-in fix of the town road path-finding bug (decision D22): true = town roads may bend after minRun straight steps.
   * false (default) = the original straight-only roads plus the bfsRoadPath fallback (world hash unchanged). */
  townRoadTurns: false,
  /** Snow re-spread (decision D2, approved default on): true (default) = terrain snow starts at the snow line itself (height snowLine + 0,
   * e.g. 5 with the default line) instead of snowLine + 2 (7). Read at map generation only; false = the OpenTTD-matched +2 mapping (old pins). */
  snowRespread: true,
  /** OpenTTD economy.town_cargo_scale (percent 0..500, def 100): scales passengers and mail produced by town houses each production chunk. 100 = current. */
  townCargoScale: 100,
  /** OpenTTD economy.town_cargogen_mode (TownCargoGenMode): 'original' = current OpenLoco-style per-house-visit (r>>2)+1 (default,
   * unchanged). 'bitcount' = OpenTTD binomial popcount(r & mask) on 1/4 of house visits, rate-calibrated to the same monthly totals. */
  townCargogenMode: 'original',
  /** OpenTTD economy.industry_cargo_scale (percent 0..500, def 100): scales cargo produced by industries each day. 100 = current. */
  industryCargoScale: 100,
  /** OpenTTD has no setting: it always keeps undelivered industry output in a waiting buffer (u16, cap 65535, gated by minimal_cargo). TT default false = undelivered output is discarded. On = kept per industry (cap 65535) and offered to stations in range at each monthly tick. */
  industryCargoBacklog: false,
  /** OpenTTD order.no_servicing_if_no_breakdowns (def true): with vehicle breakdowns disabled, vehicles skip mandatory depot servicing. false = service anyway. */
  noServicingIfNoBreakdowns: true,
  /** OpenTTD vehicle.cpp:1357 `if (Ship) rel += 0x6666`: ships break down less (timer from reliability + 0.4). Default false = current TT. */
  shipBreakdownReduced: false,
  /** OpenTTD yapf_ship curve90 penalty (6 x YAPF_TILE_LENGTH): ship pathfinding pays 6 extra tile steps for each 90-degree turn, so routes prefer straight runs. 4-connected movement only; no diagonal moves. Default false = current TT unit-cost routing. */
  shipTurnCost: false,
  /** Ships may step diagonally on the water grid (8-way, sqrt(2) per diagonal step, corner rule: no cutting land, no canal/lock/aqueduct diagonals). NOT OpenTTD or OpenLoco (both 4-connected). Default false = 4-way routes and movement, as before. */
  shipDiagonal: false,
  /** OpenTTD vehicle.cpp:1397-1398 / roadveh_cmd.cpp:1587-1592: a broken-down road/rail/ship vehicle stops dead until repaired (movement.js 'broken') and does not end the breakdown at a stop. Default false = OpenLoco crawl (maxSpeed/4, ships 5 mph). Aircraft and UFO-frozen keep their behaviour. */
  breakdownStop: false,
  /** OpenTTD vehicle.cpp:1454-1466: reliability decay doubles per year past max age (x2..x32). Default false = current TT (one step). */
  ageDecayOttd: false,
  /** OpenTTD vehicle.cpp:189-203: every depot entry services (reliability to max, timers reset). Default false = only with serviceIntervalDays. */
  serviceOnDepotVisit: false,
  /** Aqueduct length (aqueduct.js planAqueduct): off = legacy check n-2 > maxBridgeLength, which is 2 tiles more lenient than bridges and tunnels. On = full head-to-head span n > maxBridgeLength, like bridges and tunnels (fixes the off-by-two). Default false = current TT behaviour. */
  aqueductFullSpanLimit: false,
  /** OpenTTD vehicle.freight_trains: default number of wagons when buying a freight train (0 = automatic, the current 4). */
  freightTrainWagons: 0,
  /** road driving side (OpenTTD road_side): 'right' (default, Russia) | 'left'. Render-only: lanes are mirrored; the sim is side-agnostic. Changeable only before road vehicles exist (OTTD). */
  roadSide: 'right',
  /** OpenTTD construction.max_bridge_length: TT counts tiles INCLUDING both heads (OpenTTD counts between heads, so TT 12 = OTTD 10). Default 12 = trackRules MAX_BRIDGE_LENGTH. */
  maxBridgeLength: 12,
  /** OpenTTD construction.max_tunnel_length: TT counts tiles INCLUDING both portals (OpenTTD counts between portals, so TT 16 = OTTD 14). Default 16 = MAX_TUNNEL_LENGTH. */
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
  /** TT opt-in town action: donate money to the local authority for a rating gain (no random failure). OpenTTD 16.x has no give-money town action; economy.give_money is company-to-company. Default off = action hidden and refused. */
  localGiveMoney: false,
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
  /** OpenTTD-style multiple singlehead locomotives at the head of a train (lead block, up to 4 engines total).
   * Off (default) = the TT single-engine consist; no vehicle ever carries the lazy `engines` list. */
  multiEngineConsists: false,
  /** D17 multihead pairs: offers the twin-engine model (eng_twin_thunder, one unit that is two halves, not splittable).
   * Off (default) = the model is not offered; no existing vehicle or hash changes. */
  multiheadPairs: false,
  /** D17 interleave (spec option C, phase-2 slot only): with multiEngineConsists on, addEngine may place the extra engine at opts.position inside the engine block (default: end). Sums and the lead-first rule are unchanged. Off = always append (current). */
  multiheadInterleave: false,
  /** OpenTTD gui.autosave_interval: periodically saves the current game into the autosave slot in the background. */
  autosaveInterval: 'off',
  /** OpenTTD economy.exclusive_rights (economy_settings.ini, def true): town action 'Buy exclusive transport rights' is available. Off = the action is not offered and is refused (town_cmd.cpp TownActionBuyRights). TT default true = current. */
  exclusiveRights: true,
  /** OpenTTD economy.fund_buildings (economy_settings.ini, def true): town action 'Fund new buildings' is available. Off = the action is not offered and is refused (town_cmd.cpp GetMaskOfTownActions). TT default true = current. */
  fundBuildings: true,
  /** OpenTTD economy.fund_roads (economy_settings.ini, def true): town action 'Fund local road reconstruction' is available. Off = the action is not offered and is refused (town_cmd.cpp GetMaskOfTownActions). TT default true = current. */
  fundRoads: true,
  /** OpenTTD construction.road_stop_on_town_road (world_settings.ini, def true): road stops may be built on town-owned road tiles. Off = refused (station_cmd.cpp). TT default true = current. */
  roadStopOnTownRoad: true,
  /** OpenTTD construction.road_stop_on_competitor_road (world_settings.ini ~544, def true): road stops may be built on roads owned by another company. Off = refused (station_cmd.cpp). TT default true = current. */
  roadStopOnCompetitorRoad: true,
  /** D9 terminal road stops (opt-in, default off; spec d9-terminal-road-stops-spec.md). On = buildRoadStop called with opts.terminal accepts a bus/truck stop at a single road end or on clear land beside a road that points back; the stop keeps one entrance bit. Off = terminal option ignored (drive-through stops only). */
  terminalRoadStops: false,
  /** OpenTTD construction.train_signal_side (settings_type.h TrainSignalSide, render-only): side of the track the signal post stands on. 'right' (default) = TT's historic fixed right side; 'left'; 'driving' = follow roadSide (OpenTTD's default RoadVehicleDrivingSide). */
  trainSignalSide: 'right',
  /** OpenTTD construction.build_on_slopes (world_settings.ini, def true): rail and road may be built on sloped tiles. true = TT's current behaviour (no slope check). false = buildLine refuses a tile whose four corners are not level. */
  buildOnSlopes: true,
  /** OpenTTD construction.map_height_limit (def 0 = no limit): highest terrain level terraform may raise to. TT default 7 = cmdTerraform MAX_HEIGHT, the current hard ceiling; lower values cap raising. */
  mapHeightLimit: 7,
  /** OpenTTD company.engine_renew_months (company_settings.ini, def 6): extra months past max age before autorenew (vehicle.cpp NeedsAutorenewing, 30 days each). TT default 0 = renew exactly past max age (current). */
  engineRenewMonths: 0,
  /** OpenTTD company.engine_renew_money (company_settings.ini, def 100000): company money needed before autoreplace/autorenew runs (vehicle.cpp NeedsServicing). TT default 0 = only the purchase cost is checked (current). */
  engineRenewMoney: 0,
  /** OpenTTD processing-industry abandonment (industry_cmd.cpp:3004-3007; always on in OpenTTD, no setting): secondary industries idle 5 years close at 1/180 per month. TT default off = no abandonment (current). */
  industryAbandonment: false,
  /** OpenTTD last-instance closure protection (industry_cmd.cpp:2758-2766; CanCloseLastInstance behaviour flag, not a setting): the last instance of an industry type cannot close. TT default off = it may close (current). */
  protectLastIndustry: false,
  /** OpenTTD per-vehicle-type groups (group_cmd.cpp: a group has a vehicle_type). On: createGroup/addVehicleToGroup set
   * and enforce group.kind ('train'|'road'|'aircraft'|'ship'); off = mixed groups stay allowed (current). Lazy: group.kind
   * is written only while this is on. */
  strictGroupKind: false,
  /** OpenTTD group ReplaceProtection semantics (autoreplace.cpp:70): a protected group blocks only the company-wide
   * (ALL_GROUP) autoreplace rule; its own per-group rule and age-based autorenew still run. Off = TT behaviour today:
   * a protected group blocks its own group rule, the company rule and autorenew. */
  autoreplaceProtectOttd: false,
  /** OpenTTD company.renew_keep_length (company_settings.ini, def false): after autoreplace, sell the wagons that would
   * make the train longer than before (TT: cap at the old wagon count and at maxTrainWagons / maxTrainLength, dropping
   * the wagons nearest the engine). Off = today's count-preserving replacement. The group flag
   * company.groupReplaceWagonRemoval lazily overrides it per group (absent = follow this setting live). */
  renewKeepLength: false,
  /** D21 copy-at-creation (opt-in, default off; OpenTTD group_cmd.cpp:371 copies renew_keep_length into each new group's
   * GroupFlag::ReplaceWagonRemoval). On = createGroup writes the group's explicit keep-length entry from renewKeepLength at
   * creation, so later company changes do not reach it. Off = no key is written and the group follows the company live. */
  groupCopyKeepLength: false,
  /** D21 per-group autorenew (opt-in, default off). On = a group may carry its own autorenew on/off in
   * company.groupAutorenew (set via cmdGroup setGroupAutorenew); absent = follow the company `autorenew` setting.
   * Off = the group flag is ignored and autorenew is company-wide as before. */
  groupAutorenew: false,
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
