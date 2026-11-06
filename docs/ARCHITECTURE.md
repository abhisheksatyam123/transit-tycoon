# Transit Tycoon JS — Architecture & Module Contract

Original JavaScript transport-simulation game *inspired by* OpenTTD gameplay (tile map, towns,
industries, cargo chains, rail/road networks, stations, vehicles with orders, company finances).
No OpenTTD code or assets are copied (OpenTTD is GPL-2.0); all graphics are procedural canvas.

Zero runtime dependencies. Native ES modules in the browser (no bundler). `bun` for dev server + tests.

## Maintainability rules
- One responsibility per file; target < ~400 lines per file. Split when larger.
- Static game data (cargo, industries, vehicle models, costs) lives in `js/config/*`, not in logic files.
- `js/simulation/**` is PURE: no DOM, no `window`, no `Math.random` (use the game RNG), deterministic for a seed.
- Render/UI layers only read `game.state`, call Game queries and commands. They never mutate state directly.
- Each UI window is its own module in `js/ui/windows/`; each build tool its own module in `js/ui/tools/`.
- JSDoc on exported functions. Named exports only.

## Layout
Mirrors the user's existing project (`simcity_2000_project`: index.html + css/ + js/{config,simulation,renderer,input,ui,audio}),
but each area is a folder of small ES modules instead of one large script.
```
transit-tycoon/
  index.html                 entry; <script type="module" src="js/main.js">
  css/main.css, css/windows.css   dark-glass HUD theme (same palette as simcity_2000_project)
  server.js                  bun static dev server, port 5173 (`bun run dev`, PORT env override)
  package.json               scripts: dev, test, check (import checker), simulate (headless harness)
  js/main.js                 wiring: Game, Renderer, Minimap, UI, game loop, autosave
  js/config/                 static data tables: cargos, industries, vehicles, costs, names, traffic (car tunables)
  js/simulation/             PURE deterministic core (no DOM). Game class in game.js composes:
    constants rng events date map towns townGrowth industries cargo network trackRules pathfinder routing
    stations orders vehicles movement vehicleLife economy news naming state queries save
    cmdTrack (rail/road/demolish) cmdStation (stations/stops/depots) cmdVehicle (buy/orders/start/stop/sell)
    townRoads (connectTowns intercity roads, repairTownRoads) stationLinks (rail station end half-links)
    traffic trafficTrips (private cars: spawn, routes, congestion)
    diagnostics diagIssue diagChecksMap diagChecksEntities (issue detector, read-only)
    Command/sim modules receive ctx = {state, emit}.
  js/openloco/             ported OpenLoco (MIT) track & road code: piece tables, connection math, chain walk (see js/openloco/README.md)
  js/renderer/               isometric canvas: iso, camera, palette, groundCache, heights, slope, particles, minimap, renderer
    layers/   terrain transport objects overlays traffic (cars + congestion heatmap)
    sprites/  canvas shapes terrain transport houses buildings industries vehicles (procedural, cached)
  js/input/input.js          mouse/keyboard/wheel -> camera + active tool (keys incl. X traffic, G issues)
  js/ui/                     DOM: app (controller), toolbar, statusbar, windowManager, toast, storage, loop, diagCache, dom/format/icons/cargo
    tools/    one file per tool: rail road station busStop truckStop depot demolish query addOrder (+ lineDrag, placement, geometry)
    windows/  one file per window: tileInfo station town townList industry industryList depot buyVehicle
              vehicleList vehicleDetail orders finances news saveLoad newGame help traffic (Traffic Monitor) issues (City Issues)
  js/audio/sfx.js            synthesized Web Audio sound effects + mute
  tests/*.test.js            bun:test tests for js/simulation (helpers.js builds deterministic scenarios)
  tools/check-imports.js     verifies every relative import resolves to an existing export
  tools/simulate-city.js     headless real-city harness (see "Headless city harness" below)
```

