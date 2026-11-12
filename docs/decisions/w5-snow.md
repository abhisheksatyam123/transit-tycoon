# W5: mapgen snow line wired to terrain generation

## What the setting is
- New Game > Map > "Snow line" (`js/ui/windows/newGame.js:127,143,180`): options Medium (default, 5), Low (3), High (7).
- Stored as `snowLine` in the mapgen options (`js/simulation/game.js:123` MAPGEN_DEFAULTS `snowLine: 5`;
  `js/ui/newGamePrefs.js:87` allowed values `[3, 5, 7]`). `mapgenOptions` keeps it only when non-default, so
  `state.mapgen` is only written for non-default games (`game.js:108,169`).
- Before W5 it was read only by the sub-arctic climate code (`js/simulation/climate.js:12-23`: `DEFAULT_SNOW_LINE = 5`,
  `snowLineOf`, `snowDensity(z, line) = z - line + 1` clamped 0..3, ported from OpenTTD `clear_cmd.cpp:220`,
  `tree_cmd.cpp:796`). `generateTerrain` ignored it: `js/simulation/map.js` hard-coded `t.height >= 7` -> `'snow'`.

## Mapping (the decision)
- Terrain snow starts at `snowLine + 2` levels (`snowTerrainHeight`, `js/simulation/map.js`, `SNOW_TERRAIN_OFFSET = 2`).
- Why +2: the level where OpenTTD's snow density reaches full snow (`snowDensity` index 3 at z = line + 2,
  `climate.js`; OpenTTD `TileLoopClearAlps` k = z - line + 1 >= 3). The default line 5 + 2 = 7 is exactly the old
  hard-coded threshold, so default maps are unchanged.
- Direction is OpenTTD's: a higher snow line means less snow. Low (3) -> snow from height 5; Medium (5) -> 7 (default);
  High (7) -> 9, i.e. no snow terrain on a 0..7 map (the line is above the top level).
- Units: the option is in our 0..7 height levels, not OpenTTD's 0..15 (OpenTTD default 10 of 15, see climate.js:7).
  No conversion was applied to the 3/5/7 values, which are the existing UI values.

## Default is unchanged (evidence)
- Default generation (no snowLine, or snowLine 5) has the same terrain as pre-W5 main (0ef8f63). Hashes of
  `height+terrain` over a 96x96 map, computed by running the main branch read-only and by this branch:
  seed 1 `846990cc2c31266d`, seed 2 `d58a0702c254ffdd`, seed 3 `51717027ca95d6e0`, seed 7 `096797ef9833d7af`;
  `Game.create({seed:1})` terrain `f692b5165f1fdc21`. All identical before and after.
- `bun tools/world-hash.js` -> `seed 1 days 60 hash e66b684174510b6b`.

## Code changed
- `js/simulation/map.js`: import `DEFAULT_SNOW_LINE` from `climate.js`; new exports `SNOW_TERRAIN_OFFSET`,
  `snowTerrainHeight(snowLine)`; `finishTerrain` (shared by `generateTerrain` and `generateTerrainFromHeights`) uses
  `snowAt = snowTerrainHeight(opts.snowLine)` instead of the literal 7. Doc comment of `generateTerrain` lists `snowLine`.
- `tests/w5Snow.test.js`: pinned default hashes (above), snow at the configured height and not below it, heights
  unchanged by the snow line, monotone snow count across lines, `mapgenOptions` keeps non-default only.

## Consistency with the town snow-climate rules (verified, not changed)
- Climate rules use the line itself (not line + 2): `climate.js:61` (town growth gate, `t.height < line` is free) and
  `town.js:134` (`growthNeeds` food for `tile.height >= line` in arctic games). `farmFields.js:43` uses `height + 2 >= line`.
- So in a sub-arctic game with the default line 5, towns on heights 5-6 are "above the snow line" for growth and get
  partial snow density, but their terrain stays grass (snow terrain starts at 7). Terrain snow and the climate line
  therefore differ by 2 levels by design (the climate density ramps up to full snow at line + 2). Each rule is
  self-consistent with OpenTTD; the mismatch is only visible on the map as a ramp, not a contradiction.
- Temperate games also get terrain snow at snowLine + 2 (the climate code is arctic-only). This was already the case
  before W5 (height >= 7 for every game); unchanged.

## Skipped / design items (not done)
- The mountain-style peak comment (`map.js` near `MOUNTAIN_PEAK`, "top level 7 = snow line") was left as is; it is the
  peak height for rock, not the snow line, and changing it would change default maps.
- Rock threshold `height >= 6` and the `height >= 7` clamp in `generateTerrainFromHeights` (`t.height = Math.min(7, h)`) were
  left unchanged.
- Snow/desert coverage percentages, tree placer, heightmap import, non-square maps and water borders: out of scope.
- DESIGN: whether the top setting value (High = 7) should mean "no snow terrain" (current), or the scale should be
  re-spread over 0..7 (for example 4/5/6 -> line + 2 = 6/7/8). Decision for the user.
- DESIGN: whether temperate games should also honour the snow line for terrain (currently only sub-arctic has the line
  for climate effects, and terrain snow applies to all games at snowLine + 2 = 7 by default).
