# D3: invisibility opt-in (Ctrl+Shift+1..8 hides instead of fading)

## What changed
- New game setting `transparencyInvisibleHides` (`js/simulation/settings.js`), default **`false`**.
  One `SETTING_META` entry in the Interface group (`js/ui/settingsGroups.js`): "Ctrl+Shift+1..8 hides
  instead of fades". Read through `getSetting` on each keypress (live-toggleable, no migration).
- `js/input/input.js`: when the setting is ON and Shift is held with digit 1..8, the matching class is
  toggled to HIDDEN (`'hidden'`), not faded. Ctrl+digit is unchanged in both modes. Ctrl+Shift+9 (Text)
  is not an OpenTTD invisibility class and keeps the fade alias. `preventDefault` is kept.
- `js/renderer/transparency.js`: a class value can now be `false` (normal), `true` (faded) or
  `'hidden'`. New exports `TRANSPARENCY_HIDDEN`, `setTransparencyValue`, `classAlpha`. Hidden gives
  alpha 0 (buildings, industries, stations, structures and bridges/signs/catenary via `globalAlpha` 0).
  Trees were already hidden by their toggle.
- `js/renderer/renderer.js`: bridges and signs use `classAlpha` instead of a fixed fade constant.
- Same localStorage record `tt.transparency` (display only, never in the simulation).

## Default and off-behaviour
- Setting OFF (default): Ctrl+Shift+digit is the same alias as Ctrl+digit (fade toggle). The stored
  values are still only `true`/`false`, so the old saves and the renderer output are unchanged.
- `tileTransparency` / `catenaryAlpha` / bridge and sign alpha only differ from before when a value is
  `'hidden'`, which can only be written with the setting ON.

## Simulation and world hash
- Only localStorage and renderer state change. `transparencyInvisibleHides` is read with `getSetting`
  and is never written unless a player sets it, so `state.settings` stays absent for default games.
  `tools/world-hash.js` is unchanged (`e66b684174510b6b`).

## Not built
- No separate invisibility key or option. Hiding reuses the fade toggle's class list and key record.
- Ctrl+Shift+9 (Text) is not hidden by this setting.
- No hide-with-shortcut for Text and no per-vehicle hiding (TT has none).
- Setting placement: it is a game setting in `state.settings` (like the other check boxes), while the
  hidden state itself is per-browser. This is an open question for the lead: should it move to the
  UI preference list (`PREF_META`) instead?

## Tests
- `tests/d3Invisibility.test.js`: default false, OFF alias unchanged, ON hides 1..8 and toggles back,
  Ctrl+digit unchanged in both modes, renderer alpha helpers.