## Coordinates & directions
- Tile (x, y), 0 <= x < width, 0 <= y < height, index = y * width + x.
- Direction bits: N=1 (y-1), E=2 (x+1), S=4 (y+1), W=8 (x-1).
  `DIRS = [{bit:1,dx:0,dy:-1,name:'N'},{bit:2,dx:1,dy:0,name:'E'},{bit:4,dx:0,dy:1,name:'S'},{bit:8,dx:-1,dy:0,name:'W'}]`,
  `OPPOSITE = {1:4,2:8,4:1,8:2}`.
- Tiles A,B adjacent are rail-connected iff A.rail has bit toward B AND B.rail has the opposite bit. Same for road.
- Isometric: screenX = (x - y) * TILE_W/2, screenY = (x + y) * TILE_H/2 - height*8.

## Tile
```js
{ terrain: 'grass'|'water'|'forest'|'desert'|'rock'|'snow', height: 0..7,
  rail: 0..15, road: 0..15,
  building: null
    | {type:'house', townId, level:1..4, variant:int}
    | {type:'industry', industryId, part:int}
    | {type:'station', stationId, kind:'rail'|'bus'|'truck', axis:'x'|'y'}
    | {type:'depot', depotId, kind:'rail'|'road', dir:1|2|4|8},
  owner: null|'company'|'town' }
```
Water tiles are unbuildable. Forest is cleared (cost) when building on it.

## Game state (`game.state`, plain JSON-serialisable)
```js
{ version:1, seed, rngState, tick, date:{year,month /*0-11*/,day /*1-based*/},
  map:{width,height,tiles:Tile[]},
  towns:[{id,name,x,y,population,houses:[{x,y}],passengersLastMonth,passengersTransported,goodsDelivered,growthCounter}],
  industries:[{id,typeId,name,x,y,w,h,production:{[cargoId]:perMonth},stock:{[cargoId]:n},producedLastMonth:{},transportedLastMonth:{}}],
  stations:[{id,name,x,y,kinds:{rail,bus,truck},tiles:[{x,y,kind}],cargo:{[cargoId]:[{amount,sourceX,sourceY,sinceTick}]},
             rating:{[cargoId]:0..100},lastPickup:{[cargoId]:tick},accepts:{[cargoId]:true}}],
  depots:[{id,kind,x,y,dir}],
  vehicles:[Vehicle],
  company:{name,money,loan,maxLoan,ledger:{current:{income,expenses,byType:{}},history:[{year,month,income,expenses}]}},
  news:[{tick,dateStr,text,kind:'info'|'good'|'bad',x?,y?}],
  traffic:{rngState, nextCarId, cars:[Car], load:number[] /*per tile, EMA*/, stats:{...}, perTown:{[townId]:{trips,failed,aborted}}, acc}, // see Traffic
  nextId }
```
## Vehicle
```js
{ id, name, kind:'train'|'road', modelId, wagonModelId, wagons, cargoId, capacity,
  load:{amount, sourceX, sourceY, sinceTick},
  state:'depot'|'running'|'loading'|'stopped'|'broken'|'lost',
  tx, ty, path:[{x,y}], pathIndex, progress /*0..1 between path[i] and path[i+1]*/, speed, maxSpeed /*tiles per tick*/,
  history:[{x,y}] /*recent tile centres, newest first; wagons trail along it*/,
  orders:[{stationId, full:boolean}], orderIndex, depotId,
  age, reliability, breakdownTicks, profitThisYear, profitLastYear, value, loadingTicks }
```

