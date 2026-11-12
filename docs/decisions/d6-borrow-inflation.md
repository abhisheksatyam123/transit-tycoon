# D6 — Borrow respects the inflation-adjusted max loan

Status: DONE · Branch: d6-borrow · Builds on decision #52 (`max-loan-52.md`, unchanged)

## What changed
- `economy.js` `borrow()` now takes its cap from `maxLoanCap(state, company)`, the single helper that returns `effectiveMaxLoan(state)` when `inflationAdjustsMaxLoan` is on and `company.maxLoan` otherwise.
- Finances window (`ui/windows/finances.js`): "Max borrow" computes its amount from the same live cap (`maxBorrowAmount(company, cap)`; the one-arg form still defaults to `company.maxLoan`), and the "Max loan" row displays that cap. So the displayed max always matches what Borrow allows.
- AI rivals (`simulation/aiCompanies.js`): `manageLoan` now passes `state` to `borrow()`, so rival borrowing obeys the same cap.
- Bankruptcy check (`loco/companyManager.js`) already used `maxLoanCap`; unchanged.

## Default unchanged
- `inflationAdjustsMaxLoan` stays `false`. With it off, `maxLoanCap` returns `company.maxLoan`, exactly the previous behaviour; no world hash change (`e66b684174510b6b`).

## Save migration
- None. No stored data or format changes; old saves load and behave as before.

## Open note (not decided here)
- With the setting on, the cap is `effectiveMaxLoan` (the inflated `MAX_LOAN`), so a custom `company.maxLoan` (from New Game options) is ignored while the setting is on. Left as-is; a possible follow-up is inflating `company.maxLoan` instead.
