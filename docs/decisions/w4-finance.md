# W4: finance window vs OpenTTD (display rows)

Scope: `js/ui/windows/finances.js`, `tests/w4Finance.test.js`. UI only; no sim, balance or money change.

## Row-by-row comparison

OpenTTD source: `scratchpad/openttd/src/company_gui.cpp`. TT: `js/ui/windows/finances.js`.

| OpenTTD row / control | OpenTTD evidence | TT | Status |
|---|---|---|---|
| Own Funds (money - loan) | company_gui.cpp:316, 377-379 | "Own value" (finances.js `ownValue`) | present (label differs, kept) |
| Loan | company_gui.cpp:317, 374 | "Loan" | present |
| Bank Balance | company_gui.cpp:318, 369 | "Bank balance" | present |
| Loan Interest: N% | company_gui.cpp:328, 382-383 | "Interest (yearly)" via `interestLabel` (live setting) | present |
| Maximum Loan | company_gui.cpp:329, 386 (`GetMaxLoan()`) | "Max loan" = `company.maxLoan` | present; see finding 1 |
| Borrow / Repay buttons | company_gui.cpp:336-337 | Borrow / Repay (+ Max borrow / Max repay) | present |
| Infrastructure button | company_gui.cpp:338, 522-523 | was only in Companies window | **added** (opens `companyInfrastructure`) |
| Revenue list (Trains / Road / Aircraft / Ships) | company_gui.cpp:116, 60-65 | single "Income" row | per-vehicle-type split skipped (see below) |
| Operating expenses list (run per type, Property, Loan interest) | company_gui.cpp:117, 74-80 | "Running costs", "Loan interest", "Property upkeep", "Infrastructure maintenance" rows | per-type rows present; see skipped |
| Capital expenses list (Construction, New vehicles, Other) | company_gui.cpp:118, 83-87 | "Construction", "New vehicles" rows | present (no "Other" row; see skipped) |
| Category totals (Revenue, Operating, Capital) | company_gui.cpp:203 (`STR_FINANCES_TOTAL_CAPTION` per category) | none | **added** as "Total revenue / operating expenses / capital expenses" rows |
| Profit | company_gui.cpp:212 | "Net" row (ledger income - expenses) | present |
| Per-period columns | company_gui.cpp:444, 532: `c->yearly_expenses[...]`, 3 columns, Year (or Period in wallclock mode) | 11 past months + "This month" (`ledger.history`, 36 kept) | granularity differs, kept (see quarterly question) |

Infrastructure maintenance: OpenTTD charges it as `ExpensesType::Property` (economy.cpp:650-668), so it belongs to the operating subtotal. TT keeps its own "Infrastructure maintenance" row (type `infrastructure`) and counts it in the operating subtotal for the same reason.

## What was added

1. **Category subtotals** (`categoryTotals(byType)`, exported, pure): three extra rows after the per-type rows and before "Net":
   - Total revenue = `income`
   - Total operating expenses = `running + interest + property + infrastructure`
   - Total capital expenses = `construction + vehicles`
   Signs follow the table (income positive, expenses negative). Zero shows "—" as the other rows do. These are computed from the existing `ledger.history` / `ledger.current` byType, so no new tracking.
2. **Infrastructure button** in the Finances button row. It opens the existing read-only Company infrastructure window (`openCompanyInfrastructure(app)`). Same as OpenTTD company_gui.cpp:338.

Default games: the existing rows keep their values and order. The three subtotal rows are new. No money number changes.

## Quarterly question

- OpenTTD's Finances window does not show quarters. Its columns come from `yearly_expenses` (company_gui.cpp:444, 532). The window shows the last 3 economic years, or periods when wallclock units are used.
- OpenTTD does keep quarterly history (`old_economy`, MAX_HISTORY_QUARTERS = 24, company_type.h:36; economy.cpp:677-681). That feeds the graphs, not this window.
- TT's ledger is monthly (`closeLedgerMonth`, economy.js:136-148; 36 months kept). TT has no quarterly ledger and no per-year breakdown.
- **Skipped:** a quarterly or yearly column set. It would need new history tracking (sim change), which is out of scope. The window keeps its monthly columns.

## Skipped rows and reasons

- **Per-vehicle-type revenue and running costs** (Trains / Road Vehicles / Aircraft / Ships). TT's `earn`/`spend` record only `income` and `running`, with no vehicle-type key. Needs new tracking (sim change). Reported only.
- **Capital "Other" row** (OpenTTD ExpensesType::Other: tree/industry/misc costs). TT has no `other` ledger type; those costs are not recorded separately. Reported only.
- **Quarterly / yearly columns**: see above.

## Findings for the lead (not changed)

1. **Max loan row ignores `inflationAdjustsMaxLoan`.** The row shows `company.maxLoan`. `borrow()` (economy.js:70) and `maxLoanCap()` (economy.js:58) use `effectiveMaxLoan` when the setting is on. The setting defaults to off, so default games are unaffected. Fixing the row (and "Max borrow", which also uses `company.maxLoan`, finances.js `maxBorrowAmount`) changes what the Max borrow button borrows when the setting is on. That is a behaviour change, so it was left for the lead to decide.
2. **Label "Own value"** vs OpenTTD "Own Funds". Kept (existing row, text unchanged).
3. **Pre-existing ledger sign issue**: `earn(..., 'property')` (property sale) and `earn(..., 'vehicles')` add to `byType` as positive, the same as spends, so the per-type rows and the category subtotals can differ from `Net` in those edge cases. Not changed (ledger is out of scope).

## Verification

- `bun test tests/w4Finance.test.js tests/adFinUi.test.js tests/adBankrupt.test.js tests/loanInterestRate.test.js tests/loanAutopay.test.js` → 39 pass, 0 fail.
- `bun run check` → OK: 810 files.
- `bun tools/world-hash.js` → `seed 1 days 60 hash e66b684174510b6b`.
- `timeout 110 bun tools/simulate-city.js --years 1 | grep -c MATCH` → 1.
