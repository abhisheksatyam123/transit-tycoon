# Aircraft range (OpenTTD `vehicle.aircraft_range`): decision needed

Status: OPEN, awaiting a choice. Not implemented. Default behaviour is unchanged.

## Key finding (corrects the earlier draft)
OpenTTD's **base-game aircraft have no range**. In `scratchpad/openttd/src/table/engines.h:602-`, the `AVI(...)` macro expands to
`{ a, b, c, d, e, (g * 128) / 10, f, h, i, 0 }`; the trailing `0` is `AircraftVehicleInfo::max_range` (`engine_type.h:146`).
All 41 base aircraft entries use that macro, so their `max_range` is 0.
`Engine::GetRange()` returns 0 for range 0, meaning unlimited (`engine.cpp:481-487`).
So in OpenTTD's base set, `vehicle.aircraft_range` (default on) changes nothing. Non-zero ranges only come from NewGRF,
via `PROP_AIRCRAFT_RANGE` (0x1F, `newgrf/newgrf_act0_aircraft.cpp:164-165`). Transit Tycoon has no NewGRF.

## What the setting does when a model has a range > 0 (OpenTTD)
- **Hangar choice:** `FindNearestHangar` (`aircraft_cmd.cpp:121-170`) skips a hangar when the last or next destination is farther than the range (`:157-160`).
- **Order validation:** `CheckAircraftOrderDistance` (`order_cmd.cpp:1471-1487`) refuses goto orders beyond range. It is applied at `order_cmd.cpp:1544` and `:1591`. The validator returns true when range is 0.
- **Too far:** `AircraftHandleDestTooFar` (`aircraft_cmd.cpp:2079-2100`, called at `:2126`, `:2135`) sets a DestinationTooFar flag, fires a script event and posts a news item.
- **UI:** the range is shown in the vehicle window (`vehicle_gui.cpp`, `STR_VEHICLE_INFO_MAX_SPEED_TYPE_RANGE`), the buy list sort (`build_vehicle_gui.cpp:757`) and the order list (`order_gui.cpp:353`, "out of range").
- It is not a fuel model.

## What Transit Tycoon does now
- No range field on aircraft models (`js/config/aircraft.js`: speed, capacity, cost, running, reliability, cargos).
- No range or fuel check in `js/simulation/aircraft.js`, `airportTypes.js` or `routing.js`. An aircraft can serve any airport pair.
- This matches OpenTTD's base set exactly, where every aircraft is unlimited.

## Options
1. **Keep as is (recommended).** It matches OpenTTD's base-game behaviour. Document as deliberate: "no aircraft range, as in OpenTTD base set".
2. **Opt-in, default off** (`aircraftRange: false`). Add a per-model `range` in tiles with values chosen by us (not from OpenTTD, which has none for the base set). When on, port the hangar choice, order validation and too-far flag above. Default-preserving: the hash does not change. Effort: M.
3. **Default on with invented values.** A gameplay change with no OpenTTD basis. Needs your explicit approval.

## Recommendation
Option 1. The OpenTTD default-on setting has no effect on the base aircraft set, so porting it would add behaviour only for invented ranges. Choose option 2 only if you want an aircraft-range gameplay feature.

## Open data
- Range values per TT aircraft model: none exist in OpenTTD's base set. They would be our own choice.
