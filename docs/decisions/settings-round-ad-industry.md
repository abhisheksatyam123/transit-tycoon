# Round AD: industry abandonment and last-instance protection (default-preserving)

Branch `ac-townind` (worktree wtAC5), based on main `213ee98`. Source: OpenTTD `src/industry_cmd.cpp`.

| TT key | OpenTTD default | TT default (preserved) | Rule (when true) | Code changed (file:line) | Limits |
|---|---|---|---|---|---|
| `industryAbandonment` | always on (no setting): PROCESSING_INDUSTRY_ABANDONMENT_YEARS = 5, `Chance16(1,180)` (industry_cmd.cpp:3004-3007) | `false` (no abandonment, as today) | A secondary (processing) industry whose last production year is at least 5 years back closes with chance 1/180 per month. Primary industries are never affected. Draws RNG only when on and the industry is idle that long. | `js/simulation/loco/industry.js:229` (`ABANDONMENT_YEARS`), `:237` (`isMonthlyAbandonment`), `:306` (records `ind.lastProductionYear` in months with production, only while on), `:332` (closure check). `js/simulation/settings.js:209`. `js/ui/settingsGroups.js:37`. | Last production year is tracked only while the setting is on. Enabling it mid-game starts the clock from `foundingYear` (or from the first producing month after enabling), not from OpenTTD's always-on `last_prod_year`. Chance uses the 16-bit RNG as `rng.int(0,0xffff) < 364` (about 1/180). |
| `protectLastIndustry` | the rule is an industry behaviour flag (`CanCloseLastInstance`, default off), not a game setting: the last instance of a type cannot close (industry_cmd.cpp:2758-2766) | `false` (last instance may close, as today) | When on, closure of an industry whose type has at most one instance on the map is refused. Applies to the random/obsolete closure, the abandonment closure and the smooth-economy closure. | `js/simulation/loco/industry.js:249` (`closureProtected`), `:313` (smooth closure), `:332` (random closure). `js/simulation/settings.js:211`. `js/ui/settingsGroups.js:39`. | Counts every industry of the type, including ones already closing (as OpenTTD's GetIndustryTypeCount does). With two instances, both may close. Oil wells' special case in OpenTTD is not modelled (TT has no such flag). |

## Defaults

Both keys default to `false`. With both off, the code path draws no extra RNG and changes no state
(`lastProductionYear` is only written when `industryAbandonment` is on), so the world hash `e66b684174510b6b` and
`simulate-city` output are unchanged.

## Tests

`tests/roundACIndustry.test.js` (9 tests, each well under 2 s):
- defaults are false; each key has exactly one `economy` SETTING_META entry.
- abandonment default: an idle sawmill (secondary, idle 6 years) is not closed after 2000 monthly updates with the real seeded RNG.
- abandonment on: the same sawmill closes within 2000 months with seed 7 (fixed RNG sequence, deterministic).
- abandonment on, primary (forest) never abandoned; a production month resets the idle clock.
- protection default: a forced closure draw closes the last sawmill.
- protection on: a forced closure draw does not close the last sawmill (50 months); with two instances both may close.

"Forced" closure uses a stub RNG whose `int(lo)` returns `lo`, so every Chance draw succeeds without depending on luck.

Gate check: with `industryAbandonment` forced off in a scratch copy, the abandonment-on test fails; with
`protectLastIndustry` forced off, both protection-on tests fail. Removing the gate from the default test's
path would make the 2000-month default test close the sawmill (probability about 1 - (179/180)^2000 ≈ 0.99998), so it fails too (reasoned, not run).
