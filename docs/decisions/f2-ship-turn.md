# F2: shipTurnCost — OpenTTD ship curve/turn cost on the 4-connected water grid (opt-in)

Source: `scratchpad/research/ship-8way-spec.md` §0, §3b, §5(b); OpenTTD `pathfinder/yapf/yapf_ship.cpp:339-352`
(`CYapfCostShipT::CurveCost`), `table/settings/pathfinding_settings.ini:378-388`,
`pathfinder/pathfinder_type.h:16` (`YAPF_TILE_LENGTH = 100`).

## Decision

Ship **movement stays 4-connected**, matching OpenTTD (8 directions are sprite facings, not tile moves) and
OpenLoco. The opt-in gap built here is only the YAPF curve cost that shapes routes. Diagonal 8-way tile moves
are explicitly **not built** (that would be new behaviour neither reference game has; it is user decision D19 /
spec §5(a)).

## Setting

- Key: `shipTurnCost`
- Default: `false` (group `vehicles`, type `check`, label "Ships pay turn cost (OpenTTD)").
- One `DEFAULT_SETTINGS` entry (`js/simulation/settings.js`) and one `SETTING_META` entry
  (`js/ui/settingsGroups.js`).
- Read through `getSetting(state, 'shipTurnCost')` in `js/simulation/routing.js` (`findVehiclePath`, ships) and
  `js/simulation/aiShip.js` (`waterRoute`), and passed to `findShipPath` as `opts.turnCost`.

## Cost mapping

OpenTTD: a tile step costs about `YAPF_TILE_LENGTH` (100); `ship_curve90_penalty` = 6 × 100 = 600 and
`ship_curve45_penalty` = 1 × 100 = 100.

TT's water step cost is 1 tile, so the mapping is `/100`:

| move | OpenTTD cost | TT cost |
| --- | --- | --- |
| straight tile step | ~100 | 1 |
| 90-degree turn (at the tile where the heading changes) | 600 | **6** (`SHIP_CURVE90_COST`) |
| 45-degree turn | 100 | n/a — a 4-connected grid has no 45-degree moves |

The first step out of the start tile has no incoming direction, so it pays no turn cost (OpenTTD's start node
also has no previous trackdir). Docks, buoys, canal/lock tiles and aqueduct decks keep the existing goal and
`shipStepOk`/`aqueductStepOk` semantics.

## Implementation

`findShipPath(map, start, goals, opts)` keeps its old signature; the new argument is optional.

- `opts` absent or `turnCost` false: the historical unit-cost A* body runs unchanged (same neighbours, costs,
  heap tie-break and route order), so default routing and the world hash are byte-identical.
- `turnCost: true`: `findShipPathTurnCost` searches states `(tile, incoming direction)` — 5 slots per tile
  (0..3 = `DIRS` index just used, 4 = unknown start heading). Step cost `1 + (90-degree turn ? 6 : 0)`.
  Goal detection is still per tile, so arrival direction does not change what counts as a goal.
- Heuristic: the existing Manhattan distance to the nearest goal (in tiles) is still admissible and consistent,
  because every step costs at least 1 (turn penalties only add cost), so the first goal popped is optimal.
- Deterministic: binary-heap ties are broken by state index, as before.

## Evidence

- `bun run check`: `OK: 833 files`.
- `bun tools/world-hash.js`: `seed 1 days 60 hash e66b684174510b6b chars 919564` (unchanged).
- `timeout 110 bun tools/simulate-city.js --years 1 | grep -c MATCH`: `1`.
- `bun test tests/f2ShipTurnCost.test.js`: 5 pass / 0 fail.
- Existing `tests/ships.test.js tests/canals.test.js tests/aqueduct.test.js tests/aiShip.test.js
  tests/ogfxShips.test.js`: 40 pass / 0 fail.

## Not done

- No diagonal (8-way) tile moves, no new `DIRS8`, no corner-cutting rule: movement remains 4-connected.
- No turn penalty on the speed/movement model (the ship still takes a 90-degree corner at full speed); only
  pathfinding costs change, which is the route-shape part of OpenTTD's ship YAPF.
- No start-heading input: `findShipPath` does not know the ship's current facing, so the first step is free.
- Not merged/pushed (branch `f2-shipturn` only).
