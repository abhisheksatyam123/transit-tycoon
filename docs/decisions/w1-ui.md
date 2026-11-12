# W1 — transparency text class, hotkey modifier combinations

Branch `w1-ui` (based on main `0ef8f63`). Display/UI only: no simulation state, no save format, no default
gameplay change, no new `DEFAULT_SETTINGS` key. World hash unchanged (`e66b684174510b6b`).

## 1. Loading-indicator transparency class — no loading visual, so the class is `Text` instead

OpenTTD has **no `TO_LOADING`**. The nearest class is `TransparencyOption::Text`
(`scratchpad/openttd/src/transparency.h:31`, documented there as "loading and cost/income text"),
applied in `src/texteff.cpp:120` — it suppresses the transient map text effects.

TT (this repo) draws **no loading indicator on the map**: the only loading visuals are
(a) the word "Loading" in the vehicle-list window (`js/ui/windows/vehicleList.js:20`, a window row, not a
map sprite) and (b) the load-overlay while a scenario builds (`js/ui/loading.js`). The renderer's only
"loading" reference is a departure-sound state check (`js/renderer/vehicleFx.js:74`) — nothing is drawn
that a transparency class could hide. So a `loading` class was **skipped**: it would have no effect.

What TT does draw in map text is the floating income/cost popups (`FloatingTexts`,
`js/renderer/layers/overlays.js:160`, fed from `js/ui/app.js:103,303`), which is exactly the
"cost/income text" half of OpenTTD's `Text` class. Added that as the 9th class, matching OpenTTD's ordering:

- `js/renderer/transparency.js:26` — `{ id: 'text', label: 'Text' }` appended after `catenary`.
  Default is off: `parse()` only enables stored `true` values, so `loadTransparency()` still returns
  `null` with no prefs stored (unchanged frame).
- Hotkey: `js/input/input.js:176` now matches `Digit[1-9]` (was 1-8), so **Ctrl+9 / Ctrl+Shift+9**.
- Settings window: `js/ui/settingsGroups.js:297` — `tr:text` row in the `interface` group, beside the
  other transparency rows (`PREF_META`, browser-local, same as the rest).
- Draw: `js/renderer/layers/overlays.js:182,198` — `draw(ctx, dt, cam, hidden)` ages the popups but
  draws no glyphs when hidden; `js/renderer/renderer.js:506` passes `!!(tr && tr.text)`.
  `tileTransparency()` and `catenaryAlpha()` are untouched (text is not a tile object).

## 2. Hotkey editor now accepts Ctrl/Alt/Meta combinations

Audit finding confirmed at the old `js/ui/windows/hotkeys.js:45`:
`if (e.ctrlKey || e.metaKey || e.altKey) { status.textContent = 'Use a key without Ctrl, Alt or Meta.'; return; }`
while the game's own fixed toggles use exactly that family (`js/input/input.js:172` Ctrl+Alt+C cheats,
`:176` Ctrl+digit transparency). The rejection was therefore not a real safety rule — it also had no other
justification in the code (no browser-key list, no doc), so it was relaxed rather than kept.

Implementation (all display/UI, defaults unchanged):

- `js/ui/hotkeys.js:174` — `keyFromEvent(e)`: returns the old single key when no Ctrl/Alt/Meta is held
  (Shift alone included, so every existing default still fires with Shift held); otherwise a canonical
  combination `ctrl+[alt+][shift+]<base>`. Base comes from the physical key (`e.code`) under modifiers so
  `Ctrl+1` and `Ctrl+Shift+1` stay distinct; `metaKey` maps to `ctrl` (Cmd on macOS).
- `js/ui/windows/hotkeys.js:43` — the capture handler calls `keyFromEvent` and no longer refuses modifiers;
  the hint says combinations are allowed.
- `js/input/input.js:188` — the modifier branch looks up `shortcuts['ctrl+...']` before returning, so a
  rebound combination actually fires (the fixed Ctrl toggles above it still win).
