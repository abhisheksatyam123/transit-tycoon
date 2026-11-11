# Setting: industryCargoBacklog (wtAC8, branch ac-indbacklog)

## OpenTTD behaviour
OpenTTD keeps produced cargo that has no accepting station in the industry's waiting buffer
(`industry_cmd.cpp` ~529-553 and ~1151-1161: `produced[].waiting`, u16, cap 65535, gated by `minimal_cargo`).
Connecting a station later pays out the buffered cargo. OpenTTD has **no setting** for this: the behaviour is always on.
Recorded here as the OpenTTD reference; it is not a TT setting value.

## TT default
`industryCargoBacklog: false` (`js/simulation/settings.js`). Default = current Transit Tycoon: undelivered output is
discarded. Default games are unchanged (world hash e66b684174510b6b).

## Rule
- Off: as before. Output is removed from `outputBuffer`, `deliverCargoToStations` places what it can, the rest is lost.
- On: the undelivered part of each daily production batch is added to `ind.cargoBacklog[slot]` (u16 cap 65535).
  At each monthly tick (`Industry.updateMonthly`, before the monthly production changes) the buffer is offered to the
  stations in range (`ind.statsStations`, same split as a daily delivery). Whatever is not placed stays in the buffer.
  Placed amounts count as delivered this month. No rng is drawn.

## Changes (file:line, wtAC8)
- `js/simulation/settings.js:166-167`: key `industryCargoBacklog: false` with comment.
- `js/ui/settingsGroups.js:133-134`: SETTING_META entry, group `economy`, type check (one entry).
- `js/simulation/loco/industry.js:196-201`: daily path keeps undelivered output when on.
- `js/simulation/loco/industry.js:294-310`: `offerBacklog()` (monthly offer).
- `js/simulation/loco/industry.js:319-320`: `updateMonthly` calls `offerBacklog` when on.
- `tests/roundACBacklog.test.js`: defaults, off/on behaviour, cap, delivery after a station is built, round trip.

## Save format
No format change. The buffer is a plain number array on the industry object (`cargoBacklog: [slot0, slot1]`), created
only when the setting is on, so the JSON is generic and round-trips. Old saves and games with the setting off have no
field (read as 0). Save output with the setting off is byte-identical to before.

## Limits
- The buffer is offered monthly, not daily: a station built mid-month is paid at the next monthly tick.
- `selectGoods` (default on) still applies: a station only takes producer cargo after a vehicle tried to load there.
- A closing industry removed by the manager loses its buffer (the offer runs before the removal check, but leftover
  cargo is not paid out).
- Per-slot buffers (2 produced cargo slots), not OpenTTD's exact per-cargo `waiting` with `minimal_cargo` gating.
- Cap is 65535 units per slot (OpenTTD u16), not per cargo type on the station.
