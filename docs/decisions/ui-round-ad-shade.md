# Window shade and sticky (pin) toggles (Round AD)

Status: DONE (UI only; no game-state change, no save). Default behaviour is unchanged: every window opens
unshaded and unstickied.

## OpenTTD source
- Title-bar widgets: `WWT_SHADEBOX` and `WWT_STICKYBOX`, declared in `scratchpad/openttd/src/widget_type.h:52`
  (the caption sits between the close box and the sticky box) and laid out in the same row as the caption,
  e.g. `src/town_gui.cpp:67` / `:69` (town authority) and `:620` / `:622` (town view), close box first
  (`:64`, `:616`), sticky box last.
- Click handling: `src/window.cpp:737-743` — `WWT_SHADEBOX` calls `SetShaded(!IsShaded())`;
  `WWT_STICKYBOX` flips `WindowFlag::Sticky` (and with Ctrl held stores it as the window's preference,
  `window.cpp:745`).
- Shading itself: `Window::SetShaded` (`src/window.cpp:1030-1050`) rolls the window up to its title bar
  by switching the nested root to `SZSP_HORIZONTAL` and remembers the unshaded size to restore it.
- Sticky means "survives the mass-close paths": `CloseNonVitalWindows` skips pinned windows
  (`src/window.cpp:3382`, comment "do not delete windows which are 'pinned'"), and the window soft limit
  ignores them (`src/window.cpp:3077`). Explicit close (close box, `CloseWindowById(..., force=true)`)
  still closes a sticky window.

## What Transit Tycoon does
- `js/ui/windowManager.js`: every window built by `WindowManager.open()` gets two extra title-bar buttons,
  shade (`▾`/`▴`) and pin (`⚑`), in OpenTTD's order before the close button (close stays last so the order
  is stable on narrow phone layouts; see `css/windows.css` `.win-ctrls` / `.win-btn` and the 640px media query).
- Shade: `setShaded(true)` sets `.shaded` on the window root and `hidden` on `.win-body`
  (`css/windows.css`: `.win.shaded > .win-body { display: none }`). The window keeps its title bar,
  left/top position and inline width; toggling again restores the body. The update tick still runs.
- Sticky: `closeAll()` and `closeTop()` (Esc) skip `win.sticky` windows. The window's own close button
  still closes it. When no window is sticky both behave exactly as before.
- State lives on the `FloatingWindow` object (`win.shaded`, `win.sticky`), never in the game state, so the
  world hash is unchanged. Buttons have `title` and `aria-label`, and `aria-pressed` reflects the state.
  No keyboard shortcut is added.

## Left out
- Window state (shade/sticky) is **not saved**: there is no `windows.ini` analogue, and windows do not
  survive a reload, so there is nothing to persist. OpenTTD's Ctrl-click "make sticky the default for this
  window type" (`window.cpp:745`) is also not ported.
- No defsizebox (`WWT_DEFSIZEBOX`) and no roll-up animation.
