# W2: construction.* settings gaps (OpenTTD parity audit)

Source: `scratchpad/openttd/src/table/settings/world_settings.ini` (construction section) and
`settings_type.h:485-491`, `:477-481` (TrainSignalSide enum).

## Settings added (default = current TT behaviour)

| TT key | OpenTTD key | OpenTTD default | TT default | Behaviour / wiring |
|---|---|---|---|---|
| `trainSignalSide` | `construction.train_signal_side` | `RoadVehicleDrivingSide` (follows road side) | `'right'` | Render only. `js/renderer/layers/signals.js` `signalPostSide()`; `drawSignalPost(..., side)`; renderer sets `signalPostSideSign` each frame (`renderer.js`). `'left'` = post on the left, `'driving'` = follows `roadSide`. Sprite path mirrors the sprite about the tile centre; direction arrows are not mirrored. |
| `buildOnSlopes` | `construction.build_on_slopes` | `true` | `true` | `js/simulation/cmdTrack.js` `buildLine()`: when `false`, refuses a rail/road line that crosses a tile whose 2x2 corner heights are not level (`isLevelTile` in `map.js`, error `ERR.slope`). Covers `buildRail`/`buildRoad` lines; station, depot and bridge/tunnel placement are not checked. |
| `mapHeightLimit` | `construction.map_height_limit` | `0` (no limit) | `7` | `js/simulation/cmdTerraform.js` `evaluate()`: `heightCap` replaces the hard `MAX_HEIGHT` ceiling (raise check and neighbour clamp). TT default 7 = the current cap. OpenTTD's 0 means "no limit" and its range starts at 15 (tile units); TT's height scale is 0..7, so the TT default is 7 and the options are 3..7. |

Each key has exactly one `SETTING_META` entry in `js/ui/settingsGroups.js` (group `construction`).
Tests: `tests/w2Construction.test.js`.

## Skipped

- `construction.max_bridge_height` (OpenTTD default 12): TT has no bridge-height limit. `landBridges.js` only requires equal
  head heights and that the deck clears the ground below (`landBridges.js:45,67`). There is no hard-coded
  maximum to gate, so no setting (inventing one would be a new rule).

## Report only: existing defaults and checks (not changed)

- `maxBridgeLength` 12 (OpenTTD `max_bridge_length` 64). `settings.js:209`, `trackRules.js:85`.
- `maxTunnelLength` 16 (OpenTTD `max_tunnel_length` 64). `settings.js:211`, `trackRules.js:87`.
- `autoslope` false (OpenTTD `construction.autoslope` default true). `settings.js:67`.
- `buildOnSlopes`, `mapHeightLimit` and `trainSignalSide` above use the TT default where OpenTTD differs (true = true; 7 vs 0; 'right' vs driving side). These are default-preserving choices.
- `crossing_with_competitor` (OpenTTD def true) was not in the audit scope; not checked here.

## Off-by-two check: maxBridgeLength

The setting says "heads included". The counts are:

- `js/simulation/cmdTrack.js:57` `planBridges`: span = water run `(j - i)` + 2 heads = `j - i + 2`; rejects when `> maxLen`.
  So max total tiles including heads = `maxLen` (12). **Consistent with the setting.**
- `js/simulation/landBridges.js:35` `planLandBridge`: `n = pts.length` (includes heads); rejects when `n > maxLen`.
  Max total = 12. **Consistent.**
- `js/simulation/aqueduct.js:75` `planAqueduct`: `n = |dx|+|dy|+1` (includes both heads); rejects when `n - 2 > maxLen`.
  Max total = 14, i.e. 12 tiles between the heads. **Off by two** against the "heads included" setting text and its own message
  (`aqueduct.js:21` "max 12 tiles"). Fed by the same setting through `cmdCanal.js:140`.
- Typed bridges: `landBridges.js:150` message "max `maxSpan - 2` tiles" counts between heads, as OpenTTD does. Not part of the default path.

Verdict: the standard bridge (`cmdTrack.js:57`, `landBridges.js:35`) enforces 12 tiles including heads, which is what the setting
says. The aqueduct path (`aqueduct.js:75`) allows 14 including heads, so it is off by two. Not changed (out of scope).

## Verified without change

- Terraform ceiling `MAX_HEIGHT = 7` (`cmdTerraform.js:23`); now read via `mapHeightLimit`.
- Track placement had no slope check before this change (no `slope` / `flat` test in `cmdTrack.js`, `trackRules.js`).
- Signal post side was hard-coded to the viewer's right (`signals.js` previously `px = sx + 6`).
