# Decision #52 — Max loan inflation adjustment: keep default FALSE

Date: 2026-11-09 · Status: CLOSED-by-decision · Source: `scratchpad/tmp/E1_authority_defaults.md`; GAPS #52

## Decision
Keep `inflationAdjustsMaxLoan` default `FALSE` — OpenLoco parity (no inflation adjustment of max loan) as the default. Reference implementation: `CompanyManager.cpp:1191`, `ChangeLoan.cpp:33`.

## Implementation (already landed)
- Toggle: `inflationAdjustsMaxLoan`, default `false` — `js/simulation/settings.js:20`
- Gate: `effectiveMaxLoan` — `js/simulation/prices.js:55-56`
- UI: opt-in setting — `js/ui/settingsGroups.js:138-139`
- Test coverage: economy tests

## Save / migration semantics
- Enabling the toggle **changes balance/hash**: it alters loan headroom → money trajectory → world-hash and simulate MATCH for any affected game.
- Therefore enabling is a **deliberate opt-in** only; default `false` preserves prior balance/hash (`e66b684174510b6b`).
- **No migration of existing saves**: existing saves keep their stored setting (default `false`); nothing is rewritten on load. Old saves load unchanged.

## Product note
The open product question ("OL parity vs opt-in inflation") is resolved: OL parity is the default; inflation adjustment is available as an opt-in setting.
