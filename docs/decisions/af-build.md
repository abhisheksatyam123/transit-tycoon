# AF build: competitor road stops, vehicle list sorts, engine preview block

Rule: every new setting's default reproduces the current Transit Tycoon (TT) behaviour. The OpenTTD (OTTD) default is recorded in comments and here, never used as the TT default. World hash unchanged (e66b684174510b6b); no extra RNG on the default path.

| # | Item | OTTD rule (file:line) | TT change (file:line) | TT default |
|---|---|---|---|---|
| 1 | `roadStopOnCompetitorRoad` (group construction) | `table/settings/world_settings.ini:544` (`construction.road_stop_on_competitor_road`, def true); `station_cmd.cpp:1160` (refuse when road owner is not none and `CheckOwnership` fails) | `js/simulation/cmdStation.js:171` (refusal in `buildRoadStop`, bus/truck only); helper `roadOwnerId` above `buildRoadStop` | true = allowed (unchanged) |
| 2 | Vehicle list sort `number` and `capacity` | `vehicle_gui.cpp:57-68` (`VehicleNumberSorter`, sorter set incl. capacity-style list); list built ~100-121 | `js/ui/windows/vehicleList.js` `VEHICLE_SORTS` (two entries appended at the end) and `sortKey` (`number` = vehicle id, `capacity` = `v.capacity`, falling back to the model capacity) | default sort `name` (index 0), unchanged |
| 3 | `enginePreviewBlock` (group companies) | `engine.cpp:963` (offer only if `block_preview == 0` and not asked); `engine.cpp:1133` (`block_preview = 20` months) | `js/simulation/enginePreview.js`: `BLOCK_DAYS = 600` (20 x 30 days), `bestCompanyKey` skips `rec.block[key]` dates not yet passed, `blockCompany` called on player decline (`answerEnginePreview`) and on timeout (`updateDaily`) | false = offered again at once (unchanged); `rec.block` is never written |

## Details

- **Owner representation.** Road tiles carry `t.owner` = `'town'`, `'company'` (player), `'rival'` (with `t.rivalId`), or none (set in `cmdTrack.js:359-362`). A competitor road is `'rival'` or `'company'` whose owner id differs from the builder (`opts.owner ?? null`). This matches `station_cmd.cpp:1160`: the check does not apply to the builder's own road.
- **Roads not owned by a company** (`t.owner` unset or `'town'`) keep their existing rules; the town check is unchanged.
- **Tram stops** are not affected (`kind !== 'tram'`), as with the town check.
- **Sorts.** The default sort (`name`, index 0) and the indices of all existing keys are unchanged. `number` sorts by vehicle id ascending (display order, as specified); the ties-break on unit number then id is kept.
- **Capacity** is the vehicle's total capacity over all its parts (`v.capacity`). For a mixed consist this is the sum over all cargoes, not one cargo's share.
- **Engine preview block.** Rivals always accept a preview (the AI takes it at once), so the block only applies to the player's decline and timeout. The block is a date (`dayNumber`) per company per model, stored on the model's preview record as `rec.block`, and is written only when `enginePreviewBlock` is on, so default saves are byte-identical.

## Left out / caveats

- **Preview block has no effect within one preview cycle.** `rec.asked` already stops a company being asked twice in one preview. TT has no second preview cycle per model, so the 20-month block only matters where a record is re-opened. It is implemented as the data and gate; no new preview cycle was invented.
- **Sort 'number'** uses vehicle id, not the unit number (the spec asked for id). OTTD sorts by unit number.
- **Sort 'capacity'** does not split by cargo type (see above).
- **Competitor road for AI.** With the setting off, AI rivals are refused the same way (`buildRoadStop` is shared). No AI policy change was made.

## Tests

`tests/afBuild.test.js` (9 tests):
- roadStopOnCompetitorRoad: default true and one `SETTING_META` entry (construction); default allows a bus stop on a rival road (pin); off refuses bus and truck on a rival road and still allows own road; a rival builds on its own road when off, and is refused on the player road.
- Vehicle list: default name sort first 3 rows pinned; `number` and `capacity` are the last two entries; both sort ascending and descending on a fixed list.
- enginePreviewBlock: default off, one `SETTING_META` entry, `rec.block` undefined and the declined player is picked again at once (pin). On: the block is `today + 600`, `bestCompanyKey` returns null, still null one day before the end, and `'p'` again at the end.

Mutation check (scratch copy in `$HOME/tmp/af1mut`): forcing the competitor-road gate on fails the default pin; removing the refusal fails the 'off' tests (2 tests); making the block never written fails the 'on' test. The sort tests have no gate; removing the new entries would fail the index test.
