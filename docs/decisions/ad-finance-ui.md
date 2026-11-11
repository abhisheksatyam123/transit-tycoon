# Finance window display fixes (ad-finui)

UI only. No simulation value, command rule or world hash changes (world hash e66b684174510b6b).

## Changes (js/ui/windows/finances.js)

1. **Interest label is live** (was hardcoded `'5%'`).
   - `js/ui/windows/finances.js:14` new export `interestLabel(state)` returns `${getSetting(state,'loanInterestRate')}%`.
   - Window refresh (`:62`) now calls `interestLabel(app.game.state)`.
   - Default display unchanged: `loanInterestRate` defaults to 5, so the label reads `5%`.
2. **Own value row** (OpenTTD company_gui.cpp ~371-379).
   - New export `ownValue(company)` (`:19`) = `money - loan`.
   - Row added to the kv grid after `Loan` (`:42`) and set in refresh (`:60`).
   - Adds one row to the window; no other row changes.
3. **Max borrow / Max repay buttons** (OpenTTD misc_cmd.cpp ~42-80), placed after the existing step buttons (`:46-47`).
   - `maxBorrowAmount(company)` (`:24`): `(maxLoan - loan)` floored to LOAN_STEP multiples, never negative.
   - `maxRepayAmount(company)` (`:29`): whole loan if `money >= loan`, else `money` floored to LOAN_STEP.
   - Buttons call `app.exec(app.game.borrow(...))` / `app.game.repay(...)`, the same path as the step buttons. No direct state writes from the UI.
   - Import of `getSetting` added at `:8`.

## Tests
`tests/adFinUi.test.js`: interest label (default 5%, setting 7% -> 7%), own value equals money minus loan, max borrow reaches maxLoan with only loan/money changed, max repay clears the loan with enough cash, partial repay with short cash.
Mutation check (scratch copy): hardcoding 5%, own value = money, max borrow = 0, max repay = 0 each fail 1-2 tests.

## Default display
Unchanged except the added "Own value" row and two buttons. Interest still reads 5%.

## Left out
- Max loan with `inflationAdjustsMaxLoan` on: "Max borrow" uses `company.maxLoan` (the value the window shows as "Max loan"). If the inflation-adjusted cap is lower, `borrow()` rejects and the toast shows the error. Not changed.
- AI rival company value (aiCompanies.js) is not touched; "Own value" is money minus loan only, per the request (no fleet term).
- No DOM-level test of the window; the helpers are tested as pure functions, and the buttons only forward their results.
- Max repay with short cash does not raise an error for a zero result; `repay(0)` returns the existing "Invalid amount" / "Not enough money" toast.
