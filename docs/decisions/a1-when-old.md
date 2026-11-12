# A1: per-rule "replace when old" autoreplace option

**What.** Each autoreplace rule (model A -> model B, `company.autoreplace`) gets an opt-in flag "when old".
When ON, a vehicle of model A matched by the rule is replaced in a depot only once it is old, not at any age.
OpenTTD reference: `autoreplace.cpp:80-86` and `autoreplace_cmd.cpp:296` (`replace_when_old` per rule).

**Default.** Flag absent = OFF = today's behaviour (rule replaces immediately, any age). Byte-identical for existing
saves and default games: the key is never written unless the flag is set (`company.autoreplaceWhenOld`, a lazy map
`{ [oldModelId]: true }`, deleted when empty; clearing the rule also clears the flag).

**"Old" condition.** `isVehicleOld` (`js/simulation/vehicles.js`): `age > effectiveMaxAge(state, v)`. This is the
condition TT already uses to mark a vehicle old (`vehicles.js` ~line 219-221). Autorenew's own check
(`autorenew.js`, `age > effectiveMaxAge + renewDelay`) is unchanged.

**Same-model case.** TT has no same-model rule: `setAutoreplace` rejects `to == from` (`autoreplace.js`), and
`autorenewVehicle` skips `target === modelId`. So nothing new is needed; the same-model "always when old" behaviour is
already covered by autorenew (when enabled).

**Code.**
- `js/simulation/autoreplace.js`: `setAutoreplaceWhenOld`, `isReplaceWhenOld`, lazy-map helpers; clearing a rule clears its flag.
- `js/simulation/autorenew.js`: `autorenewVehicle` skips the rule branch for a when-old rule unless the vehicle is old
  (falls through to autorenew); `isAutoreplaceEligible` (mass autoreplace, depot UI) uses the same test.
- `js/simulation/game.js`: `game.setAutoreplaceWhenOld(oldModelId, on, opts)`; `js/ui/app.js` ISSUE_COMMANDS lists it.
- `js/ui/windows/autoreplace.js`: a "when old" checkbox next to each rule's select (enabled only when a rule is set).
- No new global setting (no `DEFAULT_SETTINGS` entry).

**Tests.** `tests/a1WhenOld.test.js` (default immediate; flag on: young not replaced, old replaced; flag off removes key;
clear rule clears flag; unknown model rejected; save round-trip keeps flag; default save has no `autoreplaceWhenOld`).
Existing `tests/autoreplace.test.js`, `tests/serviceReplace.test.js`, `tests/vehicleGroups.test.js` still pass.
