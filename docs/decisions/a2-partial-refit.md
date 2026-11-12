# Partial refit (A2): opt-in loaded refit

Decision: add `partialRefit` (DEFAULT_SETTINGS, default **off**) that lets a vehicle stopped in a depot be
refitted **while loaded**. Off is byte-for-byte today's behaviour.

## What is built

- **Setting**: `partialRefit: false` in `js/simulation/settings.js` DEFAULT_SETTINGS (group `vehicles`), exactly
  one `SETTING_META` entry in `js/ui/settingsGroups.js`. No new vehicle/order/state fields, so old saves load
  with the default and a default save gains no keys (generic settings bag only).
- **Depot refit command** (`cmdVehicle.refitVehicle`): resolves the setting and passes `opts.partial` to
  `refitCore`. The depot-only check (`v.state === 'depot'`) is unchanged.
- **`refitCore`** (`js/simulation/refit.js`), OpenTTD `RefitVehicle` semantics (vehicle_cmd.cpp:376-506, 476-477):
  - Off: the existing checks in their existing order (unsupported, same cargo, mixed consist, non-empty =>
    "Unload the vehicle before refitting").
  - On: the loaded check is skipped. The same cargo type keeps the load, truncated to the newly computed
    capacity (`truncateLoad`, cargodist `dests` pruned to match). A different cargo type drops all cargo
    (`dropLoad`: amount 0, `fromStationId` cleared, `feeder`/`dests` removed); nothing is paid for the lost cargo.
  - Cost: unchanged flat `REFIT_COST_FRACTION` (10%) of the inflated purchase price, charged on a cargo type
    change. A same-cargo refit (capacity change, e.g. fewer wagons) is **free**, as OpenTTD charges refit cost
    only when `cargo_type != new_cargo_type` (vehicle_cmd.cpp:~333). This is the only cost difference under ON,
    and it cannot occur off (same-cargo is rejected).
- **UI** (`vehicleDetail.js`): "Refit" is no longer disabled for a loaded vehicle and the "Unload first" note is
  hidden when the setting is on; with it off the window behaves as before.

## What is NOT built

- **Station auto-refit** (OpenTTD `CARGO_AUTO_REFIT`): out of scope. It needs a per-station waiting-cargo lookup
  and returning the load to the station queue instead of dropping it; the spec says it needs its own design.
- **Depot ORDER refit with cargo aboard**: unchanged. `movement.js` calls `refitCore` without `opts.partial`, so a
  refit order on a loaded vehicle still fails with the existing notification and leaves carrying its cargo. The
  spec's decision (e) is a user decision; this refit path was deliberately left alone.
- **Per-model refit cost** (`refit_cost` engine property / a `refitCostMode`): not built; model data has no such
  field. TT keeps the flat 10% default.
- **Returning dropped cargo to a station / payment for it**: dropped cargo is simply lost, matching OpenTTD's
  depot refit (no payment).

## Tests

`tests/a2PartialRefit.test.js` (6 cases): off rejects a loaded refit; on keeps+truncates a same-cargo load to the
new capacity; on drops cargo and charges on a type change; cost is the unchanged flat formula; the setting has
exactly one meta entry in `vehicles`; a default save has no `settings` key and the setting round-trips when on.
`tests/refit.test.js` stays green.
