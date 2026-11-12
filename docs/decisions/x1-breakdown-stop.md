# X1: breakdownStop — broken-down surface vehicles stop (OpenTTD) instead of crawling (OpenLoco/TT)

Source: `scratchpad/research/road-design-spec.md` §2; OpenTTD `vehicle.cpp:1397-1398`,
`roadveh_cmd.cpp:1587-1592`, `vehicle.cpp:1423-1434`; OpenLoco `Vehicle1.cpp:190-197`,
`VehicleHead.cpp:2858-2866` (today's crawl).

## What

New setting `breakdownStop: false` (group `vehicles`, type `check`, label "Broken-down vehicles stop
(OpenTTD)"). When on, a broken-down road vehicle, train or ship stands still (`speed = 0`) for the
whole breakdown (`breakdownTicks`, 5 days) instead of crawling:

- `js/simulation/movement.js` `vehicleTick` `case 'broken'`: after the timer decrement, if the vehicle
  is not an aircraft and `getSetting(ctx.state, 'breakdownStop')` is on, set `v.speed = 0` and
  `return` before `move()` / `moveShip()`. Because no movement code runs, the breakdown cannot end
  early by reaching a stop / replanning (OpenTTD clears a breakdown only when `breakdown_delay`
  expires, `vehicle.cpp:1424-1428`); that early end remains as today when the setting is off
  (`movement.js:71`).
- Aircraft are excluded (they already stop in TT and keep that behaviour). UFO-frozen vehicles
  (`v.breakdownFrozen`, `disasters.js:253`) already had `crawling()` false and stay stopped; the new
  branch returns the same result for them, so nothing changes.
- No new vehicle/state fields, no save change: only `state.settings.breakdownStop` (lazy, read via
  `getSetting`, absent = default off).

## Default and interaction with today's behaviour

Default off is the current crawl: `maxSpeed / 4` for road/rail (`movement.js:349`) and 5 mph for ships
(`movement.js:260`), including the early end at a stop/replan. The existing `tests/breakdownCrawl.test.js`
assertions are mirrored in `tests/x1BreakdownStop.test.js` and unchanged.

Followers: a stopped broken vehicle occupies its tile exactly as it did while crawling slowly; the
blocking layer still makes the vehicle behind it queue (`blockedTicks`), as today. When on, a
breakdown on a single-track line or a busy road can stall traffic for up to 5 days — that is
OpenTTD's behaviour and why the option is off by default.

## Performance

When off, the extra work is one `getSetting` lookup per broken road/rail/ship tick (broken vehicles
are rare); when on, the tick does strictly less work than today (it skips `move()`/`moveShip()`).
No allocation is added anywhere (no new objects/arrays/closures in the tick path).

## Evidence

- `bun run check`: `OK: 815 files`.
- `bun tools/world-hash.js`: `seed 1 days 60 hash e66b684174510b6b chars 919564` (unchanged).
- `timeout 110 bun tools/simulate-city.js --years 1 | grep -c MATCH`: `1`.
- `bun test tests/x1BreakdownStop.test.js`: 10 pass / 0 fail.
- `bun test tests/adBreakdown.test.js tests/breakdownCrawl.test.js tests/settingsGroups.test.js`:
  26 pass / 0 fail.

## Not done

- Scope was kept at all surface types (road, rail, ship), the closest match to OpenTTD; a road-only
  variant was considered in the spec (§2.8) but not built — no second setting.
- No UI besides the settings row; no per-vehicle override. No save migration needed (key defaults).
- Not merged/pushed (branch `x1-breakdown` only).
