# New Game map options: persistence and the town-layout setting (wtAE2)

Date: 2026-11-12. Scope: UI and preferences only. Generation output is unchanged for the same
seed and options; the default New Game dialog and Settings are unchanged when no preference is stored.

## Persisted: New Game map-generator selects

The T34 mapgen selects in the New Game dialog (js/ui/windows/newGame.js) now start from the previous
choices and write them back on **Start new game**. Storage is browser-only (never in the save), through
js/ui/newGamePrefs.js:

- Key: `tt.newGameMapgen` — JSON object of option -> value (same `tt.` prefix as `tt.newGameSettings`).
- Options: `terrain`, `seaLevel`, `rivers`, `cliffs`, `lakes`, `mountainStyle`, `smoothness`, `variety`,
  `townDensity`, `townLayout`, `industryDensity`, `climate`, `snowLine`.
- Only non-default values are stored (defaults are the same values `MAPGEN_DEFAULTS` strips in
  js/simulation/game.js). Selecting a default again removes the stored entry.
- `loadNewGameMapgen()` merges the stored object over `MAPGEN_DEFAULTS`, so a missing key, invalid JSON,
  a non-object, an unknown key or an out-of-range value falls back to the current default. The
  `newGameMapgenSelection()` helper is what the dialog uses to build its initial values.

The existing New Game *settings* (large houses, farm fields, AI competitors, town layout, ...) keep
using `tt.newGameSettings` via `loadNewGameSettings` / `saveNewGameSetting`. `parseNewGameSettings` now
accepts string-valued settings whose value is one of the `SETTING_META` select options (needed for
`townLayout`; this also fixes the same latent gap for `roadSide`). Type mismatches are still dropped.
No preference stored means `carryOverNewGameSettings` returns the options unchanged, exactly as before.

## town layout: `economy.town_layout`

- New setting `townLayout` in `DEFAULT_SETTINGS` (js/simulation/settings.js), default `'mixed'` —
  the value the generator already uses when `state.mapgen.townLayout` is absent (js/simulation/towns.js).
- New `SETTING_META` row in the `economy` group next to `largerTowns` / `townMinDistance`
  (js/ui/settingsGroups.js), marked `newGame: true`. Changing it remembers the value in
  `tt.newGameSettings` and the New Game dialog starts from it (a remembered Settings value wins over the
  last dialog choice). With no remembered value the dialog default is still `mixed`.
- When a new random game is generated with an explicit `mapgen.townLayout`, js/simulation/game.js mirrors
  it into `state.settings.townLayout` so the Settings window shows what this map uses. The generator
  still reads only `state.mapgen.townLayout`; changing the setting on an existing game therefore does
  **not** change its towns (the help text says it applies to new maps only).

## Left out

- Seed, map size, town count, start year, scenario choice, objective/loan/inflation fields, company
  colour, heightmap and the "Continue" state are not persisted; they stay per-session (seed is random by
  design, heightmaps are file handles).
- The `?climate=` / `?townLayout=` URL debug options in js/main.js are unaffected.
- The world hash pin for a default random world stays `e66b684174510b6b` (seed 1, 60 days).
