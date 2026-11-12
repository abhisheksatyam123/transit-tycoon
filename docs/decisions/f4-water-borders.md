# F4: opt-in water borders (`waterBorders` mapgen option)

## What the feature is
A map-generator option that floods map-edge tiles with water at height 0 — the OpenTTD "water borders"
idea (a map surrounded by sea instead of raw land ending at the void). Opt-in: the default is **`none`**
(absent from `state.mapgen`), so historic maps, saves and the world hash are untouched.

- `MAPGEN_DEFAULTS.waterBorders = 'none'` (`js/simulation/game.js`). `mapgenOptions()` strips it when it
  equals the default, so default games never store `state.mapgen.waterBorders` and default saves/state
  are byte-identical.
- Not a `DEFAULT_SETTINGS` key: it only affects world generation, like `terrain`/`rivers`/`lakes`, so it
  lives in the New Game mapgen list (no `SETTING_META` entry is needed or added).
- New Game dialog: a "Water borders" select (`js/ui/windows/newGame.js`), remembered with the other
  mapgen choices in `tt.newGameMapgen` (`MAPGEN_PREF_VALUES` in `js/ui/newGamePrefs.js`).
- Settings offered: `none` (default), `all` (a ring on all four edges), `random` (from the game seed),
  and per-side `north` / `east` / `south` / `west` in the dialog. The generator also accepts a
  comma-separated side list (e.g. `north,south`) for scripts/tests.

## How it works
`js/simulation/map.js`:
- `waterBorderMask(option, seed)` maps the option to a side bitmask (north 1, east 2, south 4, west 8).
  `'random'` = `hashSeed(String(seed) + ':waterBorders') % 15 + 1`: a non-empty subset of the four sides
  (the full ring is one of the 15 outcomes), derived from the **game seed** with a separate salt, not
  from the terrain RNG stream. So it is deterministic for a seed, independent of the other mapgen
  options, and consumes no draws from the shared terrain RNG (towns/industries are unaffected).
- `applyWaterBorders(map, mask)` sets the selected edge tiles to `terrain = 'water'`, `height = 0`
  (and clears the river flag if any). It runs at the start of `finishTerrain`, before `limitSlopes`, so
  the land next to the new water drops to the normal 1-level step — a coast, with no tile-height jumps
  and no invalid tiles. (With cliffs on, the configured cliff cap applies as usual.)
- The existing sea/lake/river passes see the border water as ordinary water: rivers may flow into it,
  lakes no longer form against an edge (they already treat edge tiles as open), and the cover pass skips
  it. Towns and industries are placed after terrain generation, so they never land on the new water.
- Applied identically to generated maps and imported heightmaps (`generateTerrainFromHeights`). The game
  seed is passed as `opts.seed` at both call sites in `game.js` (editor path included); `seed` is only
  read by `'random'` and is never stored on the map.

## Default is unchanged (evidence)
- `waterBorderMask(undefined/none, ...) === 0`, so `finishTerrain` calls neither helper and executes the
  exact historic code path (no extra RNG draws, no extra sweep).
- `mapgenOptions({ waterBorders: 'none' }) === {}`; `state.mapgen` is not created for default games.
- Pinned golden mapgen digests for seeds 1/7/42/1234/abc pass unchanged (`tests/mapgen.test.js`,
  `tests/f4WaterBorders.test.js`), and the gates below are byte-identical:
  - `bun tools/world-hash.js` -> `seed 1 days 60 hash e66b684174510b6b chars 919564`
  - `timeout 110 bun tools/simulate-city.js --years 1 | grep -c MATCH` -> `1`

## Tests
`tests/f4WaterBorders.test.js`:
- default/absent and `'none'` reproduce the pinned golden digests (and consume no draws);
- `'all'` makes every edge tile water at height 0, keeps interior slopes valid (neighbouring heights
  differ by at most 1), keeps more than half the map as land, and a full `Game.create` with borders puts
  no town house or industry tile on water;
- `'random'` is deterministic for the same seed (same mask and same map), yields at least three distinct
  side sets over seeds 1..40 and can produce the full ring; terrain differences from the unbordered map
  stay within 7 tiles of the flooded sides;
- `waterBorderMask` / `applyWaterBorders` unit cases (per-side and comma lists, only the requested edge
  changes).

## Not built / open questions
- `random` never means "no border": it is always a non-empty side subset (the default dialog choice is
  still `none`). If OpenTTD's "random" is expected to sometimes produce no water, that would need a
  different documented distribution.
- No void/dark-border alternative ("water ring vs void" in mapgen-coverage-spec.md U8): the map has no
  void concept, so only a water ring was implemented.
- No Settings-window toggle (mapgen options are New Game only, matching the other mapgen choices).
