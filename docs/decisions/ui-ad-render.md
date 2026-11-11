# Structures and catenary transparency (branch ad-render)

Render-only classes: nothing here writes simulation state, and the world hash is unchanged
(`bun tools/world-hash.js` -> e66b684174510b6b). Both classes default to off, so every pre-existing class keeps
its previous value and the default frame is byte-for-byte the same draw path.

## OpenTTD source

`src/transparency.h:22-33` (`enum class TransparencyOption`):
- `Structures = 6` — "other objects such as transmitters and lighthouses" (`transparency.h:29`).
- `Catenary = 7` — "catenary" (`transparency.h:30`).
- Also listed there: `Signs`, `Trees`, `Houses`, `Industries`, `Buildings`, `Bridges`, and `Text = 8`
  (loading and cost/income text). The panel is `src/transparency_gui.cpp`, toggles in `src/main_gui.cpp`.

## TT implementation

- Class list / persistence / hotkey order: `js/renderer/transparency.js:12-23`
  (`TRANSPARENCY_OPTIONS`, appended after `signs`; same `tt.transparency` localStorage map as the others,
  so no new key and no save change).
- Structures alpha: `js/renderer/transparency.js:75-76` (`tileTransparency` returns `TRANSPARENT_ALPHA` for a
  tile with `tile.object` when `tr.structures`). The renderer already wraps `drawObject` (which calls
  `js/renderer/layers/objects.js:78` -> `js/renderer/pack/objects2.js:17 drawObjectTile`) in the
  `ctx.globalAlpha` guard at `js/renderer/renderer.js:444-452`, so map objects fade without a new draw path.
- Catenary alpha: `js/renderer/transparency.js:81-87` (`catenaryAlpha(tr)`), passed by
  `js/renderer/renderer.js:377` and used at `js/renderer/renderer.js:470-471` for both `drawCatenary`
  (electrified rail) and `drawTramWires` (tram overhead). The layers apply it with the same
  `ctx.save(); ctx.globalAlpha = alpha; ... ctx.restore()` mechanism as the other classes:
  `js/renderer/layers/catenary.js:21-25` and `:64-69`.
- UI rows: `js/ui/settingsGroups.js:270-271` (`PREF_META`, Interface group, "Transparent structures" and
  "Transparent catenary", same checkbox machinery as the six existing rows via
  `js/ui/windows/settings.js:116-131`).
- Keys: `js/input/input.js:175` extends the existing transparency hotkey range from `Ctrl+1..6` to
  `Ctrl+1..8` (Ctrl+7 = structures, Ctrl+8 = catenary; `Ctrl+Shift+N` also works). No key was added to
  `js/input/fixedShortcuts.js` or `js/ui/hotkeys.js`; the digit keys were free (no collision with the
  `RESERVED_KEYS` or fixed shortcut tables).
- Default: both options parse to `false`; with all classes off `loadTransparency()` still returns `null` and
  the renderer takes its unchanged path.

## Left out

- `TransparencyOption::Text` (loading/cost text) and the separate invisibility mode (`_invisibility_opt`,
  "invisible" instead of translucent) are not ported: TT has no world-space loading text pass to fade, and
  the existing toggles use a fixed alpha rather than a second invisibility mode.
- Signs (OTTD `Signs`) still map to TT's signal posts; an extra class was not added for that in this round.
