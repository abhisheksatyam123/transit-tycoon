# AE train opt-ins and crash fixes (wtAE1)

## Item 1: disableElrailsUnpowered (NOT implemented)
- OpenTTD: `train.h:208` GetPower() returns 0 unless HasPowerOnRail; `train_cmd.cpp:460` acceleration = clamp(power/weight*4, 1, 255); `train_cmd.cpp:2361`.
- TT: `js/simulation/routing.js:198` and `js/simulation/vehicles.js:40` allow electric locos on plain rail under `disableElrails`; `js/simulation/loco/trainRealistic.js:162` uses the full `model.power`.
- Existing zero-power handling in TT: **none**. `js/simulation/loco/vehicleMotion.js:56-59` `totalPower()` returns `model.power` when set, otherwise a speed-derived value for road vehicles. Nothing returns 0 for trains. There is no stall model to reuse, so the setting was not added (a no-op setting would mislead). Needs a decision from the lead: which stall model (zero tractive force in `trainRealistic.js` force computation, or a stuck/held state).

## Item 2: trainCrashStationRating (default off)
- OpenTTD: `train_cmd.cpp` ~3360 `ModifyStationRatingAround(tile, owner, -160, 30)` after a crash (Manhattan radius 30, owner's stations; ratings clamped 0..255).
- TT rule: `js/simulation/trainCollision.js` `crashStationRating()` (called from `trainEnters` when a head-on crash happens and the setting is on). Applies -160 to each cargo in `st.rating200` (0..200 scale, clamped at 0; `MAX_CARGO_RATING` 200 in `loco/station.js:26`) and recomputes `st.rating = round(rating200/2)`. Recovery is the normal daily step (`loco/station.js` updateCargo, +-2 per day).
- No existing generic "adjust station rating" helper exists in TT (`planeCrash.js:59` only resets ratings to 1), so the helper is local to trainCollision.js.
- Applied once per crash, using the crashed trains' company (`v.ownerId`; both trains share an owner after item 3).
- Setting: `js/simulation/settings.js` (DEFAULT false), `js/ui/settingsGroups.js` (group vehicles). Requires `vehicleCollisions`.
- Default preserved: setting off -> the call is never reached; no RNG drawn.
- Limits: the amount is in TT's 0..200 scale, so -160 is nearly a full reset (OpenTTD's scale is 0..255). Rating recovers over time.

## Item 3: no crash across owners (bug fix, not an opt-in)
- OpenTTD: `train_cmd.cpp` ~3296-3300: trains of different owners never crash each other.
- TT: `js/simulation/trainCollision.js` `trainEnters()` now skips occupants whose `ownerId` differs (`null`-normalized, so player trains with no ownerId still crash each other).
- Reachable only with `vehicleCollisions` on together with `aiCompanies` (vehicleCollisions defaults off, so the default path is unchanged).

## Tests
- `tests/aeTrain.test.js`: defaults and SETTING_META invariant; station rating default pin / on within 30 / clamp / outside 30 / other company; owner check (different owners no crash, same owner crash, player vs rival).
- Gates forced off in a scratch copy: 4 of 12 tests fail (station on-cases, clamp, owner-check cases) and pass again when the gates are restored.
