# F1: OpenTTD group replace protection (opt-in)

**What.** New setting `autoreplaceProtectOttd` (boolean, **default off**) changes what a protected vehicle group
(`group.replaceProtect`, OpenTTD `GroupFlag::ReplaceProtection`) blocks.

| | Default (off, current TT behaviour) | `autoreplaceProtectOttd` on (OpenTTD) |
|---|---|---|
| group's own rule (`company.groupAutoreplace[gid]`) | blocked | applies |
| company-wide rule (`company.autoreplace`) | blocked | blocked |
| autorenew past max age (`autorenew` setting) | blocked | applies |
| wagon-kind remap through the group rule (E2) | blocked | applies |

OpenTTD reference: `autoreplace.cpp:70` - the protect check only skips the `ALL_GROUP` (company-wide) lookup; the
vehicle's own group rule is read first and is unaffected. Autorenew is not an engine-replacement rule in OpenTTD, so
protection does not stop a vehicle from being renewed for age.

**Default preservation.** The setting defaults to `false` and is never written by a new game or by loading a save
(`getSetting` falls back to `DEFAULT_SETTINGS`). While it is off, `groupProtectBlocksAll(state, v)` reproduces the old
early guards in `autorenewVehicle` / `isAutoreplaceEligible` and the old first branch of `autoreplaceTarget`: a
protected group returns no rule for the group rule, the company rule or autorenew. Existing tests
(`tests/e2Autoreplace.test.js`, `tests/groupFlag.test.js`) pass unchanged. World hash is unchanged
(`seed 1 days 60 hash e66b684174510b6b chars 919564`).

**Lookup order.** `autoreplaceTarget(state, v, modelId)`:
1. If `v.groupId` is set and the group is protected:
   - setting off -> return no rule (TT: blocks everything);
   - setting on -> continue, but never fall through to the company rule.
2. Group rule for `modelId`, when present -> return it.
3. If the group was protected and the setting is on -> return no rule (protect blocks only `ALL_GROUP`).
4. Otherwise the company rule, exactly as before.

The helper `groupProtectBlocksAll(state, v)` (`js/simulation/autoreplace.js`) is shared by `autorenewVehicle` and
`isAutoreplaceEligible`, so the rule branch and mass-autoreplace eligibility agree in both modes. `replaceVehicle`
maps a train's `wagonModelId` through the same helper, so the E2 wagon-kind remap follows the group rule when the
opt-in is on and stays blocked when it is off. The A1 per-rule "when old" flag is unchanged: with the opt-in on a
protected group's young vehicle waits and an old one is replaced; with it off the group stays blocked regardless of
age.

**Files.** `js/simulation/settings.js` (default), `js/ui/settingsGroups.js` (one SETTING_META entry, Companies),
`js/simulation/autoreplace.js` (`groupProtectBlocksAll`, `autoreplaceTarget`), `js/simulation/autorenew.js` (the two
early guards now call the helper), `tests/f1ProtectOptIn.test.js`.

**Not changed.** No UI copy changes; the group "Protect from autoreplace" checkbox still stores the same
`replaceProtect` flag. No save-schema change: with the setting on, the flag's meaning changes, but existing saves
keep their flag and the default-off behaviour until the player turns the setting on.
