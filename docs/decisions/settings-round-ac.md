# Settings round AC: default-preserving ports

Rule: every new setting's default reproduces the current Transit Tycoon (TT) behaviour. The OpenTTD (OTTD) default is recorded but not used.

| Item | TT key | OTTD default | TT default (kept) | Status |
|---|---|---|---|---|
| economy.exclusive_rights | `exclusiveRights` | true | true | done |
| construction.road_stop_on_town_road | `roadStopOnTownRoad` | true | true | done |
| construction.extra_dynamite | (none) | true | true | skipped (see below) |
| company.engine_renew_months | `engineRenewMonths` | 6 | 0 | done |
| company.engine_renew_money | `engineRenewMoney` | 100000 | 0 | done |
| company.renew_keep_length | (none) | false | keep wagon count | skipped (see below) |

## Implemented

**exclusiveRights.** OTTD `TownActionBuyRights` (town_cmd.cpp:3643) refuses when `economy.exclusive_rights` is off, and `GetMaskOfTownActions` (town_cmd.cpp:3754) does not offer the action.
- `js/simulation/settings.js:199` default `true`.
- `js/simulation/townAuthority.js:186` `actionList` drops the `rights` entry when off (not listed).
- `js/simulation/townAuthority.js:196` `doTownAction` refuses `rights` with "Exclusive transport rights are disabled in game settings".

**roadStopOnTownRoad.** OTTD `station_cmd.cpp` (~line 1159): a road stop over a road owned by `OWNER_TOWN` is refused when the setting is off. In TT a town road is a tile with `t.road` and `t.owner === 'town'` (the same test `cmdOneWay.js` uses). Tram stops are excluded because the OTTD rule covers road stops.
- `js/simulation/settings.js:201` default `true`.
- `js/simulation/cmdStation.js:166` `buildRoadStop` refuses bus/truck stops on town roads when off. Company roads are unaffected.

**engineRenewMonths.** OTTD `Vehicle::NeedsAutorenewing` (vehicle.cpp:176) requires `age - max_age >= engine_renew_months*30` days. TT renews when `age > effectiveMaxAge`. The delay is added to that threshold as `months*30` days.
- `js/simulation/settings.js:203` default `0`. With 0 the threshold is unchanged (`+0`), so behaviour is bit-identical.
- `js/simulation/autorenew.js:27` `renewDelayDays` helper.
- `js/simulation/autorenew.js:137` (`isAutoreplaceEligible`) and `js/simulation/autorenew.js:127` (`autorenewVehicle`) use it.

**engineRenewMoney.** OTTD `NeedsServicing` (vehicle.cpp:244) refuses renewal when the company's available money is below `engine_renew_money`. TT adds this check to `replaceVehicle` after the purchase-cost check.
- `js/simulation/settings.js:205` default `0`. The extra check runs only when the value is above 0, so 0 is bit-identical. Infinite money and editor mode are honoured through `checkMoney`.
- `js/simulation/autorenew.js:59` (`replaceVehicle`).
- Difference from OTTD: OTTD also uses this to decide whether a vehicle goes to a depot for service. TT only applies it when the replacement is attempted. The "could not afford" news then appears for autoreplace too.

## Skipped

**extraDynamite (construction.extra_dynamite).** OTTD `road_cmd.cpp` (~line 299) refuses removing one piece of a multi-bit road junction (`n.Count() > 1 && n.Any(remove)`) when the setting is off. TT has no per-bit road removal. `cmdTrack.js` strips a whole road layer per tile (`stripLayer`, ~line 572), and `townAuthority.js` `demolishRefusal` only checks the town authority rating per tile. There is no junction-piece state to gate, so the setting would not map to anything real. Skipped.

**renewKeepLength (company.renew_keep_length).** OTTD `autoreplace_cmd.cpp:770` uses this as `wagon_removal`: when set, wagons that do not fit the replacement are removed. OTTD's default is false (no wagon removal). TT's replacement always keeps the wagon count (`spec.wagons = v.wagons` in `autorenew.js`) and has no model for removing wagons on renewal. A `false` default that matches current TT would mean "keep length", which is the opposite of OTTD's wagon-removal flag, so the name does not map cleanly. Skipped.

## Tests

`tests/roundACSettings.test.js` (11 tests): defaults; SETTING_META key count and group for the four keys; rights listed, bought, and refused when off; other town actions still listed when off; bus stop on a town road allowed by default, refused when off, company road still allowed; autorenew at max age by default; delayed by 6 months; money threshold blocks renewal when above company money; purchase cost only at default.

SETTING_META entries: `js/ui/settingsGroups.js:37` (economy), `:98` (construction), `:225` and `:227` (companies).
