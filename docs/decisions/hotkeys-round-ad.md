# Round AD — GUI hotkeys and window shortcuts

Date: 2026-11-11 · Status: implemented · Scope: UI only (no simulation, no save, no world-hash change)

Fixed keys are handled in `js/input/fixedShortcuts.js` (table + dispatcher) from the keydown handler in
`js/input/input.js` (after the active tool's own keys, before the rebindable shortcut table), guarded by
the existing text-field check so typing in an input/textarea/select never triggers them. They are listed
as read-only entries in the hotkey editor via `js/ui/hotkeys.js` (`READ_ONLY_HOTKEYS`). No new rebindable
action was added, so no key can collide with `HOTKEY_ACTIONS` or `RESERVED_KEYS`.

| New key | OpenTTD source | TT action |
| --- | --- | --- |
| Delete | `src/main_gui.cpp:487` (`delete_windows`), `src/window.cpp:3409` | `app.wm.closeAll()` — closes every floating window; ignored while typing |
| C | `src/main_gui.cpp:483` (`center`) | `app.centerOn(hover.x, hover.y)` — centres on the tile under the mouse cursor; ignored while typing and when the active tool owns C (Terraform, Rail/Road/Tram line drag) |
| F1 | `src/toolbar_gui.cpp:2145` | `app.togglePause()` — pause / resume |
| F2 | `src/toolbar_gui.cpp:2147` | opens the Settings window (`settings`) |
| F3 | `src/toolbar_gui.cpp:2148` | opens the Save window (`save`); TT splits OpenTTD's combined saveload dialog, and in-game F3 saves |
| F4 | `src/toolbar_gui.cpp:2150` | opens the Map window (`map`, OpenTTD smallmap) |
| F7 | `src/toolbar_gui.cpp:2153` | opens the Station list (`stations`) |
| F8 | `src/toolbar_gui.cpp:2154` | opens Finances (`finances`) |
| F9 | `src/toolbar_gui.cpp:2155` | opens the Company list (`companies`) |
| F10 | `src/toolbar_gui.cpp:2158` | opens Graphs (`graphs`) |

Each TT window above already existed in `js/ui/windows/index.js`; no new window was created.

## Skipped keys

- **F5** (`town_list`): the Towns window exists, but browsers reserve F5 (reload). Left on its existing `T` key.
- **F6** (`subsidies`): the Subsidies window exists, but F6 moves focus to the address bar in browsers.
- **F11** (`league`): browsers use F11 for fullscreen; TT also has no League window.
- **F12** (`industry_list`): browsers use F12 for developer tools.
- **Shift+F1…F12** (vehicle lists / build tools / zoom): out of scope for this round; their windows and
  actions already have letter shortcuts, and Shift+F5/F6 are OpenTTD zoom keys that would collide with
  browser-reserved F5/F6 with Shift.
- **Ctrl+… and Alt+…** OpenTTD global keys: browser/OS shortcuts or already handled in `input.js`.

## Verification

`tests/roundACHotkeys.test.js` (18 tests) checks the key table is unique, does not overlap rebindable or
reserved keys, and does not use browser-reserved keys; that each key invokes its action; that text-field
focus suppresses every fixed key; that Delete calls `closeAll`; that C moves the view centre to the hover
tile (and is left to Terraform/line-drag tools); that F1 pauses and F2/F3/F4/F7/F8/F9/F10 open the matching
window. Removing the F9 row from the table makes two tests fail (verified in a scratch copy).
