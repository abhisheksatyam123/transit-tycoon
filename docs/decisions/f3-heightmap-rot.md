# F3 — Opt-in heightmap rotation/mirror (`heightmapRotation`)

Status: implemented on branch `f3-heightmap-rot`. Mapgen option `heightmapRotation`, default **`'none'`**.

## Decision

The heightmap import can be rotated or mirrored with the OpenTTD-style dihedral (mirror/transpose) mappings
recommended by the mapgen coverage spec (U5). The option is part of the mapgen option set
(`MAPGEN_DEFAULTS` in `js/simulation/game.js`), so it is stripped by `mapgenOptions()` at its default and
never appears in a default save. Default import output is byte-identical to before: no extra array copy is
made and the RNG sequence after the import is unchanged.

Supported values (all exact pixel permutations):

| value | mapping (destination `(x,y)` reads source) | output grid |
| --- | --- | --- |
| `none` | `(x, y)` | unchanged |
| `rot90` | `(y, H-1-x)` — clockwise quarter turn | dims swapped |
| `rot180` | `(W-1-x, H-1-y)` | unchanged |
| `rot270` | `(W-1-y, x)` — counter-clockwise quarter turn | dims swapped |
| `flipX` | `(W-1-x, y)` — horizontal mirror | unchanged |
| `flipY` | `(x, H-1-y)` — vertical mirror | unchanged |
| `transpose` | `(y, x)` — main-diagonal reflection | dims swapped |
| `antiTranspose` | `(W-1-y, H-1-x)` — anti-diagonal reflection | dims swapped |

The four rotations are exactly the mirror/transpose combinations OpenTTD's rotation setting is built from;
the mirrors are exposed as well because the spec names a "mirror/transpose mapping" and they cost nothing.

## Implementation

- `js/simulation/heightmap.js`
  - `HEIGHTMAP_ROTATIONS`: the ordered list above (shared with the UI/preferences).
  - `rotateGrid(grid, width, height, rotation)`: pure exact permutation, returns
    `{ values, width, height }`; unknown names and size mismatches throw. `none` returns a copy.
  - `heightsForMap(..., rotation = 'none')`: optional rotation applied to the stretched map-sized heights.
- `js/simulation/map.js`
  - `generateTerrainFromHeights(map, rng, heights, opts)` applies `opts.heightmapRotation` to the imported
    heights **before** slope limiting, rivers/lakes and cover placement. Every pass is invariant under the
    dihedral group (neighbour relations are preserved), so a rotated import yields the rotated baseline map.
  - A quarter-turn/transpose of a non-square map cannot fit the same map shape and throws
    (`heightmap rotation needs a square map`). New Game heightmaps are always square; mirrors and 180°
    still work on non-square programmatic maps.
  - The generated-noise path (`generateTerrain`) ignores the option: it only affects heightmap imports.
- `js/simulation/game.js`: `heightmapRotation: 'none'` added to `MAPGEN_DEFAULTS`; `Game.create` already
  forwards the stripped mapgen object to `generateTerrainFromHeights`.
- `js/ui/newGamePrefs.js`: `heightmapRotation` added to `MAPGEN_PREF_VALUES` (validated on load/save;
  defaults are not stored), so the remembered New Game choice works like the other mapgen selects.
- `js/ui/windows/newGame.js`: a select next to the Heightmap file picker (None / 90° / 180° / 270° /
  mirrors / transposes). Its default is `none`, which `mapgenOptions()` strips, so the default dialog
  behaviour and options are unchanged.

## Default-path guarantees

- `mapgenOptions({ heightmapRotation: 'none' })` is `{}`; default games have no `state.mapgen` change.
- Import without the option, with the option absent, and with `'none'` all produce identical tiles and the
  same post-import RNG state (the transform branch is not entered).
- The pinned mapgen golden hashes (e.g. seed 1 → `23ddba52c54170b7`) and the default world hash
  (seed 1, 60 days → `e66b684174510b6b`) are unchanged.

## Tests

`tests/f3HeightmapRot.test.js`: every mapping on a 2×3 grid, reversibility/composition, `heightsForMap`
source rotation, default vs `'none'` identity, rotated terrain layout and water masks from generation,
non-square rejection, `mapgenOptions` stripping, pinned mapgen hashes and `Game.create` heightmap
default-vs-rotated equivalence. `tests/aeMapUi.test.js`'s pinned defaults gained the new `'none'` entry.

## Not done

- The heightmap aspect-ratio option (spec U5 second half) and the U6/U7/U8 heightmap options are out of
  scope for this task; the map is still stretched.
- Rotation is not exposed in the Settings window (it is a New Game/mapgen option only, as U9 suggests).
