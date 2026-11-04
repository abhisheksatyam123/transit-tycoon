# Contributing to Transit Tycoon JS

Thanks for helping! This guide follows the spirit of OpenTTD's contributor guide:
small focused changes, clear bug reports, and a codebase that stays easy to maintain.

## Using the issue tracker
Use issues for bug reports and well-defined feature requests. Search before opening a new one.

## Bug reports
A good bug report contains:
- What you did, what you expected, what happened instead.
- Browser + OS, game seed (New Game window) and in-game date.
- A save file (Save window -> *Export JSON*) that reproduces the problem, if possible.
- Console errors (DevTools -> Console).

## Feature requests
Describe the gameplay problem first, then the proposed solution. Features should fit the project
goals below. Large features (signals, aircraft, ships, multiplayer) should be discussed before coding.

## Pull requests
- One logical change per PR; keep diffs small and reviewable.
- Follow the architecture in `docs/ARCHITECTURE.md`:
  - `js/simulation/` stays **pure and deterministic**: no DOM, no `Math.random` (use the game RNG),
    all state in `game.state` so it can be saved.
  - Game data (cargo, industries, vehicles, costs) goes in `js/config/`, not in logic.
  - UI/renderer never mutate `game.state` directly; they call Game commands.
  - One responsibility per file; split files that grow beyond ~400 lines.
  - Named exports, JSDoc on exported functions, ES modules, no new runtime dependencies.
- Update `docs/ARCHITECTURE.md` (module map, state shape, Game API, data flow) when you change the state shape or Game API, and bump
  `state.version` with a migration in `js/simulation/save.js` if old saves would break.

### Pull request validation
Before opening a PR:
```sh
bun test                                  # all tests must pass
bun run check                             # all imports resolve
bun run simulate -- --seed 1 --years 2   # headless city run; exit 0 required
bun run dev                               # play-test the change; no console errors
```
`bun run simulate` exits `1` on any error-severity diagnostic or a save/load determinism MISMATCH.
Run it on at least one seed when touching worldgen, roads, stations, traffic or the save format.

### Adding a diagnostic check
1. Pick the file: `js/simulation/diagChecksMap.js` (map/roads/tracks) or `diagChecksEntities.js` (vehicles,
   stations, traffic, finance). Keep new files under ~400 lines.
2. Write a pure `checkXxx(state)` that reads state only and returns Issues built with `mkIssue(id, severity, category, message, {x,y,...})`
   from `js/simulation/diagIssue.js`. Use `emitItems(items, family, severity, category, describe)` for lists; it aggregates above `AGG_LIMIT`.
3. Register it in `runDiagnostics` in `js/simulation/diagnostics.js`.
4. Add a `bun:test` case in `tests/` with a deliberately broken state that must produce the issue, and one clean state that must not.
5. Check that the harness still reports `error=0` on the default seeds; warnings are fine but name the cause in the message.

Issue ids must be stable (they key the City Issues window). Use the `family:detail` pattern.
Add or update tests in `tests/` for any change to `js/simulation/`. Bug fixes should come with a test
that fails without the fix.

## Code reviews
Reviews focus on correctness, determinism, readability and fit with the project goals.
Be kind and specific; address all comments or explain why not.

## Use of AI
AI-assisted contributions are welcome if you understand, test and take responsibility for every
line you submit. Do not submit generated code you cannot explain.

## Project goals
- A faithful-feeling, approachable transport tycoon game that runs in any modern browser.
- Zero install for players, zero build step for developers.
- Deterministic simulation (same seed + same commands = same result), enabling tests,
  replays and future multiplayer.

## Legal stuff
Contributions must be your own work. OpenTTD is an inspiration only: do not copy its source
code, graphics, sounds or text into this repository.
