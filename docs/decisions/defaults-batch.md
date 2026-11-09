# Decision — Defaults batch: KEEP all six

Date: 2026-11-09 · Status: CLOSED-by-decision · Source: `scratchpad/tmp/E1_authority_defaults.md` §(b)

All six defaults below are kept unchanged. E1 §(b) details each row; this doc records the decision.

| # | Default | Current (file:line) | TT vs OL/OTTD ref | Decision |
|---|---|---|---|---|
| 1 | Service interval 0 (off for new vehicles) | `js/simulation/settings.js:45` `serviceIntervalDays: 0`; read at purchase `service.js:36-39` | OTTD default 0; OL has no global default. TT matches OTTD. | Keep 0 — on-by default would surprise and cost money day 1 |
| 2 | Loan interest 5 | `js/simulation/settings.js:17-18` `loanInterestRate: 5`; charged `economy.js:50-51` | OL editor default 10 (`EditorController.cpp:98`); TT comment: "5 here keeps existing games unchanged" | Keep 5 for existing saves; 10 only as a possible new-game default (settings are per-state, so a new-game default path is feasible) |
| 3 | Moscow objective 200M | `js/scenarios/index.js:10` `objective:{type:'companyValue',target:200000000,timeLimitYears:10}` | Scenario-authored; no generic TT/OL ref | Keep 200M — matches MOSCOW_MONEY=4M start (`moscow.js:26`) + loan headroom; no evidence unachievable (Moscow frozen) |
| 4 | Moscow currency: $ default | `currency.js:16` RUB exists (rate 80, ₽); default `$` (`currency.js:11,41`); Moscow does NOT auto-select RUB | Currency is user pref in OL/TT, not scenario | Keep `$`, no per-scenario auto-switch. Cosmetic only, zero sim/hash risk |
| 5 | Display prefs global | `a11yPrefs.js:1-11` (localStorage `tt.a11y`); minimap `tt.minimap` (`main.js:151-171`); NOT in save, sim never reads | OL display prefs are global | Keep global (localStorage). Per-save view prefs would diverge repros; moving into save = format change, high risk |
| 6 | Test budgets: map_graphs 250ms, traffic bench 1.5s | `scratchpad/e2e/w2/map_graphs.mjs:28` `f.med < 250`; `tests/traffic.test.js:74-80` 120 days on 96×96 <1500ms | Perf gates, no TT/OL ref | Keep both budgets; tightening invites flake, raising hides perf regressions (MAX PERFORMANCE priority) |

## Risk-of-change table (per E1)
| Default | Risk of changing | Notes |
|---|---|---|
| Service interval 0 | Low technical, high annoyance | Save-safe (purchase-time read) |
| Loan 5 → 10 | Medium-high | Changes money trajectory → world-hash & simulate MATCH break for any game with a loan. New-game-only note: settings already per-state, so new games *could* default 10 without touching existing saves — but default decision is keep 5 |
| Moscow objective 200M | Low technical, high product | Re-baselines goal; Moscow frozen |
| Currency $ | None (sim) | Cosmetic only; sim never reads currency |
| Display prefs global | High | Per-save = save-format change, breaks old saves & hash |
| Test budgets | Flake vs hidden-regression trade-off | Keep strict |

## Bottom line (E1 top recommendations)
Keep loan 5 (hash stability > editor fidelity); flag 10 as opt-in new-game idea only. No changes to service interval, Moscow objective/currency, per-save display prefs, or test budgets — all currently correct/safe.