## Game API (js/simulation/game.js)
```js
export class Game {
  static create({seed=1234, width=96, height=96, startYear=1950, townCount=8, industryCount=18})
  static deserialize(json) ; serialize() -> string
  state
  step()                              // advance ONE tick (OpenLoco GameScene::tick, js/simulation/loco/gameLoop.js); day/month/year events
  stepDays(n)                         // tick until n calendar days have passed (a day = 65536/682 ~ 96 ticks)
  // Commands -> {ok:true, cost, ...extra} | {ok:false, error}. Last arg opts {dryRun:true} = validate+cost only.
  buildRail(x0,y0,x1,y1,opts)         // straight or L-shaped (x first, then y); connects consecutive tiles
  buildRoad(x0,y0,x1,y1,opts)
  demolish(x0,y0,x1,y1,opts)
  buildRailStation(x,y,axis,length,opts)
  buildRoadStop(x,y,kind,opts)        // 'bus'|'truck'
  buildDepot(x,y,kind,dir,opts)       // exit faces dir; connects track/road toward dir
  buyVehicle(depotId,{modelId,wagonModelId,wagons,cargoId}) -> {ok,cost,vehicle}
  setOrders(id,orders) ; startVehicle(id) ; stopVehicle(id) ; sendToDepot(id) ; sellVehicle(id)
  borrow(amount) ; repay(amount)
  // Queries
  tile(x,y) ; inBounds(x,y) ; tileInfo(x,y) -> {tile,town?,industry?,station?,depot?,lines:string[]}
  catchmentTiles(stationId) ; stationsNear(x,y,radius)
  getVehicleSegments(v) -> [{x,y,dir,part:'loco'|'wagon'|'bus'|'truck',cargoId,loaded}]  // float tile coords
  listModels(kind)                    // models available at current date
  on(event,fn) / off                  // 'news','day','month','year','income','vehicleArrived'
}
```

## Game loop (OpenLoco port, R12)
`js/simulation/loco/gameLoop.js` mirrors OpenLoco (MIT) `GameScene::tick` / `tickDate` / `Date::updateDayCounter`:
each tick runs tickDate (StationManager/VehicleManager/IndustryManager/MessageManager daily, then the date; at month end
TownManager, IndustryManager, CompanyManager (monthly1, HQ), VehicleManager monthly, Economy inflation (<= 2029),
quarterly/yearly company updates, then CompanyManager daily), then TileManager, TownManager, IndustryManager,
VehicleManager, StationManager and CompanyManager ticks. Managers live in `js/simulation/loco/*Manager.js` with
helpers `station.js`, `industry.js`, `town.js`, `vehicle.js`, `company.js`, `economy.js` (cargo payment:
`calculateDeliveredCargoPayment`). UI runs 40 ticks/s (`ui/loop.js` BASE_TPS). OpenLoco map elements / tile manager /
track connections are ported in `js/openloco/map/` (see js/openloco/README.md).

## Gameplay rules
- Cargo: PASS, MAIL, COAL, WOOD, OIL, GRAI, LVST, IORE, STEL, GOOD.
- Chains: Coal Mine->Power Station; Forest->Sawmill->GOOD; Oil Wells->Refinery->GOOD;
  Farm(GRAI,LVST)->Factory->GOOD; Iron Ore Mine->Steel Mill->STEL->Factory. Towns accept PASS, MAIL, GOOD.
- Payment = basePay * amount * manhattan(source,dest) * timeFactor(daysInTransit) (full until days1, decays after, floor 31/255).
- Station rating (0..100) from days since last pickup, waiting amount, last vehicle speed. Delivered share = rating%.
- Catchment radius: rail 4, bus/truck 3. Station accepts cargo if summed acceptance in catchment >= threshold.
- Vehicles: bought in depot, follow orders, load (full-load waits), unload + paid where accepted (else cargo stays aboard),
  running cost per year charged monthly, breakdowns based on reliability, reverse at terminus.
- Towns grow faster with transported passengers & delivered goods. Loan in 10k steps, interest monthly.

## Rendering: sloped terrain
- `js/renderer/heights.js` (`Heights`): continuous height field on tile **corners**. A corner's height is 0 next to
  water (flat shore), else the average of neighbouring tile heights. `surfaceH(x,y)` gives the height at a point.
