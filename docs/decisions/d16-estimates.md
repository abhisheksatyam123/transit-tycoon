# D16 — Timetable estimates (opt-in)

Setting: `timetableEstimates` (`DEFAULT_SETTINGS`, default **false**), one `SETTING_META` row in the
`vehicles` group. Spec: `scratchpad/research/timetable-travel-time-spec.md` (Q3 recommended opt-in;
gap items G3 estimates, G4 autofill preserve-wait). Builds on `timetableLateness` (A3), whose behaviour
is unchanged and independent: estimates are display-only and never feed holds or the lateness counter.

## What is built (G3, G4)

- **G3 — estimated vs timetabled times.** Lazy per-order `estWaitDays` / `estTravelDays` (whole days,
  absent when zero). When the setting is on, every completed leg on which the matching field is *not*
  explicitly timetabled records the measured value:
  - at arrival, `estTravelDays = round((arriveTick - departTick) / TICKS_PER_DAY)`;
  - at departure, `estWaitDays = round((departTick - arriveTick) / TICKS_PER_DAY)`.
  Estimates are never read by `loadingTick`, `departureHoldUntil`, `roundTicks`, autofill or
  `bookLateness`. Setting a real `waitDays` / `travelDays` (orders window, "Change time", or autofill)
  takes precedence and stops the estimate for that field; clearing the time lets estimates resume.
  The orders window shows an estimate as the muted `~N` placeholder and in the input tooltip while the
  field is blank, and includes it in the row key so the placeholder refreshes. `hasTimetable` keeps its
  old meaning (a set wait/travel time), so an estimate never turns on the "on time" hint by itself.
- **G4 — Ctrl-autofill "preserve wait".** The Autofill button (Ctrl+click) starts autofill with a lazy
  `vehicle.autofillPreserve` flag. While that flag is set, a measured station wait only replaces the
  existing `waitDays` when it is *longer* (OpenTTD `timetable_cmd.cpp:439-440`); travel time is still
  overwritten in both modes. Plain autofill keeps its old overwrite behaviour. Turning autofill off
  clears the flag, and the flag is never set while the setting is off.

Sub-choice made (spec left it open): estimates are stored in whole days, because G6 (sub-day units) is
not built; a measured value that rounds to zero is not stored (`estWaitDays`/`estTravelDays` deleted),
matching the lazy "absent when zero" convention. The wait estimate is only measured for untimetabled
waits, as the spec's "not explicitly timetabled" rule says; OpenTTD's always-updating estimate for
timetabled orders is therefore not shown.

## What is NOT built

- **G6 — sub-day timetable units** (ticks display, 1-second autofill rounding). Estimates and timetables
  remain whole days; a sub-day leg has no stored estimate.
- **G7 — wait times on conditional orders.**
- **G8 — aircraft speed-limit refusal.**
- No separate "estimated time" column: estimates are the blank-field placeholder, not a second value
  shown next to a set time (kept minimal to avoid the orders-window layout rework).

## Default / compatibility

With the setting off, every path is the old one: no `estWaitDays` / `estTravelDays` /
`autofillPreserve` key is ever written, no extra `arriveTick` / `departTick` bookkeeping is kept, and
the world hash is unchanged. All new fields are lazy, and saves are a generic JSON dump, so saves made
with the setting on still load with it off (estimates are simply ignored). No existing setting default
changed.

## Cost

Off: one `getSetting` lookup in the existing arrival/departure branches, no allocations. On: one
`setOrderField` per completed untimetabled leg, which is an O(orders) copy of that vehicle's order list
already used by autofill; no per-tick work.
