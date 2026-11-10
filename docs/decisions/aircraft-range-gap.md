# Aircraft range (OpenTTD `vehicle.aircraft_range`): decision needed

Status: OPEN, awaiting a choice. Not implemented. Default behaviour is unchanged.

## What OpenTTD does
- Setting `vehicle.aircraft_range`, default **on** (`scratchpad/openttd/src/table/settings/game_settings.ini`).
- `Engine::GetRange()` returns the model's `max_range` when the setting is on, 0 (unlimited) when off (`engine.cpp:481-486`).
- The range limits **which hangar an aircraft returns to** (`aircraft_cmd.cpp:121-170`, `FindNearestHangar`): a hangar is skipped when the
  last or next destination is farther than `max_range` from it. It is not a fuel model and does not stop a route being planned.
- Range is also shown in the vehicle window and the buy list (`vehicle_gui.cpp:2647`, `build_vehicle_gui.cpp:346,757`).

## What Transit Tycoon does now
- No range field on aircraft models (`js/config/aircraft.js`: speed, capacity, cost, running, reliability, cargos only).
- No range or fuel check anywhere in aircraft routing or depot choice (`js/simulation/aircraft.js`, `airportTypes.js`, `routing.js`).
- So an aircraft can serve any airport pair, with no limit.

## Options
1. **Keep as is** (no range). Simplest. Document as a deliberate omission. Current state.
2. **Opt-in setting, default off** (`aircraftRange: false`). When on: each model gets a `range` in tiles (new data, values to choose), and hangar selection skips hangars out of range of the last and next destination, as OpenTTD does. Default-preserving: the hash does not change. Effort: M (data + routing + tests).
3. **Default on (OpenTTD).** Changes existing routes and money. Needs the range data above before it is safe.

## Recommendation
Option 2 if range matters to you; otherwise option 1. Option 3 is a gameplay change and needs your explicit approval.

## Open data
- Range values per aircraft model (none in TT data). OpenTTD's per-model `max_range` lives in its engine tables, not in this source tree; choose values by hand or find the table.