- `js/ui/hotkeys.js:138` — `keyLabel` renders combinations (`Ctrl+Shift+1`), so cells, tooltips and
  snapshot labels are readable.
- `js/ui/hotkeys.js:26,269` — `bindProblem` refuses only combinations that could never fire:
  `RESERVED_COMBOS` = Ctrl+1..9 / Ctrl+Shift+1..9 (transparency, computed from `TRANSPARENCY_OPTIONS`),
  Ctrl+Alt+C (cheats); `BROWSER_RESERVED_COMBOS` (`:35`) = Ctrl+W/T/N/R/L, Ctrl+Shift+W/T/N, Ctrl+Tab,
  Ctrl+Shift+Tab, Ctrl+PageUp/PageDown, Alt+F4 — keystrokes a web page cannot intercept.
- Defaults: `HOTKEY_ACTIONS` untouched (all single keys); `bindProblem` of every default is still null;
  passing a combination to `bindKey`/`saveOverrides` round-trips through `tt.hotkeys` as a string.

## 3. OpenTTD invisibility toggles — reported, not implemented

OpenTTD maps **Ctrl+Shift+1..8** to `invisibility_*` (`scratchpad/openttd/src/main_gui.cpp:504-511`,
`GHK_TOGGLE_INVISIBILITY`, `ToggleInvisibilityWithTransparency` in `transparency.h`): a second state on
top of transparency that hides the object entirely (e.g. `industry_cmd.cpp:377`, `rail_cmd.cpp:2501`).

TT maps only **Ctrl+digit** (now Ctrl+1..9) and treats **Ctrl+Shift+digit as the same transparency toggle**
(`js/input/input.js:176` does not test `shiftKey`); the settings help text documents that alias
(`js/ui/settingsGroups.js` rows `tr:*`, e.g. line 296 "Ctrl+8 or Ctrl+Shift+8"). TT has no separate
invisibility state except `trees`, which are hidden rather than faded (`transparency.js` `tileTransparency`).

So: **no invisibility toggle is mapped**. Implementing the OpenTTD meaning would change the documented
behaviour of Ctrl+Shift+digit (an existing key, not a setting), needs a per-class second state and a
renderer alpha of 0 — a user-facing behaviour decision, not a default-preserving port. Reported instead of
implemented.

## Tests / evidence

- `tests/w1Ui.test.js` (20 tests): combination parsing/labelling, reserved/browser combos, bind + persist +
  dispatch of a combination, unchanged defaults, `text` class list/default/persistence/no tile fade,
  `FloatingTexts` hidden-but-aged, settings row exists.
- Existing snapshots updated for the 9th class: `tests/adRender.test.js` (option list + persist map),
  `tests/stSettings.test.js:114`.
- Targeted: `bun test tests/w1Ui.test.js tests/hotkeys.test.js tests/roundACHotkeys.test.js
  tests/roundADShade.test.js tests/adRender.test.js tests/stSettings.test.js tests/settingsGroups.test.js
  tests/roundAHonk.test.js` -> 96 pass, 0 fail.
- Browser (headless Chromium, `scratchpad/e2e/w1/hotkeys.mjs`, screenshot
  `scratchpad/e2e/w1_hotkeys_combo.png`): in the editor the Rail cell became `Ctrl+Alt+K`
  (status "Rail is now Ctrl+Alt+K.", `tt.hotkeys` = `{"tool:rail":"ctrl+alt+k"}`); after closing the
  window Ctrl+Alt+K selected the Rail tool; Ctrl+9 stored `text:true` and toasted "Text transparency: on";
  pressing Ctrl+1 in the editor was refused with "Ctrl+1 is used by the game (transparency / cheats)."
  and nothing was stored. No page errors.

## Gates (worktree)

- `bun run check` -> `OK: 810 files`
- `bun tools/world-hash.js` -> `seed 1 days 60 hash e66b684174510b6b chars 919564`
- `timeout 110 bun tools/simulate-city.js --years 1 | grep -c MATCH` -> `1`
