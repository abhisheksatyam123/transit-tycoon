# Decision #74 — Town authority monthly drift: KEEP OTTD-like +12/−15

Date: 2026-11-09 · Status: CLOSED-by-decision · Source: `scratchpad/tmp/E1_authority_defaults.md` §(a)

## Decision
Keep the current OpenTTD-like monthly station drift in `js/simulation/townAuthority.js` (`SERVED_DAYS=20`, per-station `+12` served / `−15` unserved within `LOCAL_AUTHORITY_DIST=20`, netted via `adjustCompanyRating`, clamp `[-1000,1000]` — E1 cites `townAuthority.js:48,124-165`, `:26`, `:50`). Do NOT align to OpenLoco's `+1`/month service rating (`StationManager.cpp:122`, `Town.cpp:231-240`).

## Why
- TT's refusal threshold (rating < 0) and council tolerance tiers (`townAuthority.js:31-40`) are tuned around ±12/−15 dynamics; OL's +1 makes town refusal near-unreachable and would break #74's intent (E1 §a).
- Aligning to OL would only be correct if also rescaling rating range/refusal thresholds — a larger balance change with no user demand (E1 §a).
- Simpler and performance-neutral (E1 §a).

## Reference points (per E1)
- OTTD: `town_type.h:54-55` `RATING_STATION_UP_STEP=12`/`DOWN=-15`; `town_cmd.cpp:3821-3840` `UpdateTownRating`, clamp 0..1000 — TT matches OTTD steps on OL's wide scale (deliberate hybrid).
- OL: no monthly station drift; only `+1`/month if any station updated cargo.

## Balance / hash impact
Keeping = **zero change** (world-hash `e66b684174510b6b` unchanged, simulate MATCH). Aligning to OL would retune `REFUSE_BELOW`/tolerances, change world-hash for any save with a town station (drift feeds `town.companyRating` → serialized), and risks silent save divergence. Any future OL-fidelity pass must be gated behind a setting defaulting OFF.

## Thresholds rationale
`REFUSE_BELOW`/tolerance tiers stay as-is — they are the reason the drift magnitude must stay: ±12/−15 is what makes refusal reachable but not instant.
