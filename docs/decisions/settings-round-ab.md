# Round AB: four OpenTTD settings ported (default-preserving) and the decisions behind them

Date: 2026-11-10. Commit `52cd160` (code), this doc and tests in the follow-up commit.

## Ported

| TT key | OpenTTD setting | OpenTTD default | TT default | Code (file:line) |
|---|---|---|---|---|
| `infiniteMoney` | `difficulty.infinite_money` | false (`difficulty_settings.ini:318`) | false | `settings.js` `infiniteMoney(state)`; `trackRules.js` `checkMoney`; `shares.js` tradeShare/shareBlock; `loco/companyManager.js` updateMonthly1 (no debt count, no bankruptcy); `statusbar.js` shows ∞ |
| `cargoAgingRate` | `economy.cargo_aging_rate` | 100 (`economy_settings.ini:387`) | 100 | `loco/economy.js` calculateDeliveredCargoPayment scales the transit days (`economy.cpp:966`) |
| `serviceAtHelipad` | `order.serviceathelipad` | true (`game_settings.ini:82`) | false | `orders.js` arriveAtStation: a helicopter on a helipad calls `servicePerformed` (`aircraft_cmd.cpp:1583`) |
| `townFounding` | `economy.found_town` | Forbidden (`economy_settings.ini:76`) | 'allowed' | `cmdFound.js` foundTown refuses when 'forbidden' |

All four have one `SETTING_META` entry (`js/ui/settingsGroups.js`), as the settings invariant requires.

## Decisions (TT default kept on purpose)

- **serviceAtHelipad = false.** OpenTTD services aircraft on a helipad by default. TT keeps the current behaviour (no service on arrival) so existing games and the world hash do not change. The user can turn it on in Vehicles.
- **townFounding = 'allowed'.** OpenTTD defaults to Forbidden. TT keeps founding allowed so existing games are unchanged.
- **infiniteMoney = false.** The default is OpenTTD's; this is a difficulty switch, not a behaviour change.
- **initial_interest -> `loanInterestRate`, TT default 5.** OpenTTD's default is 2 percent. TT's `loanInterestRate` is in OpenLoco units (`settings.js:18`, `settingsGroups.js:189`), which TT already uses, so the mapping is by meaning. TT keeps 5 so the loan economy is unchanged.
- **competitor_start_time: not ported.** It is legacy in OpenTTD (`difficulty_settings.ini:11`, listed among the old settings). Nothing to map.
- **never_expire_airports: not ported.** NewGRF-only in OpenTTD.

## Tests

- `tests/roundABSettings.test.js` (15 tests): defaults and UI entries; infinite money on/off for purchases, share buys, and debt bankruptcy; cargo aging 100 / 200 / 0; found town allowed / forbidden; serviceAtHelipad off / on / on a plain tile. The helipad "on" test was checked to fail when the gate is forced off.
- `tests/playthrough.test.js` (6 tests): a scripted coal line runs 100 days, delivers coal, gains money, and a save/load round trip gives an equal game that then continues identically for 20 days.

## Not yet covered (need a design, not invented here)

- `economy.fund_buildings` and `economy.fund_roads` (OpenTTD town funding): TT has no funding model for these.
- Town and station noise: no noise model in TT.
