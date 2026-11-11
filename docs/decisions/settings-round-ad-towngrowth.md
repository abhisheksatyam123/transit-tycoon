# Town growth model setting (`townGrowthModel`) — OpenTTD station-driven growth, opt-in

Status: opt-in alternative. Default `'tt'` = current Transit Tycoon behaviour (unchanged).
Pinned decisions: `docs/decisions/town-capacity-77.md` (TT build-speed model) and `docs/decisions/town-authority-74.md`
are NOT changed; the TT build-speed model stays the default and the only model when `'tt'`.

## OpenTTD rule (source: `scratchpad/openttd/src/town_cmd.cpp`)
- `CountActiveStations` (`town_cmd.cpp:3874-3884`): a station near the town counts as active if
  `st->time_since_load <= 20 || st->time_since_unload <= 20` (days).
- Growth-period table (`town_cmd.cpp:3898-3899`): `_grow_count_values[2][6]`, row 0 = fund new buildings active
  (`120,120,120,100,80,60`), row 1 = normal (`320,420,300,220,160,100`), indexed by `min(active, 5)`.
- Period scaled by houses: `m / (num_houses / 50 + 1)` (`town_cmd.cpp:3907-3910`).
- No active station: a growth check only passes with `Chance16(1, 12)` (`town_cmd.cpp:3963`).

## TT default `'tt'` (preserved)
- Growth = `growForTick` with `buildSpeed` from monthly delivered cargo (`js/simulation/loco/town.js` ~140-142,
  `js/simulation/loco/townGrow.js` `growForTick`). The 'tt' path makes no extra RNG draws and writes no fields.
- Verified: default growth counts match the pre-change tree (test `TT_BASE_GROWTH_EVENTS = 43`), world-hash `e66b684174510b6b`.

## What `'ottd'` changes
- Growth checks (`growForTickOttd`, `js/simulation/loco/townGrow.js`) replace the `buildSpeed` step count.
- Active stations (`countActiveStations`): stations with `tiles.length`, within `localAuthorityDist` of the town
  (same reach as `townAuthority.js`), and a pickup (`st.lastPickup[*]` tick within 20 days) or a delivery
  (`st.lastUnload` tick within 20 days).
- `st.lastUnload` is a plain tick number written in `deliverLoad` (`js/simulation/orders.js`) only when `'ottd'` is set,
  so `'tt'` saves are byte-identical. It is a normal station field and round-trips in saves.
- Zero active stations: growth check passes with chance 1/12. One or more: chance = `period / 420` (capped at 1),
  `period` = OpenTTD table value / (houses/50 + 1). A passing check runs one `growTown` step.
- `buildSpeed` is still computed monthly (unchanged) but is not used for growth under `'ottd'`.

## Limits
- The growth table and the 20-day rule are OpenTTD's. The TT houses/buildSpeed model is unchanged for `'tt'`.
- Mapping: one `growTown` step per check, not OpenTTD's tick counter; the 420 reference is the OTTD normal value at one station.
- Not modelled: `larger_town` halving, `town_growth_rate` multiplier (use the existing `townGrowthRate` setting instead),
  `time_since_unload` on transfers (only final deliveries write `lastUnload`), OpenTTD's exact station-town edge test
  (`HZB_TOWN_EDGE`); the authority distance is used instead.
- `growTown` can fail even when a check passes (no free site), so measured growth counts are below the chance ratio.
  The seeded test asserts `slow * 2 < fast` (measured 25 vs 72 over 2400 calls).

## Tests
`tests/roundACTownGrowth.test.js`: default `'tt'` and one SETTING_META entry; default growth equals the pre-change number;
`'ottd'` no-station town grows markedly slower than one-station town (seeded); station activity window; growth table.
Forcing `'tt'` in the ottd growth test makes it fail (checked in a scratch copy).