- `js/renderer/slope.js` (`drawSloped`): draws each tile as two triangles split on the N–S diagonal, so roads and
  rail follow the slope. Rendering only; the simulation ignores slopes.
- `layers/terrain.js`: no interior cliffs; a dark earth skirt is drawn only on the map's south/east edges.
- `js/renderer/groundCache.js` (`GroundCache`, `CHUNK`=16, `MAX_CHUNKS`=24, `chunkScaleFor`): ground and transport are
  pre-rendered per 16x16 chunk. Raster scale follows zoom*dpr (0.5 / 1 / 2). Ground is always cached. LRU of 24 chunks;
  older chunks are released and stale-scale chunks are drawn scaled until rebuilt.

## World generation (roads and stations)
- `js/simulation/townRoads.js`: `connectTowns(state)` lays intercity roads at generation (`findRoadPath`, `layRoadPath`);
  `repairTownRoads(state)` re-splits town roads after growth.
- `js/simulation/stationLinks.js`: `stationTileBits`, `isStationPort` give rail station ends their half-links so track
  connects into a station at either end.

## Traffic (private cars)
- Tunables: `js/config/traffic.js` (`MAX_CARS`, `TRIPS_PER_POP_PER_DAY`, `CAR_SPEED`, `LANE_CAPACITY`,
  `CONGESTION_SLOW`, `STUCK_TICKS`, `DEST_MIX`, `CONGESTED_LOAD`, ...).
- `js/simulation/traffic.js`: `createTraffic`, `trafficTick` (move cars, lane capacity, congestion slow-down),
  `trafficDaily` (spawn, EMA of tile load, daily stats), `trafficCars`, `trafficStats`, `trafficLoad`.
- `js/simulation/trafficTrips.js`: `planTrip` (destination mix: same town 70%, nearest other town 20%, industry 10%),
  `repath` (A* route over road network, budget `PATH_MAX_NODES`), `roadNeighbour`, `linkBit`.
- Cars spawn from town houses. A trip with no route is **failed**; a car blocked for `STUCK_TICKS` is **aborted**.
- Own RNG stream: `state.traffic.rngState` (from `hashSeed(seed + ':traffic')`), so traffic never advances `game.rng`.
- Game API: `trafficCars()`, `trafficStats()`, `trafficLoad(x,y)`.

## Diagnostics (read-only)
- `js/simulation/diagnostics.js`: `runDiagnostics(game)` runs all checks; `summarizeIssues(issues)` counts by severity and category.
- Issue shape: `{id, severity:'error'|'warn'|'info', category, message, x?, y?, vehicleId?, stationId?, townId?}`.
  `diagIssue.js` has `mkIssue` and `emitItems` (aggregates to one issue when more than `AGG_LIMIT`=20 items).
- Checks: `diagChecksMap.js` (`checkTrackBits`, `checkTownRoads`, `checkDeadEnds`) and
  `diagChecksEntities.js` (`checkInvariants`, `checkVehicles`, `checkStations`, `checkTraffic`, `checkFinance`).
- UI: `js/ui/diagCache.js` (`scanIssues`, rescans at most every `SCAN_INTERVAL_MS`=2000 ms). The toolbar badge and the
  City Issues window read it. Traffic Monitor shows traffic stats.

## UI monitoring
- Traffic Monitor (`js/ui/windows/traffic.js`, toolbar "Traffic", key **X**): KPIs, per-town table, heatmap and
  "show cars" toggles (cars: `renderer.overlay.trafficCars`).
- City Issues (`js/ui/windows/issues.js`, toolbar "Issues", key **G**): lists issues; `focusIssue` centres the view on one.
- `js/renderer/layers/traffic.js`: `drawCar`, `drawTrafficHeat` (`heatColor` by load).

## Headless city harness
`tools/simulate-city.js` (run with `bun run simulate -- --seed N --years Y --json path`; `--` passes args through):
- Builds a real world (`Game.create`), then a bus network in the two biggest towns, a road link between the two
  nearest towns, and a coal mine -> power station rail line with a depot and a full-load train.
