# A3 — Timetable lateness (opt-in)

Setting: `timetableLateness` (`DEFAULT_SETTINGS`, default **false**), one `SETTING_META` row in the
`vehicles` group. Spec: `scratchpad/research/timetable-travel-time-spec.md` (Q3 recommended opt-in).

## What is built (G1, G2, G5)

OpenTTD's lateness-counter scheduling, behind the setting. When **off**, every code path is the old one
(the hold test is algebraically identical, no new fields are ever written, no per-tick work).

- **G1 — station wait.** With the setting on, a stop holds for
  `max(waitDays * TICKS_PER_DAY - lateness, 0)` measured from the arrival tick
  (`js/simulation/ttSchedule.js` `latenessWaitTicks`, used in `orders.js` `loadingTick`).
  An early vehicle therefore waits longer than `waitDays`; a late vehicle waits less and never below zero.
- **G2 — cumulative lateness.** A lazy per-vehicle `lateTicks` (signed ticks; absent = on time) accumulates
  the measured-minus-timetabled **travel** duration on arrival and **station-wait** duration on departure,
  reduced modulo one full round (`roundTicks(orders)`) when it exceeds a round. The legacy rounded
  `lateDays` is still maintained for the existing lateness UI (`vehicleList`, `vehicleDetail`, orders
  window), and a vehicle that is exactly on time clears both. Untimetabled legs follow the OpenTTD guard
  (`timetable_cmd.cpp:554`): an untimetabled wait only counts while the vehicle is already late.
- **G5 — start-date seeding.** `ttStart` (already stored as an absolute tick) is consumed on the first
  arrival at order 0: `lateTicks = tick - ttStart`, `ttStart` deleted and the lazy `ttStarted` flag set.
  That first round does not measure. Setting a new start date clears `ttStarted` so it seeds again.

Other wiring: `resetLateness` also deletes `lateTicks`/`ttStarted` (idempotent); enabling the setting on an
old save seeds `lateTicks` once from a legacy `lateDays`. Both new vehicle fields are lazy, so saves of a
default (setting-off) game gain no keys; serialisation is the generic `state` JSON dump.

## What is NOT built

- **G3/G4 — estimates vs timetabled travel/wait, Ctrl-autofill "preserve wait"** (separate optional
  setting). Not attempted.
- **G6 — sub-day timetable units** (ticks display, 1-second autofill rounding). Still whole days.
- **G7 — wait times on conditional orders.** Not attempted.
- **G8 — aircraft speed-limit parity.** Per-order speed limits are still accepted on aircraft; no parity
  refusal was added.

Travel time is never enforced en route (no `movement.js` change): it remains an expectation used only for
lateness and holds, exactly like OpenTTD.

## Cost

No per-tick work and no allocation when off (one `getSetting` lookup in the existing arrival/departure/
loading-retry branches). When on: one integer add per completed leg and a modulo only when lateness exceeds
the current leg (an O(orders) `roundTicks` scan, orders <= 16).
