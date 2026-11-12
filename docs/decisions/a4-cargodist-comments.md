# A4 — cargodist link-graph recalc comments (comment/doc fix only)

Scope: comments and help strings only. No code logic, constant value or setting default changed.
Source of the finding: `scratchpad/research/cargodist-mcf-cadence-spec.md` section 2.1 (the "section 6" referenced in the task is §2.1 in the file).
Known gap: TT rebuilds all cargos monthly; OpenTTD's cadence is in days. Tracked in `scratchpad/gaps/GAPS.md` (H4 row).

## OpenTTD evidence (verified in scratchpad/openttd/src)

| Fact | Evidence |
|---|---|
| `linkgraph.recalc_interval` ini default = 8, min 4, max 90 | `table/settings/linkgraph_settings.ini:42-47` (`def = 8` at :45) |
| `linkgraph.recalc_time` ini default = 32, min 1, max 9000 | `table/settings/linkgraph_settings.ini:55-60` (`def = 32` at :58) |
| `SECONDS_PER_DAY = 2` | `timer/timer_game_common.h:168` |
| Scheduler divides interval by SECONDS_PER_DAY → spawn/join in days | `linkgraph/linkgraphschedule.cpp:205-208` (also :178) |
| Job join_date = date + recalc_time / SECONDS_PER_DAY (days) | `linkgraph/linkgraphjob.cpp:44` |
| Old configs multiplied by SECONDS_PER_DAY on load | `settings.cpp:1416-1417` |

Derived: recalc_interval 8 s / 2 = **4 days** (range 2..45 days). recalc_time 32 s / 2 = **16 days**.

## Comments changed

1. `js/simulation/settings.js:156` (JSDoc of `linkgraphRecalcInterval`)
   - before: `link graph schedule in months (OpenTTD linkgraph.recalc_interval; OTTD default 8 days). 1 = rebuild monthly (current).`
   - after: `link graph schedule in months. OpenTTD linkgraph.recalc_interval default is 8 in economy seconds x SECONDS_PER_DAY=2 = 4 days (linkgraph_settings.ini:45, timer_game_common.h:168). TT is monthly, not the OpenTTD cadence (known gap, see GAPS.md). 1 = rebuild monthly (current).`

2. `js/simulation/settings.js:158` (JSDoc of `linkgraphRecalcTime`)
   - before: `months a link graph job runs before its routing is applied (OpenTTD linkgraph.recalc_time). 0 = applied at once (current).`
   - after: `... (OpenTTD linkgraph.recalc_time; default 32 economy seconds x 2 = 16 days, linkgraph_settings.ini:58). Not the OpenTTD delay: TT counts months (known gap, see GAPS.md). 0 = applied at once (current).`

3. `js/simulation/cargodist.js:476-477` (JSDoc of `updateMonthly`)
   - before: `Monthly link graph schedule (OpenTTD linkgraphschedule.cpp, in months).`
   - after: `Monthly link graph schedule. OpenTTD linkgraphschedule.cpp runs in days (recalc_interval default 4 days, recalc_time 16 days; linkgraph_settings.ini:45,58; SECONDS_PER_DAY=2). This function counts months, so it is NOT the OpenTTD cadence (known gap, see GAPS.md).`

4. `js/simulation/cargodist.js:17-19` (module header, "Simplifications vs OpenTTD")
   - before: `... the monthly rebuild instead of the incremental job scheduler.`
   - after: `... the monthly rebuild instead of the incremental job scheduler (OpenTTD default cadence is every 4 days with 16-day recalc_time; TT is monthly, known gap, see GAPS.md).`

5. `js/ui/settingsGroups.js:218` (help text, Link graph interval)
   - before: `A link graph job starts every this many months (OpenTTD linkgraph recalc_interval, days). 1 = rebuilt monthly.`
   - after: `A link graph job starts every this many months. OpenTTD recalc_interval defaults to 4 days (not months); TT is monthly by design (known gap, see GAPS.md). 1 = rebuilt monthly.`

6. `js/ui/settingsGroups.js:220` (help text, Link graph delay)
   - before: `A link graph job takes this many months before its routing is applied (OpenTTD linkgraph recalc_time). 0 = applied at once.`
   - after: `... OpenTTD recalc_time defaults to 16 days (not months); known gap, see GAPS.md. 0 = applied at once.`

## Unit audit (item 4): days-named settings used as ticks/months

Checked every setting with a Days/Months/Ticks name in `js/simulation/settings.js` and its consumers:
- `serviceIntervalDays` (settings.js:45) — used as days via `dayNumber(state.date)` (service.js:21, :38). Consistent.
- `subsidyMonths` (settings.js:36) — used as months (`remainingMonths`, subsidies.js:150-152). Consistent.
- `engineRenewMonths` (settings.js:256) — months, converted x30 to days (autorenew.js:28). Consistent (30-day month approximation, documented).
- `linkgraphRecalcInterval` / `linkgraphRecalcTime` — months (cargodist.js:482-483, `now = year*12+month`). Consistent with the comments above; the only inconsistency was the wording ("days"/"8 days"), now fixed.
- `EDGE_EXPIRE_MONTHS = 3` (cargodist.js:32) — used against `g.month` (cargodist.js:356). Consistent.

No setting named in days is used as ticks or months. No logic was changed.

## Gates
See the final report (bun run check, world-hash, simulate-city, targeted tests).
