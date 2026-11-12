# E1: nested groups and per-vehicle-type groups (both opt-in/lazy)

Source: `scratchpad/research/groups-scope-spec.md` §(a), §(b); OpenTTD `group.h:76-88`,
`group_cmd.cpp:286-300` (GetParentLivery), `:351-373` (CmdCreateGroup parent), `:425-436` (delete
re-link), `:452-492` (CmdAlterGroup reparent + cycle check), `:586`/`:632` (type check on
add-vehicle).

## What

### (a) Nested groups — always available, lazy field

- `group.parentId` is written only when a group is nested; **absent = top level**, exactly like
  today. Existing/flat games save byte-identically.
- `createGroup(ctx, name, { parentId })` (cmdGroup.js) validates the parent and stores the id.
- New `alterGroupParent(ctx, id, parentId)` (exposed as `game.alterGroupParent`): reparent,
  `parentId = null` moves back to top level. Rejects an unknown parent, the group itself and a
  cycle (walk up the chain, max depth = group count). Bumps `company.groupColourRev` on a real
  change (the existing renderer cache invalidation used by `setGroupColour`).
- `deleteGroup`: children are re-linked to the deleted group's parent (`parentId` removed when the
  deleted group was top level) — OpenTTD group_cmd delete behaviour.
- Livery inheritance: `renderer/groupLivery.js` `effectiveGroupColour` walks `parentId` only when
  `g.colour` is absent; `groupColourMap` is unchanged for groups without a parent. A group with
  its own colour wins over its parent.
- UI (`js/ui/windows/vehicleList.js`): group filter options are indented by depth, the group-by
  "Group" buckets too, and a "Parent" selector (self and descendants excluded) calls
  `alterGroupParent`. `groupDepth` / `isGroupDescendant` are exported pure helpers.

### (b) Per-vehicle-type groups — behind `strictGroupKind`, default OFF

- `group.kind` (`'train' | 'road' | 'aircraft' | 'ship'`; 'road' covers bus/truck/tram) is lazy.
  It is written **only while `strictGroupKind` is on**; when off, `opts.kind` is ignored and mixed
  groups behave exactly as today.
- Setting on: `createGroup` validates `opts.kind` (or inherits the parent's kind), a typed group
  rejects a vehicle of another kind in `addVehicleToGroup`/`addSharedVehiclesToGroup`, and an
  untyped group takes the kind of the first vehicle added to it. `alterGroupParent` refuses a
  parent of another kind. Turning the setting off restores mixed groups (kind is not enforced).
- UI: "New group…" takes the current kind filter as the kind; the vehicle window's group dropdown
  lists only groups of the vehicle's kind (mixed legacy groups stay listed).

## Default and save impact

- `strictGroupKind: false` in `DEFAULT_SETTINGS`, exactly one `SETTING_META` row (group
  `companies`, type `check`).
- No new save revision: both fields are additive and lazy. A flat game with the setting off has
  no `parentId`, no `kind` and no new state field, so world hash and saves are unchanged.
- Performance when off: `groupColourMap` keeps the same one-pass build; `effectiveGroupColour`
  only runs for a group that has a `parentId`. No per-tick cost.

## Evidence

- `bun run check`: OK: 828 files.
- `bun tools/world-hash.js`: (see report; expected `seed 1 days 60 hash e66b684174510b6b chars 919564`).
- `timeout 110 bun tools/simulate-city.js --years 1 | grep -c MATCH`: 1.
- `bun test tests/e1Groups.test.js`: 19 pass / 0 fail; existing group tests
  (vehicleGroups, groupColour, groupFlag, w3Groups, vehicleGroupRows, settingsGroups): 44 pass.

## Not done

- (c) per-group autoreplace rules and (e) wagon removal/length model were out of scope.
- No fold/collapse tree in the vehicle list (indentation + parent selector only); the group-by
  rows are indented but not collapsible.
- No separate kind picker for a new group: it follows the kind filter (or the parent). A mixed
  legacy group can stay mixed while the setting is on.
- Autoreplace still looks at the vehicle's own group only (OpenTTD behaviour); it does not walk
  parents.