- Runs Y years, printing one monthly row (see README sample): money, income, population, vehicles running/lost,
  traffic `act` (active cars), `trips`, `failed`, `aborted`, `speed`, `congested` tiles, issue counts `e/w/i`.
- Then prints setup log, perf (ms/day), diagnostics summary (cap 50), invariants, and a determinism check
  (save/load, then 30 days from both copies must serialise identically).
- `--json path` writes the full report. **Exit code**: `1` if there are any error-severity issues or the determinism
  check is `MISMATCH`; otherwise `0`.

## Not yet implemented (future work)
- Signals / block reservation and vehicle collisions (trains currently pass through each other).
- Slopes affecting track building (slopes are render-only), bridges and tunnels; ships and aircraft; AI competitors; multiplayer.

## Airports & aircraft (T30)
- Config: `js/config/aircraft.js` `AIRCRAFT_MODELS` (kind `'aircraft'`, `shape` prop|jet|widebody, cargos PASS+MAIL).
  `js/config/vehicles.js` exports `ALL_VEHICLE_MODELS` (road/rail + aircraft); `MODEL_BY_ID` covers both.
  `VEHICLE_MODELS` (news list) is unchanged. `listModels(state,'aircraft')` / `'air'` lists aircraft.
- Command: `game.buildAirport(x, y, opts)` -> `{ok, cost, stationId, depotId}` (`opts.dryRun` supported).
  Top-left corner (x,y), footprint `AIRPORT_W=6 x AIRPORT_H=4` (constants.js). Layout: `airportLayout()` in `aircraft.js`:
  row 2 is `runway` (centre tile dx 2, dy 2 = aircraft goal), `terminal` (dx 4-5, dy 0-1), `tower` (0,5), `hangar` (0,0), rest `apron`.
  Houses inside the footprint are demolished; water/track/road/industry/other stations block. Joins an adjacent station,
  else creates `"<nearest town> Airport"`. Cost `COSTS.airport`.
- Tile building: `{type:'station', stationId, kind:'airport', part, dx, dy}` (+ `depotId` on the hangar tile).
  Station tile record `{x,y,kind:'airport'}`; `CATCHMENT.airport = 6`. Station `kinds.airport` is set.
- Depot: `state.depots` entry `{id, kind:'air', x, y, dir:4}` at the hangar tile. Buy with `buyVehicle(hangarDepotId, {modelId:'ac_*'})`.
- Demolish: `demolish()` on any airport tile expands to the whole footprint and removes the hangar depot.
  Refused if an aircraft sits in the hangar or on a footprint tile.
- Vehicle: `kind:'aircraft'`, `roadType:null`, layer `'air'`. Path = `airLine()` Bresenham line to the nearest
  runway centre (no track checks; `linkOk` always true). Extra field `v.alt` (0..1): ramps over the first/last
  15% of the path (`altitudeAt`). Speed `AIR_KMH_TO_TILES_PER_TICK = 1/700` per km/h. Aircraft in flight
  (alt > 0) do not block tiles (`vehicleOnTile`). Orders use station tiles of kind `airport`.
- Segments: `getVehicleSegments(v)` returns one item `{part:'aircraft', alt, dir, x, y, cargoId, loaded, fill}`.

## Order flags (T4)
- Order = `{stationId, full, load?, unload?}`. `full: true` is full load (legacy). `load: 'none'` = no loading; `unload`: `'all'` (unload everything; unaccepted cargo becomes station waiting cargo), `'transfer'` (cargo left at station for other vehicles, no payment at this stop; the origin is kept so the final delivery pays the whole trip), `'none'` (no unloading). Non-default keys only are stored, so old saves load unchanged.
- Cargo is never dumped back at its loading station, and a transfer/unload-all stop does not reload the cargo it just dropped.
- `nonStop` is not modelled: trains only stop at the station of their current order.
- Commands: `game.modifyOrder(id, index, {load?, unload?})`, `game.skipToOrder(id, index)` (abandons the current stop; cargo stays aboard). Code: `simulation/orders.js` (`unload`, `loadingTick`, `normaliseOrders`), `simulation/cmdVehicle.js`, UI `ui/windows/orders.js`. Tests: `tests/orderTypes.test.js`.

