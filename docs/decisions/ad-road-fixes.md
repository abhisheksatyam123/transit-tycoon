# ad-road round: articulated road vehicles, overtaking, bay stops and `roadvehQueue`

Status: implemented on branch `ad-road` (based on `main` 40d7168). Default behaviour is unchanged
(world hash `e66b684174510b6b`); `roadvehQueue` is the only new setting and defaults to `true`
(= the previous behaviour: road vehicles always queue for a bay).

OpenTTD source references are to `scratchpad/openttd/src`.

## 1. BUG: articulated road vehicles could overtake (inside the `roadOvertaking` gate)

- OpenTTD `roadveh_cmd.cpp:828-829` (`RoadVehCheckOvertake`): `/* For now, articulated road vehicles can't
  overtake anything. */ if (v->HasArticulatedPart()) return;`
- TT before: `js/simulation/roadOvertake.js:60 tryOvertake` had no articulated check, so with
  `roadOvertaking` on (off by default) an articulated bus could pass a slower vehicle.
- TT after: `js/simulation/roadOvertake.js:62-63` refuses when `articSpan(v) > 0`, and the module comment
  (`:7-8`) lists the rule. `tryOvertake` is only reached through `movement.js` `nextBlocker` under
  `overtakeEnabled(state)`, so the check is inside the existing `roadOvertaking` gate.
- Default: `roadOvertaking` stays `false`, so the default path is bit-identical.

## 2. BUG: articulated vehicles entered a bay road stop (while `articulatedRV` is off)

- OpenTTD `roadstop.cpp:225` (`RoadStop::Enter`): `if (this->IsEntranceBusy() || !this->HasFreeBay() ||
  rv->HasArticulatedPart()) return false;` and `roadveh_cmd.cpp:907`: the pathfinder clears the trackdirs
  for a bay road stop tile when `v->HasArticulatedPart()`. Bay road stops are refused to articulated
  vehicles outright.
- TT: a road stop tile is the bay (`js/simulation/cmdStation.js:152 buildRoadStop` builds a drive-through
  stop on the road tile). The setting default was checked first: `js/simulation/settings.js:114`
  `articulatedRV: false`, so the fix cannot change default behaviour (with the setting off TT offers no
  articulated model at all, `js/simulation/vehicles.js:39`; the case is reached only when a game with
  articulated vehicles has the setting switched off).
- TT after: `js/simulation/movement.js` `bayEntryRefused()` refuses an articulated road vehicle
  (`articParts(v)`, no allocation) at a stop tile while `articulatedRV` is not `true`; the refusal is
  applied in `move()` (before stepping into the bay) and in `onPathEnd()` (before `arriveAtStation`, so an
  articulated vehicle standing on a bay never starts loading).
- Behaviour when refused: the vehicle does not enter and does not queue; it backs off one tile and
  re-plans (`turnAround`), i.e. it keeps driving, which is what OpenTTD does when the bay stop is
  unreachable (`roadveh_cmd.cpp:919-940`: no reachable tracks -> reverse).

## 3. NEW opt-in: `roadvehQueue` (default `true` = current TT behaviour)

- OpenTTD `table/settings/pathfinding_settings.ini:50` `pf.roadveh_queue` (default `true`) and
  `roadveh_cmd.cpp:919-923` (and `pathfinding_settings.ini:50`): with queueing off, a bay road stop tile with no free bay
  (`!RoadStop::GetByTile(tile, rstype)->HasFreeBay()`) is removed from the pathfinder's reachable
  trackdirs, so the vehicle does not enter the stop and keeps driving.
- TT after: `js/simulation/settings.js` `roadvehQueue: true` (default = queue, unchanged) and one
  `SETTING_META` entry in `js/ui/settingsGroups.js` (group `vehicles`). With `roadvehQueue: false`,
  `bayEntryRefused()` in `js/simulation/movement.js` refuses the entry when the stop tile has no free bay
  (another road vehicle is loading there, `blocking.js:177 bayInUse`) and the stop is the one the current
  order drives to; the vehicle backs off and re-plans instead of waiting, and enters a later pass when the
  bay is free.
- Note: OpenTTD's `pf.roadveh_queue` guard applies to bay (dead-end) stops only; drive-through stops are
  treated as normal road there. TT has only drive-through road stops, so the setting is applied to TT's
  stop bay tile, as asked for in this round.
- Default `true` path: `bayEntryRefused` returns `false` for every non-articulated vehicle and for every
  bay with no loading vehicle, so nothing changes (hash and `simulate-city` unchanged).

## Tests

`tests/adRoad.test.js` (7 tests):
- articulated vehicles never overtake: default (off) pin and with `roadOvertaking` on, with a plain-bus
  control that still overtakes;
- `articulatedRV` off: an articulated vehicle does not enter a bay stop; with it on the same vehicle
  serves the bay (default gate unchanged);
- `roadvehQueue`: default `true`, exactly one `SETTING_META` entry in group `vehicles`; default queues at a
  busy bay and enters when it frees; off -> does not enter, drives off and comes back.

Each behaviour test was checked against the un-fixed code in place: removing the `articSpan` line fails
both overtake tests; removing the `articulatedRV` branch fails the articulated bay test; removing the
`roadvehQueue` branch fails the queue-off test. The files were restored afterwards.
