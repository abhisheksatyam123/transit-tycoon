# order.gradual_loading: how OpenTTD does it, and how to port it to TT

Status: research only (no code). Date 2026-11-10. Default-preserving port recommended (opt-in, default off).

## Sources (checked online, 2026-11-10)
- Upstream `src/economy.cpp` (OpenTTD master, raw GitHub): `GetLoadAmount` (1299-1335), unload cap (1670), load cap (1779), wait table and stop rule (1840-1860), station-length penalty `UpdateLoadUnloadTicks` (1593-1607).
- Upstream `src/table/settings/game_settings.ini`: `order.gradual_loading`, default **true**, SC_EXPERT, NoNetwork.
- Upstream `src/table/engines.h` macro comments: per-class `load_amount` (see table below).
- Upstream `src/timer/timer_game_tick.h:85`: `DAY_TICKS = 74`.
- Upstream history: `039794e83c` (svn r7326, 2006, feature "gradual (un)loading"), `908552d7ed` (r7377, cargo paid once), `a994c1ef71` (r20506, stop after a short cycle), `12133ffb31` (r20843, termination with multi-cargo consists).
- OpenTTD manual, Cargo page (wiki.openttd.org/en/Manual/Cargo): confirms the selectgoods rule (a station takes producer cargo only after a vehicle that accepts it has visited).

## How it works upstream
1. **Load amount per cycle, per vehicle part.** `GetLoadAmount(v)` (economy.cpp:1299) returns the engine's `load_amount`. Each articulated/consist part with capacity loads `cap_left = min(cap_left, load_amount)` per cycle (economy.cpp:1779). Air mail uses a quarter (1305-1306). Zero is clamped to 1 (1334).
2. **Unload is gradual too.** `amount_unloaded = min(count, load_amount)` per cycle (economy.cpp:1670). Cargo left over keeps the vehicle in an unloading state (`remaining`, 1722).
3. **Wait between cycles.** When a cycle moved anything, the next cycle waits a fixed time from `gradual_loading_wait_time = { 40, 20, 10, 20 }` for train, road, ship, aircraft (economy.cpp:1851-1853, "values found in TTDPatch"). Units are OpenTTD ticks (74 per day).
4. **Stop rule.** Loading stops when a cycle moved less than the per-part allowance for every cargo, and the order is not full load, and the timetable wait is over (economy.cpp:1857-1859, from r20506). A full-load order keeps going.
5. **Payment once.** Each delivered slice is paid as it is unloaded; cargo is not paid twice (r7377).

Load amounts (upstream engines.h, base table, per class; these are real values, not invented):

| Class | Macro | load_amount |
|---|---|---|
| Train, multiple unit, carriage | MT / MM / MW | 5 |
| Road vehicle | MR | 5 |
| Ship | MS | 10 |
| Aeroplane | MA | 20 (mail 1/4 = 5) |

So the earlier objection ("TT has no per-model load amount") does not hold for the base set: the amount is per class in OpenTTD's own table. NewGRF can override it (callback 12/36), which TT does not support.

## Mapping to TT
- TT loads everything in one step at the end of the stop: `loadingTick` (js/simulation/orders.js ~644) calls `loadCargo` once; `LOAD_TICKS = 40` is the whole stop. Unload is instant in `arriveAtStation` (`unload`, orders.js ~610).
- Gradual loading changes the timing and the amount per stop, so it changes money and the world hash. It must be opt-in (default off), like `improvedLoad` and `stationLengthLoadingPenalty`.
- **Time units:** OpenTTD waits 40/20/10/20 OpenTTD ticks (74 per day). TT has 96 ticks per day (js/simulation/constants.js:24). For real time to match, convert: 40 -> 52, 20 -> 26, 10 -> 13 TT ticks. TT's own `LOAD_TICKS = 40` is not an OpenTTD number; leave it for the non-gradual path.
- **Per-part budget:** TT has `v.consist` (mixed wagons) and `v.wagons`. A part with capacity contributes `loadAmount(class)`; the cycle budget is `amount x carrying parts` (cargo-less engines do not count, as in economy.cpp:1663 `cargo_cap == 0`).

## Recommended port (two phases)
**Phase 1, loading only (M):** when the setting is on, `loadingTick` caps each cycle at the budget and sets the wait to the converted table value. Stop when the cycle loaded less than its budget (unless full load or a timetable hold). Unloading stays instant (a documented deviation).
**Phase 2, unloading (L):** unload per cycle with the same budget and a per-vehicle "unloading" flag; cargo left aboard keeps the vehicle cycling; pay per slice. This touches the payment and cargodist/transfer path (`unloadSlice`), so it needs its own tests and a hash check.

Tests to add: default off is unchanged (hash e66b684174510b6b); a 4-wagon coal train loads 20 per cycle with 5 per part; cycle wait equals 52 TT ticks; stop after a short cycle; full-load keeps going; air mail 1/4; total money on a short run is within the stated bound (not equal to the one-step model).

## Open decisions for the user
1. Phase 1 only (loading), or phases 1+2 now?
2. Default: keep off (recommended, as with the other loading options), or on (OpenTTD default, changes the world hash and saves' timing)?
3. Use OpenTTD's wait values converted to TT ticks (recommended), or keep TT's 40-tick stop time as the cycle wait?
