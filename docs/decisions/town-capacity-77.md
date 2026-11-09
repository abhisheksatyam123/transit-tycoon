# Decision #77 — Town planned capacity and build speed: KEEP baseline (Option O0)

Date: 2026-11-10 · Status: CLOSED-by-decision · Source: `scratchpad/tmp/S3_town77.md` (T122 deep analysis)

## Decision
Keep Transit Tycoon's current town size and build speed model (Option O0 status quo):
- `recalculateSize(town)` in `js/simulation/loco/town.js:55-57` continues using actual placed population with hysteresis (`POPULATIONS = [0, 150, 500, 2500, 8000]`, downgrade threshold `+100`).
- `updateMonthlyTown(town)` in `js/simulation/loco/town.js:135-136` continues deriving `buildSpeed` from monthly delivered cargo (`Math.floor(delivered / 100) + 1`, clamped `[1, 4]`).
- Do NOT port OpenLoco's `populationCapacity` from building objects or `cargoInfluenceFlags` region `MIN`.

## Why
1. **Missing source data in-tree**: OpenLoco planned capacity derives from static building object definition structures (`BuildingObject`) and regional influence grids (`cargoInfluenceFlags`). Transit Tycoon does not model per-building object files or regional cargo influence masks; implementing a synthetic planned capacity model would be speculative.
2. **Strict determinism & RNG coupling**: `town.size` is a gameplay gate controlling `MAX_LEVEL_BY_SIZE = [2, 3, 4, 4, 4]` in `js/simulation/loco/townGrow.js`. Altering how or when `town.size` transitions alters building-level caps during `growForTick()`, immediately altering RNG consumption order and tile placement. This would break `world-hash` (`e66b684174510b6b`) and fail `simulate-city` determinism `MATCH`.
3. **Gameplay balance**: The delivered cargo formula (`pass + goods` for temperate, plus food/water in climates) provides direct, observable incentives for player transport service without requiring complex unrendered regional influence fields.

## Balance / hash impact
- Keeping baseline = **zero change** to simulation hash, save serialization, or scenario pacing.
- World-hash remains pinned at `e66b684174510b6b`.
- If diagnostic telemetry for potential building slots is ever desired, it must be read-only (Option O1 telemetry) and never coupled to `town.size` or RNG growth steps.
