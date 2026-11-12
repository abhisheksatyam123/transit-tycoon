# X2: opt-in tram queueing (`tramQueue`)

## What the setting is
- New game setting `tramQueue` (`js/simulation/settings.js:80-84`), default **`false`**. One `SETTING_META`
  entry in the Vehicles group (`js/ui/settingsGroups.js:33-34`).
- Label: "Trams queue behind road vehicles". Live-toggleable: the occupancy layer reads it through
  `getSetting` every tick (`js/simulation/settings.js:264-268`), so no save migration is needed and the
  setting is optional/lazy in `state.settings`.
- When ON, `occupancyLayer(v, state)` returns `'road'` for `v.kind === 'road' && v.roadType === 'tram'`
  (`js/simulation/blocking.js:28-38`). Trams are then indexed in the same road occupancy map as buses and
  trucks, so all downstream rules apply to them unchanged:
  - `blockerOn` (`blocking.js:158-172`): only a same-direction vehicle blocks on a plain tile (oncoming
    trams/buses pass); on a stop tile any road vehicle blocks (one bay, not two lanes).
  - `bayInUse` (`blocking.js:180-183`) and `bayEntryRefused` (`movement.js:499-510`) now see tram traffic,
    both for a tram order and for a bus order at a shared bus stop (trams stop at bus stops, buses do not
    stop at tram-only stops, so the shared case is a bus stop on road+tram tiles).
  - `tryFreeBay` (`movement.js:533-539`) re-routes a held tram to a free bay like a road vehicle.
  - `syncOccupancy` (`blocking.js:118-139`) re-indexes the tram after it moves, so the next vehicle in the
    tick order sees it.
- `layerOf` (`routing.js:15-18`, the *routing* layer) is deliberately **not** changed: pathfinding, tram
  track connectivity and stop kinds still use the tram layer. Only the occupancy/blocking layer changes.

## Default is unchanged (evidence)
- OFF: `occupancyLayer` returns `null` for trams exactly as before (the code path for non-trams is
  unchanged; trams add one settings property read). `beginOccupancy` therefore does not put trams in
  `occ.keys`, `occ.road` or `occ.rail`; `blockerOn`/`bayInUse`/`syncOccupancy` never see them. No extra
  Map insert/remove/allocation happens for trams.
- ON cost: one `getSetting` read per vehicle per tick (part of the existing `occupancyLayer` call, passed
  into `bodyKeys` so it is not repeated), plus the same add/remove of up to two body keys that buses
  already pay. No allocation in the hot path (`bodyKeys` reuses the old key array, `blocking.js:54-68`).
- The default path is covered by the existing tram / queueing / collision tests (all pass unchanged) and
  by the gates below.
- World hash and 1-year city simulation are byte-identical (gates below), which confirms nothing in the
  default simulation changed.

## Mapping to OpenTTD (section "Gap 1 — Tram queueing" of road-design-spec.md)
- OpenTTD road vehicles are one type; trams are road vehicles on a tram roadtype, so `RoadVehFindCloseTo`
  / `FindClosestBlockingRoadVeh` (`roadveh_cmd.cpp:634-701`) blocks a tram behind the vehicle ahead
  exactly like a bus. Only same-direction, same-height vehicles block (`:643-646`); the tram bit is never
  consulted.
- TT's existing blocking model is tile-based rather than pixel-based (`blocking.js` module comment), so
  "queueing" here means: the follower is held at the tile boundary (`movement.js hold`, `:518-530`) and
  never enters a tile already claimed by a same-direction vehicle. Oncoming traffic passes. At a stop
  tile the bay is exclusive, which is the same outcome as OpenTTD's bay queueing.
- The existing 3-day `BLOCK_TIMEOUT_TICKS` turn-around still applies to a tram blocked by a *moving*
  vehicle; a tram blocked by a *loading* tram waits (same as buses today).

## Tests
`tests/x2TramQueue.test.js`:
- default OFF and exactly one Vehicles-group `SETTING_META` entry;
- OFF: `occupancyLayer` null, `beginOccupancy` does not index the tram; ON: tram on the road layer with
  its two body tiles;
- ON: tram held behind a loading tram, bus held behind a loading tram, tram held behind a loading bus;
  OFF: the tram is not indexed at all;
- ON: opposite-direction trams pass;
- sim: two trams queue for one tram bay (never share a tile, both served); a bus and a tram queue behind
  each other in both buy orders (never share a same-direction tile, both served); opposite-direction
  trams both arrive. With `tramQueue` forced off, the two queueing sim tests fail (verified), so they do
  exercise the setting.

## What was not done (decisions for later)
- **OpenTTD's 20-day drive-through** (`roadveh_cmd.cpp:698`, `blocked_ctr > 1480`): a follower that has
  been blocked for ~20 OpenTTD days is allowed to drive through the blocker to break deadlock. Not
  implemented; TT keeps its existing 3-day turn-around (`BLOCK_TIMEOUT_TICKS`,
  `blocking.js:21`) unchanged, as instructed.
- The 3-day turn-around timer itself was not changed.
- No pixel-proximity smoothing of a queue (`v->cur_speed = u->cur_speed`, `roadveh_cmd.cpp:1459`): TT
  holds vehicles at tile boundaries for road vehicles, and trams now use that same model.
- No tram overtaking (OpenTTD's overtake machinery); trams simply follow. `roadOvertake.js:61` still
  refuses overtaking by/around trams.
- No signals for trams and no separate tram lane geometry: oncoming traffic passes, as for road vehicles
  in TT.

## Gates (this branch)
- `bun run check` -> `OK: 815 files`
- `bun tools/world-hash.js` -> `seed 1 days 60 hash e66b684174510b6b chars 919564`
- `timeout 110 bun tools/simulate-city.js --years 1 | grep -c MATCH` -> `1`
- Settings invariant: `keys 119 bad 0` (one new key with exactly one metadata entry).
