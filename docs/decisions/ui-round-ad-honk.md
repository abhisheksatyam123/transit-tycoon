# UI round AD: vehicle detail Honk button (branch ac-honk)

UI and sound only. The honk writes no simulation state, draws no simulation RNG and changes no
vehicle field: `bun tools/world-hash.js` stays `e66b684174510b6b`.

## OpenTTD source

- `openttd/src/vehicle_gui.cpp` ~3472-3473: the vehicle details window has a `Honk` button whose
  click handler plays the vehicles's horn (`Vehicle::PlayVehicleSound`/horn) for every vehicle type.

## What TT does

- `js/ui/windows/vehicleDetail.js:96`: `honkBtn` — a plain `button.btn` placed in the window's main
  action button row, right after Start/Stop and before Orders (same `el('button.btn', ...)` pattern
  as the neighbouring buttons). It carries `aria-label="Play the vehicle horn"` and a
  `title="Play the vehicle horn (sound only; no effect on the game)"`.
- `onclick: () => play('horn')` — imported from `js/audio/sfx.js:135`. No `app.exec(...)` command,
  no game method call, so no vehicle/simulation field is written and the simulation RNG is untouched.
- Available for player vehicles (the rival-company branch returns before the action row, as it
  already does for every other action button).

## Sound used

- The existing synthesised `horn` effect (`js/audio/sfx.js:123`, two sawtooth tones at 330/415 Hz for
  0.35 s) — already used by Start and Clone since both start/stop departure uses `horn`. No new audio
  asset or sound entry was needed.
- `play()` is rate-limited per sound (70 ms) and honours the global mute setting, so a double click
  cannot stack.

## Layout / narrow screens

- No CSS change: the existing `.btn-row` (`css/windows.css:32`) is `display:flex; flex-wrap:wrap;
  gap:6px`, and `.btn { white-space: nowrap }`, so the extra button wraps to the next line on narrow
  screens like the other buttons and keeps its label intact.

## Left out

- No keyboard shortcut: OpenTTD binds the honk to no default key in the details window, and `h` is
  already Help (`js/ui/hotkeys.js`, `win:help`). No entry was added to `HOTKEY_ACTIONS`,
  `READ_ONLY_HOTKEYS` or `FIXED_SHORTCUTS`; a test pins the table counts.
- No per-vehicle-type horn variation (OpenTTD uses the vehicle's sound set): TT has one synthesised
  horn effect, reused as-is.
- No honk for rival-owned vehicles because their window is read-only.
