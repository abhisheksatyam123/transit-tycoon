# E3: road drive-through after a long block (`roadvehDriveThrough`)

**What.** Opt-in switch that decides what a road vehicle (buses, trucks and — same `kind === 'road'` code path —
trams) does when it has been queued behind a **moving (not loading) vehicle** for the full timeout.

- **OFF (default)** = today's Transit Tycoon behaviour: after `BLOCK_TIMEOUT_TICKS` = `3 * TICKS_PER_DAY`
  (288 ticks) blocked by a vehicle that is not loading, the vehicle turns around and re-plans
  (`movement.js` `hold` -> `turnAround`; road vehicles back up one tile, trains reverse).
- **ON** = OpenTTD's anti-deadlock backup: at 1480 OpenTTD ticks / 20 days the vehicle **drives through** the
  blocker instead of turning around (`roadveh_cmd.cpp:698`, `RoadVehFindCloseTo` returning `nullptr` once
  `front->blocked_ctr > 1480`). In TT it keeps waiting past the 3-day mark, and once the long threshold is reached
  it clears its blocked state and steps onto the blocker's tile on that attempt.

Blocked by a **loading** vehicle is unchanged in both modes: the vehicle waits (no turn-around, no drive-through)
and, at the last tile before the stop, `tryFreeBay` sends it to another free bay of the same order. That path is
the `blocker.state === 'loading'` branch of `hold`, untouched.

**Setting form.** Boolean `roadvehDriveThrough` (`DEFAULT_SETTINGS`, default `false`), one `SETTING_META` entry in
group `vehicles`, type `check`, label "Road vehicles drive through after 20 days". A boolean was chosen over a
days value because OpenTTD has a fixed constant (1480) and there is exactly one ported threshold; a numeric
"turn-around days" would have to model the *old* 3-day value too, which the task explicitly keeps fixed.

**Threshold conversion.** OpenTTD advances 74 ticks per day, so 1480 / 74 = 20 days exactly (the spec's
"1480 blocked ticks ≈ 20 OpenTTD days"). TT uses `TICKS_PER_DAY = 96`, so the equivalent is
`DRIVE_THROUGH_TICKS = 20 * TICKS_PER_DAY = 1920` TT ticks (15.4 TT days shorter is *not* used: converting via
days, the semantic equivalent, is what matters, not converting the raw tick count at a different tick rate).
`DRIVE_THROUGH_TICKS` lives next to `BLOCK_TIMEOUT_TICKS` in `js/simulation/blocking.js`.

**Code.**
- `js/simulation/blocking.js`: exports `DRIVE_THROUGH_TICKS = 20 * TICKS_PER_DAY` with the conversion comment;
  `BLOCK_TIMEOUT_TICKS` unchanged.
- `js/simulation/movement.js`:
  - `shouldDriveThrough(state, v, blocker)` — false for non-road kinds and for a loading blocker; false until
    `blockedTicks + 1 >= DRIVE_THROUGH_TICKS`; then reads the setting. Because the setting is only read at the
    long threshold, the default path is inert.
  - `move` blocker branch: when it returns true, `clearBlock(v)` (the counter restarts, like OpenTTD's
    `blocked_ctr` reset once nothing blocks) and the movement step falls through, so the vehicle passes the
    blocker this attempt; otherwise `hold` runs exactly as before.
  - `hold` timeout branch: with the setting ON and a road vehicle, the 3-day `turnAround` is suppressed (it keeps
    waiting for 1920); default OFF keeps the branch byte-for-byte equivalent.
- `js/simulation/settings.js`: `roadvehDriveThrough: false`.
- `js/ui/settingsGroups.js`: exactly one meta entry.

**Default/behaviour preservation.** OFF never reaches `shouldDriveThrough`'s setting read before the
`BLOCK_TIMEOUT_TICKS` turn-around has already fired, and the added `hold` guard is false. No new state field is
written on the default path. `bun tools/world-hash.js` is unchanged:
`seed 1 days 60 hash e66b684174510b6b chars 919564`.

**Saves.** No new serialized fields: only the setting (settings are already saved) and the transient
`blockedTicks`/`blockedBy` that already existed.

**Not built / adjacent.** The overtaking timeout halving (`roadveh_cmd.cpp:861-864`), the "stop unreachable"
reversal (`:919`) and terminal road stops are separate items. Breakdown-stop (`breakdownStop`) and tram queueing
(`tramQueue`) are untouched; a tram only takes part in road blocking when `tramQueue` is ON (its normal unindexed
layer never blocks), which the tests cover.

**Tests.** `tests/e3RoadTimeout.test.js`:
- default off: 3-day turn-around preserved (2-tile back-up path, block cleared) and no drive-through at the long
  threshold;
- opt-in: 3-day turn-around suppressed, then after `DRIVE_THROUGH_TICKS` the vehicle enters the blocker's tile
  without a turn-around path and the block counter resets;
- loading blocker: no drive-through in either mode, and a single-bay stop still frees the bay and serves both
  buses;
- tram follower drives through when `tramQueue` indexes it;
- defaults/meta/conversion invariants (`1480/74 = 20`, 1920 TT ticks).
Existing blocking/overtake/tram/turn tests still pass (75 tests, 0 fail).