## Clone, shared orders, service intervals (T5/T6)
- Clone (`cmdVehicle.cloneVehicle`, OpenLoco CloneVehicle): buys the same model/wagons/cargo in the source's depot at the normal inflated price (through `buyVehicle`), copies the orders; the copy inherits the service interval. `shareOrders: true` puts both vehicles in one shared order list.
- Shared orders (`simulation/sharedOrders.js`): members carry `orderGroup` (an id from `allocId`, stored only when shared). Each member keeps its own `orderIndex`. `setOrders`/`modifyOrder` call `syncSharers`, which copies the list to every member and re-routes running ones. `unshareOrders` gives the vehicle its own copy; a group of two dissolves when one leaves; selling a member leaves the group. Vehicle groups are not modelled.
- Service intervals (`simulation/service.js`, `loco/vehicle.js` daily, `movement.js` `startServiceTrip`/`serviceAtDepot`): `serviceIntervalDays` (absent = off), `lastServiceDay` (`dayNumber` in `date.js`), `serviceDue` (set daily once the interval elapses). Only when breakdowns are not `none`. Once the current stop is finished (or the vehicle is already running), the vehicle routes to the nearest reachable depot of its kind (`depotGoals` + `findVehiclePath`) with `serviceTrip`. On arrival `serviceAtDepot` restores reliability and bumps `services`, and the vehicle leaves again on its orders without stopping (state never becomes 'depot'). With no reachable depot the due service is postponed a full interval.
- New vehicles take `settings.serviceIntervalDays` (default 0 = off; read at purchase, so changing the default later does not touch existing vehicles). Commands: `game.cloneVehicle(id, {shareOrders})`, `game.unshareOrders(id)`, `game.setServiceInterval(id, days)` (0..730). UI: vehicle window Clone / Clone (share orders) and service controls; orders window "Shared with N" + Unshare; Settings "Service interval (days)".
- Tests: `tests/cloneVehicle.test.js`, `tests/serviceInterval.test.js`.

## Map, graphs, bankruptcy dialogs (T13/T14/T36)
- `js/ui/windows/map.js` (key P): top-down map, one pixel per tile cached per mode (terrain, industries, routes, vehicles, towns; rebuilt at most every 3 s), live layer (vehicle dots, industry markers ≥ 5 px, viewport diamond) at ~4 fps; click/drag centres the main view.
- `js/ui/windows/graphs.js` (key E): company value, income/expenses, cargo delivered, performance (OpenLoco rating titles) and league; data only from existing state (`companyValueHistory`, `ledger.history`, `cargoUnitsDeliveredHistory`, `performanceIndexHistory`); the player's current value is the live status-bar value.
- `js/ui/bankruptcy.js`: on each month event the UI reads `numMonthsInTheRed` / `bankrupt` (loco/companyManager.js) and opens "In trouble!" at 3 and 6 months and "Bankrupt" (new / load game) once; no simulation change.

