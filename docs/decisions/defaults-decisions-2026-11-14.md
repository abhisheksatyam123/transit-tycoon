# Default and open-item decisions (2026-11-14)

Decided by the lead orchestrator under the user's instruction "decide everything yourself".
Rule applied: default changes are made only where the user approved them explicitly; everything
else stays default-preserving.

| Item | Decision | Reason |
|---|---|---|
| `economyType` (D8) | Keep `'openloco'` | No OpenTTD target is recorded in the repo; project rules are OpenLoco. |
| `timetableLateness` (G7 prerequisite) | Keep off | Not in the approved list. Turning it on changes timetabled orders for every game. `timetableLatenessConditional` (on) stays inert until it is approved separately. |
| `maxBridgeLength` / `maxTunnelLength` (D5) | Keep 64 (approved) | TT counts both heads, so 64 may equal OpenTTD 62 rather than 64. Recorded here; no change. |
| `autoslope` (D5) | Keep on (approved) | Matches the OpenTTD value cited in `w2-construction.md`. |
| Signal timeouts (D8) | Drop | No setting exists; the 3-day `BLOCK_TIMEOUT_TICKS` is a design constant. |
| Noise model (D8) | Drop | No code exists to flip. |
| Unpowered-electric stall (D8) | Drop | No recorded target value. |
| `serviceAtHelipad`, `disableElrails` (D8) | Keep opt-in (off) | Brief B4 recommendation. |
| `selectGoods` (D8) | Keep on | Already the OpenTTD default. |
| D13 remainder: 324 own-file exports | Keep exported | Count did not reproduce; un-exporting them gains nothing. 61 names were un-exported in P2. |
| D16 full G7 | Closed as partial | Conditional wait, stop/start, display, label and save test are built; no further G7 work planned. |
| D7 per-type history | Closed (opt-in) | `financeByVehicleType`, read-only table. |
| D20 U7–U9 | Closed | U7 height select (opt-in default same-as-width); U8 and U9 already on main. |
| D1, D9, D11, D12, D19 | Closed | Already built, opt-in, merged. |
| D15, D17, D21 | Approved as shipped | Opt-in, default off. |
| SAVE_VERSION (calendar) | No bump | Calendar persists through the save's own-key serialization. |
| N10 a, b, c, d, f, g | Keep as built | Pure UI; brief B9 recommendation. |
| N10 e volume | Built (slider, default 100) | P1. |

Superseded default statements in older decision docs are listed in each doc under
"Superseded 2026-11-14" and are not rewritten.
