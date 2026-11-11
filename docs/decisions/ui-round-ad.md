# UI round AD (branch ac-ui2): company infrastructure window + screenshot zoom entries

Read-only UI only. No simulation state is written and the world hash is unchanged
(`bun tools/world-hash.js` -> e66b684174510b6b).

## G7 Company infrastructure (OpenTTD `company_gui.cpp` ~1569-1590, ~1846)

- Separate read-only window `companyInfrastructure` rather than a tab in the Companies window: the
  existing Companies window is a flat table + appended sections (no tab machinery), and every other
  auxiliary company view (Hall of fame, Subsidies, Graphs) is a window opened from a button.
- `js/ui/windows/companyInfrastructure.js:19` `infrastructureSummary(state)` (pure): counts from
  `js/simulation/infrastructure.js countInfrastructure()` plus
  `infrastructureMaintenance()` and `infraMaintenance` (settings.js:153, default false).
- `js/ui/windows/companyInfrastructure.js:34` `infrastructureRows(state)`: Rail pieces, Road pieces,
  Signals, Stations, Airports (air), Sea pieces (always 0: TT has no canal/sea infrastructure and the
  simulation does not maintain docks/ship depots; note shown) and Monthly infrastructure cost.
  With the setting off the cost is 0 and the row carries the note "infrastructure maintenance off".
- `js/ui/windows/companyInfrastructure.js:50` window build/update; registered in
  `js/ui/windows/index.js:92`.
- Button "Infrastructure…" in the Companies window: `js/ui/windows/companies.js:165`.
- No hotkey: opened only by the button. No key was added to `fixedShortcuts.js` or `hotkeys.js`.

## G9 Screenshot variants (OpenTTD `toolbar_gui.cpp` ~2553-2555, `screenshot_gui.cpp`)

- Menu entries only (no key bindings): "Screenshot at default zoom" and "Screenshot zoomed in",
  in `js/ui/toolbar.js:120-121`, added to the Screenshot flyout group (`js/ui/toolbar.js:114`).
- `js/ui/screenshot.js:73` `screenshotCanvasAtZoom(renderer, zoom, kind)`: copies the main camera
  centre into a short-lived secondary `Renderer` (`{secondary:true, fixedView:true}`, shared heights,
  as in `giantScreenshot` and the extra viewport), draws one frame at the wanted zoom into an
  offscreen canvas of the current viewport size, and downloads it. The main renderer and its camera
  are not touched.
- Zoom levels (`js/ui/screenshot.js:50`): default = 1x (OpenTTD `SC_DEFAULTZOOM`), zoomed in =
  `MAX_ZOOM` = 4x (OpenTTD `SC_ZOOMEDIN` uses `zoom_min`, the most zoomed-in level).
- File names `transit-tycoon-default-YYYY-MM-DD.png` / `transit-tycoon-zoomedIn-YYYY-MM-DD.png`
  (`js/ui/screenshot.js:59`), so the existing `.` map-view screenshot name stays unchanged.
- Nothing skipped: both entries render at a different zoom without modifying the renderer. The
  existing `screenshotCanvas()` (current canvas as-is) and the whole-map giant screenshot are
  unchanged.

## Tests

`tests/roundACUi2.test.js`:
- piece rows match `countInfrastructure(flatGame+coalLine)` and the cost row shows 0 +
  "infrastructure maintenance off" by default, and `infrastructureMaintenance()` when enabled;
- both screenshot menu entries exist in `SHOT_ITEMS` and the Screenshot flyout, with distinct zooms
  and file names;
- the hotkey table still has exactly one screenshot action (`.`), no new binding.
