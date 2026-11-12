# E2: per-group autoreplace rules and wagon-kind rules (opt-in)

**What.**
1. **Per-group autoreplace rules.** A vehicle group can carry its own model-A -> model-B rules. For a vehicle in that
   group the group rule for its model wins over the company rule; otherwise the company rule applies exactly as before.
   Stored lazily as `company.groupAutoreplace = { [groupId]: { [oldModelId]: newModelId } }` (absent until the first
   group rule is set, and removed again when the last one is cleared). OpenTTD reference: `autoreplace.cpp:55-86`
   (`EngineReplacement` takes the vehicle's group first, then `ALL_GROUP`) and `autoreplace_gui.cpp` (one window per
   group).
2. **Wagon-kind rules.** `setAutoreplace` and the group setter now accept `kind: 'wagon'` old/new models, so a train's
   plain wagon model can be replaced as well. In `replaceVehicle` (`autorenew.js`) a train's `wagonModelId` is mapped
   through the applicable group/company rule when one is set, keeping the wagon count unchanged. No wagon removal, no
   length model (`renewKeepLength`) - explicitly out of scope by user decision.

**Default preservation.** Both maps are lazy. With no group rule and no wagon rule:
- `autoreplaceTarget` falls through to the same `company.autoreplace[modelId]` lookup `autorenew.js` used before;
- `replaceVehicle` uses `v.wagonModelId` unchanged;
- no key is written by creating a game, loading a save, grouping vehicles, autorenew or a protected group.
The world-hash gate (`seed 1 days 60 hash e66b684174510b6b chars 919564`) is unchanged.

**Lookup order (current TT protect semantics kept).** `autoreplaceTarget(state, v, modelId)`:
1. if `v.groupId` is set and that group has `replaceProtect`, return no rule (protect blocks everything, as today);
2. else if `company.groupAutoreplace[v.groupId]` has an entry for `modelId`, return it;
3. else return `company.autoreplace[modelId]`.
`autorenewVehicle` and `isAutoreplaceEligible` both use this helper, so the rule branch and the mass-autoreplace
eligibility agree. A group rule for an old model still observes the A1 per-rule "when old" flag
(`company.autoreplaceWhenOld`, keyed by old model); a young vehicle is skipped and falls through to autorenew.

**Protect decision (USER-DECISION, not changed).** OpenTTD lets a protected group use its own group rule and only
blocks the company-wide rule. TT currently blocks every rule (and autorenew) for a protected group. Per the user
decision, that behaviour is kept as-is in this task; the group lookup is inside the same protection check. Fixing it
would change default behaviour for any existing protected group and needs a separate yes/no.

**Wagon rules in detail.** Setters share the company-rule validation, extended to wagons with the same cargo-sharing
requirement already used for buses/trucks (a Hopper cannot become a Coach). `replacementCandidates` offers
cargo-compatible wagons too. On replacement the wagon count (`v.wagons`) and `cargoId` are unchanged; only
`wagonModelId` moves through the rule. Mixed consists (`v.consist`) are left alone (the task scopes the mapping to
`v.wagonModelId`; no length/consist model was added). `setAutoreplaceWhenOld` also accepts wagon models so a wagon
remap can wait until the train is old; with no flag it is immediate, as before.

**Code.**
- `js/simulation/autoreplace.js`: wagon allowed in `replacementCandidates` / `setAutoreplace` /
  `setAutoreplaceWhenOld`; shared `validateRule`; new `setGroupAutoreplace`, `clearGroupAutoreplace`,
  `autoreplaceTarget`.
- `js/simulation/autorenew.js`: `autoreplaceTarget` in `autorenewVehicle` and `isAutoreplaceEligible`;
  `wagonModelId` remap in `replaceVehicle`.
- `js/simulation/cmdGroup.js`: `deleteGroup` drops the deleted group's lazy rules.
- `js/simulation/game.js`: `setGroupAutoreplace(groupId, oldModelId, newModelId, opts)`,
  `clearGroupAutoreplace(groupId, oldModelId=null, opts)`; `js/ui/app.js` ISSUE_COMMANDS lists both.
- `js/ui/windows/autoreplace.js`: a "Rules for: Company / group" selector; the same table then edits the chosen
  scope's rules (Stop clears only that scope's rule). Company scope is the old view unchanged; companies without
  group rules see no difference until they pick a group.
- No `DEFAULT_SETTINGS` entry and no new setting.

**Tests.** `tests/e2Autoreplace.test.js`: no default keys and unchanged company lookup; group rule overrides company
for its group only; fallback to company rule inside a group; lazy set/clear validation; empty-map cleanup; group delete
cleanup; group rule with A1 when-old; protected group keeps current TT semantics; save round-trip; wagon candidates,
wagon remap with count/cargo kept, per-group wagon rule, and no wagon rule = unchanged. Existing
`tests/autoreplace.test.js`, `tests/a1WhenOld.test.js`, `tests/groupFlag.test.js`, `tests/neverExpire.test.js`,
`tests/serviceReplace.test.js`, `tests/vehicleGroups.test.js` pass.

**Not built.** Wagon removal / `renewKeepLength` / any length model (user decision). The OpenTTD protect semantics
change (blocked, see above). Per-group `whenOld` flag (A1 remains one company map keyed by old model, which group
rules observe). Mixed-consist wagon remap.