## Settings, inflation, subsidies, objectives (R15)
- `js/simulation/settings.js`: `state.settings` (lazy; random worlds have none at day 0). Keys: `inflation`, `cargoPaymentPercent` (applied in `loco/economy.js` `calculateDeliveredCargoPayment`; Moscow uses 40 so its prebuilt network earns ~0.45M/month), `breakdowns` (`none`/`reduced`/`normal`, `loco/vehicle.js`), `subsidies`. UI: `ui/windows/settings.js`.
- `js/simulation/prices.js`: every construction cost, vehicle price and running cost goes through OpenLoco inflation (`inflateCost`, scale 1.0 at game start).
- `js/simulation/subsidies.js`: monthly offers (own PRNG per month, never `game.rng`), awarded on first matching delivery in `orders.js` `unload()`, x2 payment for 12 months. UI: `ui/windows/subsidies.js`.
- `js/simulation/objective.js`: OpenLoco-style scenario objective (`companyValue`/`vehicleProfit`/`performanceIndex`/`cargoDelivery`, time limit), won/lost dialog `ui/windows/objective.js`; Moscow default: company value 40M within 10 years. New Game "Scenario options" pass `opts.settings`, `opts.objective`, `opts.maxLoan` to `Game.create`.

## Web delivery and smoothness (R17)
- `server.js`: binds `TT_HOST` (default 0.0.0.0; not `HOST`, which conda sets to a target triple), gzip for text files (cached per ETag), ETag/304 revalidation. Dev only: start with `bun server.js` when needed, nothing runs as a service.
- Saves: scenario saves are packed (`save.js`: tiles-rle-v1, traffic cars columnar with varint paths, station parcels-v1); random worlds keep the classic JSON. Autosave (`main.js`): LZ compression in `ui/saveWorker.js`; runs in idle time after the month tick, every 3 months when serialize is slow (> 40 ms), and on pause / tab hidden / unload.
- Frame budget: ground chunks build within `BUILD_BUDGET_MS` per frame (placeholder diamond until built, `renderer/groundCache.js`); the Issues badge scan is cached per month and rescanned in idle time (`ui/diagCache.js`); toolbar density adapts to its content width (`ui/toolbar.js fitToolbar`).
- Moscow day-0 snapshot (W8): the default Moscow game (scenario moscow, seed 1, other options at defaults) is prebaked to `assets/scenarios/moscow-day0.json` (+ `.meta.json` with sha256) by `bun run snapshot:moscow` (`tools/moscow/snapshot.js`). `js/ui/scenarioSnapshot.js` `createGameFast` is used by `main.js initialGame` and `App.newGame`: exact default request -> fetch + `Game.deserialize` (~0.1 s), any failure (404, parse, version) -> `Game.create`. Regenerate with `bun run snapshot:moscow` after any change to the Moscow bake, scenario build code, landmarks, or save format; `tests/moscowSnapshot.test.js` fails with "stale snapshot" when it no longer matches a fresh build, and also checks that deserialize + stepDays matches a fresh build.
- Web QA scripts (outside the repo): `scratchpad/e2e/webqa.mjs`, `hitch.mjs`, `w2/*.mjs`, run via `withserver.sh` (temporary server).

## Terraform + cost preview (T12)
- Height model: one integer height 0..7 per tile (its N corner, see `renderer/heights.js`). Neighbour rule: all 8-adjacent tiles differ by at most 1 level.
- `js/simulation/cmdTerraform.js`: `terraform(ctx, op, rect, opts)` for `raise|lower|level|plant`; `estimateTerraform` and `planTerraform` are pure and shared by the command and the UI preview.
- Raise/lower seed the rectangle; a worklist relaxes the free neighbours into `[max(nb)-1, min(nb)+1]`. Water, buildings and track are never modified; a change touching them (or water edges) is refused with nothing applied. Level pins the rectangle to the start tile height.
- Costs: `COSTS.terraformStep` (60) per level moved on one tile, `COSTS.plantTree` (25) per grass tile, inflated via `constructionTotal`.
- Renderer: after a terraform, `app.exec` calls `Heights.refreshArea` for the changed area (+1 vertex border) before the ground chunk invalidation.
- Tools: Terraform (`Z`, C cycles raise/lower/level) and Plant trees (`Y`). The drag hint shows the live cost or the refusal reason; the overlay is red when invalid.
- Trees are forest terrain; demolish clears forest back to grass.
