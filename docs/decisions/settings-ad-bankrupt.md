# Bankruptcy opt-in rules (ad-bankrupt)

Three default-preserving settings in the Economy group (`js/simulation/settings.js`, UI in `js/ui/settingsGroups.js`).
Each default is `false`, which reproduces the current Transit Tycoon behaviour exactly. The OpenTTD behaviour is what
turning the setting on gives. No extra RNG is drawn on the default path, and the world hash is unchanged (e66b684174510b6b).

## 1. `bankruptcyNegativeLoanRule`
- OpenTTD: `/home/abhi/project/city_sim/scratchpad/openttd/src/economy.cpp:557`
  `if (c->money - c->current_loan >= -c->GetMaxLoan())` -> the company is not bankrupt.
- TT default (false): `js/simulation/loco/companyManager.js` `updateMonthly1`: any `money < 0` counts as trouble.
- On: trouble only when `money - loan < -maxLoan` (`maxLoanCap` in `js/simulation/economy.js`, same cap `borrow()` uses).
- Limits: checked once a month like the TT counter (9 months -> bankrupt). The 3/6-month warnings follow the new test too.

## 2. `bankruptcySinglePlayerContinue`
- OpenTTD: `economy.cpp:600-612`: for the local company outside networking, `bankrupt_asked` is set and the
  company is left playing ("leave the company playing").
- TT default (false): `declareBankrupt` sets `c.bankrupt`, which opens the game-over window and records the game end (`js/ui/bankruptcy.js`).
- On: `declareBankrupt` posts a news item ("is bankrupt, but the game goes on (single-player rule)") and returns. The company
  is not flagged bankrupt, no game over, and its vehicles keep running. The objective is not failed.
- Limits: the debt counter keeps growing and there is no further warning. Only the player company is affected (AI rivals use `aiCompanies.js`).

## 3. `negativeCashInterest`
- OpenTTD: `economy.cpp:818-826`: the yearly fee adds `-available_money * interest_rate / 100` when money is negative.
  OpenTTD charges it through a monthly split of the yearly fee.
- TT default (false): interest on the loan only, `monthlyLoanInterest` (`js/simulation/economy.js`), charged in `updateMonthly1`.
- On: after the loan interest, `updateMonthly1` also charges `trunc(-money * loanInterestRate / 1200)` while money is negative
  (same rate as the loan, OpenLoco units; skipped under infinite money, as in OpenTTD).
- Deviation: the task asked for "the yearly update". TT charges loan interest monthly (`loanInterestRate / 1200`), so the
  negative-cash charge is monthly too. Over a year it equals the OpenTTD yearly fee on the negative balance.

## Tests
`tests/adBankrupt.test.js` (12 tests): defaults and one `SETTING_META` entry each, rule off/on,
single-player continue off/on, negative interest off (0) / on (41 = trunc(10000*5/1200)) / positive cash (0).
With the gate forced off in a scratch copy, 4 "on" tests fail (`scratchpad/tmp/gateoff`). The "rule on, money - loan below -maxLoan"
test passes either way because the default also goes bankrupt there.
