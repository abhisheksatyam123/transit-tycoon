# Breakdown opt-ins (shipBreakdownReduced, ageDecayOttd, serviceOnDepotVisit)

Branch `ad-breakdown`. All three settings default to `false`, which reproduces current transit-tycoon (TT) behaviour
bit for bit (world hash `e66b684174510b6b`, `simulate-city --years 1` MATCH). OpenTTD values appear in comments and here only.

## 1. shipBreakdownReduced

- OpenTTD rule: `vehicle.cpp:1357` `if (v->type == VehicleType::Ship) rel += 0x6666;` (ships break down less).
- TT default: `false` (preserved). Code: `js/simulation/loco/vehicle.js` `armBreakdownTimer`.
- On: a ship's reliability is boosted by `SHIP_BREAKDOWN_BOOST = 0x6666 * 25600 / 65536 = 10240` (+0.4 of full scale)
  before the armed timer is computed, so its breakdown timer is lengthened the way the reliability bonus would.
  Trains are unchanged. The boost is not clamped (OpenTTD does not clamp `rel` either).
- Factor: not a constant multiplier. Example: reliability 0.5 (rng 0.5): timer 156 days off, 506 days on (3.2x).
  At full reliability the boosted value exceeds the 25600 scale, so the timer is still lengthened.
- The RNG draw count is identical on and off.

## 2. ageDecayOttd

- OpenTTD rule: `vehicle.cpp:1454-1466` `AgeVehicle`: `reliability_spd_dec <<= 1` when `age - max_age` equals the
  start of year 0..4 (so at max age, then one, two, three and four years past it).
- TT default: `false` (preserved). TT today drops reliability by 4/25600 per day, or 10/25600 once the model is
  obsolete (`loco/vehicle.js` `RELIABILITY_LOSS_PER_DAY`). `dailyReliabilityLoss` is the single place that decides it.
- On: the daily loss is multiplied by `2^n`, where `n = min(4, floor((age - maxAge) / 365)) + 1` for `age >= maxAge`
  (x2 at max age, x4 after one year, ... x32 from four years on). Before max age it is unchanged.
- Measured: 3 years past max age, the per-day loss is 16x the default (4 doublings, following the source, which
  starts doubling at max age itself). A reading of "2^3 = 8" would start one step later; the source gives 16.
  The test in `tests/adBreakdown.test.js` asserts 16.
- Limits: years are whole 365-day years (TT has no leap years, OpenTTD uses calendar years). The multiplier also
  applies in the `breakdowns: none` branch, since OpenTTD ages reliability regardless of the breakdown setting.

## 3. serviceOnDepotVisit

- OpenTTD rule: `vehicle.cpp:189-203` `VehicleServiceInDepot` runs on every depot entry: reliability is set to the
  engine's reliability, breakdown timers reset, last-service date updated.
- TT default: `false` (preserved). Today a depot entry resets only when `serviceIntervalDays` is set
  (`movement.js` `enterDepot` and `depotOrderVisit`; OpenLoco parity RX2b).
- On: every depot entry calls `servicePerformed` (reliability to `baseReliability`, timers reset, `lastServiceDay`
  and `services` updated), whether or not `serviceIntervalDays` is set. `breakdown_chance /= 4` is not modelled.
- Limits: a vehicle without an interval gets `lastServiceDay` and `services` stored once it is serviced (only when the
  setting is on). `serviceAtDepot` (service trips) is already unconditional and is unchanged.

## Tests

`tests/adBreakdown.test.js` (12 tests): each default is false; each key has one `vehicles` SETTING_META entry; pinned
default ship/train timers (156); ship on is longer (506), trains unchanged; 16x decay at 3 years past max age;
x2/x32 caps; depot reset on vs off for a vehicle without an interval. Forcing each gate off in a scratch copy fails
the matching on-tests.
