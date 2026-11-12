# D19: ship "8-way" pathing — meaning and status (informational record)

Status: **informational record. No default change, no behaviour change.**
Recorded as the recommended close-out of D19. This note does not claim that a user decision was made.
Sources: `scratchpad/research/ship-8way-meaning-spec.md` (§1–§3, read-only research at b7dd08c) and
`docs/decisions/f2-ship-turn.md` (F2 opt-in build, commit 36e34ba).

## Finding

- In OpenTTD and OpenLoco, "8-way" refers to **8 sprite facings** (the OpenTTD `Direction` enum), not to
  diagonal tile moves. Ship movement graphs are **4-connected** in both games: a ship steps one tile edge at a
  time (OpenTTD `GetAvailShipTracks` = water tracks & `DiagdirReachesTracks`, `ship_cmd.cpp:512-514`;
  OpenLoco `kRotationOffset[0..3]`, `Map/Tile.h:42-45`, water pathfinder `for i<4`, `VehicleHead.cpp:3806, 3858`).
- The fidelity feature that OpenTTD does have is the **pathfinder curve cost**: YAPF `CurveCost` adds
  `ship_curve45_penalty` (default 1 × YAPF_TILE_LENGTH) and `ship_curve90_penalty` (default 6 ×
  YAPF_TILE_LENGTH) (`yapf_ship.cpp:339-352`; `table/settings/pathfinding_settings.ini:378-390`).
- Our equivalent is **already built**, as an opt-in setting:
  - Setting `shipTurnCost`, default `false` (`js/simulation/settings.js:244`); UI label
    "Ships pay turn cost (OpenTTD)" (`js/ui/settingsGroups.js:197`).
  - Wiring: `js/simulation/routing.js:211` and `js/simulation/aiShip.js:150` pass
    `{ turnCost: getSetting(state, 'shipTurnCost') }` into `findShipPath`.
  - Implementation: `js/simulation/shipPath.js:82` (`SHIP_CURVE90_COST = 6`), `:147-152` (direction-aware
    `findShipPathTurnCost`, node = tile × incoming direction), `:191` (turn cost applied on 90° turns).
  - Default path (`shipTurnCost` off) is the unchanged 4-connected unit-cost A*, so routes and the world hash are
    unchanged.
- Rendering: ships use **4 facings only**. `js/renderer/pack/ships.js:53` picks the facing with
  `seg.ang !== undefined ? dirFromAng(seg.ang) : dirFromBit(seg.dir)`. `ang` is never set for ships, so
  `dirFromBit` (`js/renderer/pack/vehicles.js:200-205`, bits 1/4/8 map to facings 1/5/7, else 3) is used. That
  gives the axis facings NE, SE, SW, NW, which matches OpenTTD's axis-aligned ship sprites. Segment direction comes
  from `dirBetween` (`js/simulation/constants.js:60-67`, returns 0 for diagonals) in `pointAlong`
  (`js/simulation/vehicles.js:320`), so a diagonal segment would be spaced and oriented wrongly.

## Options

- (a) Real diagonal tile moves (8-way movement). **Not OpenTTD/OpenLoco behaviour.** It would need new movement,
  geometry, and rendering work (diagonal step length, facing, corner rules). Recorded as an optional future opt-in,
  default off, only if a non-OpenTTD behaviour is explicitly wanted.
- (b) Keep 4-connected movement and add the turn cost. **Done**: `shipTurnCost` (F2).

## Recommendation (recorded, not decided)

Close D19 as "8-way = 8 sprite facings; OpenTTD turn cost built as opt-in `shipTurnCost`". Do not build diagonal
moves by default. Any diagonal-move opt-in is a separate, explicit request.

## Verification

- Refs above were checked against the working tree at main c95e940 (`shipTurnCost` wiring, `shipPath.js` lines,
  renderer `dirFromBit` and `pointAlong`).
- The OpenTTD/OpenLoco line refs come from the research spec (read-only); they were not re-traced in this note.
- No code, default, or world-hash change in this record.
