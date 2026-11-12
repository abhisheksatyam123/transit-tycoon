# AF2 — OpenTTD climate growth gates (opt-in `climateGrowthOttd`)

Setting `climateGrowthOttd` (default **false**) makes the arctic and sub-tropical growth gates use OpenTTD's exact
`UpdateTownGrowth` conditions, and makes arctic farm fields respect the snow line. With it off — every existing game,
every default save — behaviour is byte-identical to before. Temperate games are untouched in both states.

## OpenTTD rule (quoted)

`src/town_cmd.cpp:3938-3956` (`UpdateTownGrowth`):

```cpp
if (t->fund_buildings_months == 0) {
    /* Check if all goals are reached for this town to grow (given we are not funding it) */
    for (TownAcceptanceEffect i : EnumRange(TownAcceptanceEffect::End)) {
        switch (t->goal[i]) {
            case TOWN_GROWTH_WINTER:
                if (TileHeight(t->xy) >= GetSnowLine() && t->received[i].old_act == 0 && t->cache.population > 90) return;
                break;
            case TOWN_GROWTH_DESERT:
                if (GetTropicZone(t->xy) == TropicZone::Desert && t->received[i].old_act == 0 && t->cache.population > 60) return;
                break;
```

* Arctic (`TOWN_GROWTH_WINTER`, line 3944-3946): growth is refused **only** when the town centre is at/above the
  snow line, its activity is zero and its population is **> 90**. A town of 90 or fewer people may grow without food.
* Tropic desert (`TOWN_GROWTH_DESERT`, line 3947-3949): same shape, threshold **> 60**.
* `if (t->fund_buildings_months == 0) { ... }` (line 3940): a **funded** town skips all goal checks; funding lets
  even a starved arctic/desert town grow. (`economy.town_growth_rate == 0` also bypasses the goals — line 3938.)

`src/industry_cmd.cpp:1052-1056` (`PlantFarmField`):

```cpp
if (_settings_game.game_creation.landscape == LandscapeType::Arctic) {
    if (GetTileZ(tile) + 2 >= GetSnowLine()) return;
}
```

## TT files and what changed

| Rule | OpenTTD | TT before | TT with `climateGrowthOttd` on |
|---|---|---|---|
| Arctic gate | town_cmd.cpp:3944-3946 | `js/simulation/climate.js:51` `townGrowthAllowed`: above the line, food last month required, always | `js/simulation/climate.js:51-67`: funded town → allowed; else allowed when food > 0 **or population <= 90**; population > 90 without food stays blocked |
| Desert gate | town_cmd.cpp:3947-3949 | `js/simulation/climate.js:149` `tropicGrowthAllowed`: desert town needs FOOD **and** WATER, always | `js/simulation/climate.js:149-174`: funded town → allowed; else allowed when FOOD+WATER > 0 **or population <= 60**; population > 60 without both stays blocked |
| Funded skip | town_cmd.cpp:3940 | gates applied regardless of funding | `fundMonths > 0` skips both gates |
| Farm fields | industry_cmd.cpp:1052-1056 | `js/simulation/farmFields.js:38` `ringSites`: any flat free tile | `farmFields.js:42-44` `snowBlocksField`: on arctic maps tiles with `height + 2 >= snowLine` are not field sites |

Setting plumbing: `js/simulation/settings.js:115` (`climateGrowthOttd: false`), one `SETTING_META` entry in
`js/ui/settingsGroups.js:265` (group `environment`). Tests: `tests/afClimate.test.js`.

## `old_act` mapping

OpenTTD's `t->received[i].old_act` is the amount of that acceptance cargo the town received last month (0 = the
town was inactive for that goal). TT has no separate `old_act`; the same gate already uses the delivered-cargo
field as its activity signal, so we reuse it: `town.foodLastMonth > 0` for the arctic (FOOD goal) and
`foodLastMonth > 0 && waterLastMonth > 0` for the desert (FOOD and WATER goals). This is exactly the condition the
gate already used for "active", per the task.

## Defaults preserved / limits

* Default false: no new `state.settings` key is written, no RNG is drawn and no code path changes, so the world hash
  stays `e66b684174510b6b`. A funded town without food is still blocked by default (as today).
* Temperate: neither gate is active and `isArctic()` is false, so nothing changes in either mode.
* Farm fields remain opt-in (`farmFields`); the snow check only combines with that setting, so default games plant
  nothing either way. OpenTTD's `GetTileZ + 2 >= GetSnowLine` is kept literally; with our 0..7 heights and the
  default line 5 that excludes field tiles from height 3 upward (one level of buffer below the snow line).
* OpenTTD's `town_growth_rate == 0` bypass (line 3938) is already handled by TT's `townGrowthRate: 'none'`, which
  skips growth entirely; it is not duplicated in the gates.
* Only towns whose `fundMonths` field survives (set by `townAuthority.js` fund action) benefit from the funded skip.
