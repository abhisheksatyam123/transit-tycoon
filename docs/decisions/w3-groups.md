# Vehicle group statistics (W3)

UI/display only. No simulation state, RNG use, save format or command rule changed; world hash is unchanged
(`e66b684174510b6b`). All numbers are derived read-only from existing vehicle fields when the vehicle list window
refreshes (the existing refresh cadence), so there is no per-tick cost.

## Added

### `js/ui/vehicleGroupRows.js` (pure helpers, unit tested)

1. `loadPercent(v)` — current load of one vehicle in percent.
   - OpenTTD `CalcPercentVehicleFilled` (`src/vehicle.cpp:1505-1558`): `count` = cargo stored in all parts,
     `max` = total cargo capacity; no capacity returns 100; below 50% round up, at/above 50% round down.
   - TT equivalents: `v.load.amount` (already the sum over a mixed consist's cargo slices, see `syncLoad` in
     `js/simulation/orders.js:265`) and `v.capacity` (total over all parts).
2. `groupStatistics(vehicles)` — aggregate for a group.
   - `profitThisYear` = sum of `v.profitThisYear` (`GetDisplayProfitThisYear` sum in `src/group_gui.cpp:653-659`).
   - `profitLastYear` = sum of `v.profitLastYear` (`GetDisplayProfitLastYear` sum in `src/group_gui.cpp:653-659`;
     OpenTTD caches the same sum in `GroupStatistics::profit_last_year`, `src/group.h:26-27`,
     `src/group_cmd.cpp:189-199`). TT has tracked `v.profitLastYear` since before this change
     (`js/simulation/vehicles.js:197`, rolled over in `js/simulation/vehicleLife.js:19`), so no new field was added.
   - `occupancy` = sum of `loadPercent(v)` / vehicle count, integer division
     (`src/group_gui.cpp:653-676`: `occupancy += v->trip_occupancy` ... `occupancy / vehicle_count`).
   - Empty group: count/profits/occupancy all 0.

### `js/ui/windows/vehicleList.js` (group UI)

1. Selected-group details panel (three rows, OpenTTD `WID_GL_INFO`, `src/group_gui.cpp:650-679`):
   "Profit this year", "Profit last year", "Current usage". Shown only while a numbered group is selected in the
   group filter, computed over the group's vehicles that are currently listed (kind/cargo filters applied, like
   OpenTTD's `this->vehicles`). Default (no group selected) UI is unchanged.
2. Grouped ("Group by: Group"/"Shared orders") bucket rows: the two previously empty cells now show
   "Total last year" and "Usage" (the same group occupancy percentage). All existing columns and rows are unchanged.

## Skipped (and why)

- **True last-trip occupancy**: OpenTTD's `trip_occupancy` is a NOSAVE per-vehicle field refreshed when a vehicle
  leaves a station (`src/vehicle_base.h:296`, `src/vehicle.cpp:2408`). TT does not track it and adding it would be a
  new tracked per-vehicle field, which is out of scope. The added "Current usage" uses the current load/capacity,
  which is exactly what `CalcPercentVehicleFilled` computes and what current OpenTTD labels "Current usage"
  (`src/lang/english.txt:4219`).
- **Profit icon / minimum-age profit statistics**: OpenTTD's group-list profit icon uses
  `profit_last_year_min_age` and `VEHICLE_PROFIT_MIN_AGE` (`src/group_cmd.cpp:202-235`,
  `src/group_gui.cpp:318-329`). TT's group header has no icon column and matching that would need the min-age
  definition applied to vehicle age; left out rather than inventing semantics.
- **User-only scope decisions (not implemented)**: nested groups, per-vehicle-type groups, per-group autoreplace scope,
  wagon autoreplace, when-old autoreplace, wagon removal rules.
