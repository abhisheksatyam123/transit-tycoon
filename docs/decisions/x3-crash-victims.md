# X3: train crash victim count (driver term)

Spec: scratchpad/research/train-crash-victims-spec.md. OpenTTD Train::Crash (train_cmd.cpp:3209-3239) adds +2 victims
for the driver (front engine) of each crashed consist. Transit Tycoon had no driver term.

## Change
- `js/simulation/trainCollision.js`: `TRAIN_DRIVER_VICTIMS = 2`. Head-on crash count is now
  `2 + passengers(v) + 2 + passengers(o)` (each consist adds its driver term). Deterministic: no random draw,
  passenger deaths stay the full load (existing TT convention, planeCrash.js / disasters.js).
- News text and the `crash` event payload use the same `victims` value (unchanged wiring).
- Gated by the existing `vehicleCollisions` setting (default off). No new setting, no default changed.
  Money, station rating and save data are untouched.

## Before / after (head-on, both trains on the same tile)
| Case                         | Before | After |
|------------------------------|--------|-------|
| two empty trains             | 0      | 4     |
| loaded train N, empty other  | N      | N + 4 |
| passengers 30 + 12           | 42     | 46    |
| bus at level crossing (20 pax)| 20    | 20 (unchanged) |
| freight truck at crossing    | 0      | 0 (unchanged) |

## Assertions changed
- `tests/trainCollision.test.js` (head-on, 30 + 12 passengers): `victims` 42 -> 46, news text 42 -> 46.
  Reason: the 2 driver term per consist (+4 total) is the only difference.

## Assertions not changed
- `tests/vehicleCollisions.test.js:56-65` (bus at crossing, victims 20) and `:87-93` (truck, victims 0): these are
  road vehicles, not trains. The driver term is train-only, so they are unaffected.

## Road vehicle news
- The level-crossing road-vehicle news (`Road vehicle destroyed in collision with train`) carries no count and
  was left unchanged. Adding a count would change visible text. The spec notes OTTD differs here (wording and count);
  left as a follow-up, not part of this task.

## Tests
- `tests/x3CrashVictims.test.js`: two empty trains -> 4; loaded N -> N + 4; head-on sums both consists
  (7 + 9 + 4 = 20); event payload equals news count; a single news item per crash.
