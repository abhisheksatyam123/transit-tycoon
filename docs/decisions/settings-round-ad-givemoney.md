# Round AC13: `localGiveMoney` — opt-in town donation

## OpenTTD rule (and a source caveat)

- `src/table/settings/economy_settings.ini:189` defines `economy.give_money` (`def = true`) — but that
  setting gates `CmdGiveMoney` (`src/company_cmd.cpp:1362`), a **company-to-company** gift, not a town action.
- The OpenTTD 16.x town action set is `src/town.h:297-308` (`AdvertiseSmall`, `AdvertiseMedium`,
  `AdvertiseLarge`, `RoadRebuild`, `BuildStatue`, `FundBuildings`, `BuyRights`, `Bribe`) with cost factors in
  `src/town_cmd.cpp:3448-3461` (`2, 4, 9, 35, 48, 53, 117, 175`). There is **no** `TownActionGiveMoney` in this
  tree, so TT's action is a documented extension, not a port. It reuses the bribe success rule
  (`src/town_cmd.cpp:3671` `TownActionBribe`, `+RATING_BRIBE_UP_STEP`, capped at `RATING_BRIBE_MAXIMUM`).

## TT rule

- Setting: `localGiveMoney`, **default `false`** (`js/simulation/settings.js:194`), metadata in the `economy`
  group (`js/ui/settingsGroups.js:91`).
- Off (default): the action is **hidden** — `actionList` omits `give_money` — and `doTownAction` refuses it
  with `Donating to the town is disabled in game settings` (`js/simulation/townAuthority.js:207`). The
  default action list is byte-for-byte the same as before.
- On: adds action id `give_money` ("Donate money to the town") after `statue` and before `bribe`
  (`js/simulation/townAuthority.js:190-191`). Cost is the usual town-action formula
  `constructionTotal(state, max(COSTS.giveMoney = 20000, round(population * 90)), 'property')`
  (`js/config/costs.js:63`). Effect: `+200` company rating clamped at `RATING_BRIBE_MAXIMUM` (800), exactly the
  bribe-success path, with **no RNG draw** and no chance of the town turning hostile. Disabled at the rating
  cap and for an unwanted town, like bribe.

## Limits

- One company in TT, so the donation has no competitive side effect; it is a repeatable money→rating sink until
  the 800 cap.
- No new save fields: it only writes the existing `town.companyRating`; no `state.settings` object is created by
  default, so day-0 state and the world hash (`e66b684174510b6b`) are unchanged.
