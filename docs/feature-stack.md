# Finance feature stack

The product destination is a local workflow from bank statement import to reviewed spending, actionable recurring-cost decisions, and tracked budgets and savings goals.

## Stack structure

Each pull request builds on the preceding layer. The numbered entries below describe stack positions, not GitHub pull request numbers.

| Layer                   | Scope                                                                                                                                         | Main review focus                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Baseline             | Repository cleanup, shared connection ownership, migrations, and executable checks                                                            | Preserve existing behavior and establish reliable verification               |
| 2. Imports and accounts | Currency-safe ledger reporting, accounts, preview/mapping, import history/undo, duplicate review, reconciliation, and matched transfers       | Preserve statement identity and cash movements without mixing currencies     |
| 3. Review and reporting | Monthly review inbox, bulk categorization/undo, effective split/refund spending, monthly overview, and category analytics                     | Make review reversible and make reports reflect reviewed allocations         |
| 4. Planning             | Actual and committed budgets, payday periods/rollover, savings goals, contribution history, and currency-safe suggestions/scenario comparison | Separate actual spending from commitments and hypothetical savings           |
| 5. Subscriptions        | Measured trends, price history, usage certainty, bill calendar, cancellation deadlines, and calendar export                                   | Show the evidence behind insights and retain recurrence/currency correctness |
| 6. Backup and export    | Complete JSON snapshots, validated same-schema restoration, pre-restore recovery, and transaction CSV export                                  | Preserve linked records and roll back invalid replacements atomically        |

## Original ranked features and delivered behavior

| Rank | Feature                                      | Delivered behavior                                                                                                                                             |
| ---- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Correct totals across currencies             | Currency filters/groups across financial reports and planning; unknown currencies remain explicit; formatting never supplies exchange-rate conversion          |
| 2    | Import preview, history, and undo            | Account/currency selection, column mapping, rejected-row review, selectable rows, duplicate decisions, batch history, and undo                                 |
| 3    | Subscription insights from history           | Completed-month linked-payment trends, price-edit history, payment changes, and separate unknown/stale usage                                                   |
| 4    | Accounts and matched transfers               | Account types, opening balances/dates, balance comparison, legacy record assignment, and reversible transfer matches                                           |
| 5    | Backup, restore, and export                  | Consistent full JSON backup, schema/checksum validation, transactional restore with a retained recovery copy, and original transaction CSV export              |
| 6    | Monthly review inbox                         | Uncategorized records, suggestions, subscription candidates, duplicate candidates, bulk categories, merchant rules, historical application, and supported undo |
| 7    | Budgets with actual and upcoming commitments | Linked bills already paid, unpaid scheduled commitments, variable spending, discretionary allowance, and an updated projection                                 |
| 8    | Savings goals                                | Target/deadline/currency CRUD, contribution history and corrections, progress, monthly requirements, capacity estimates, and subscription cancellation plans   |
| 9    | Monthly Home overview                        | Selected-month spending and categories, budget risks, upcoming bills, review counts, savings progress, latest imported date, and navigation into details       |
| 10   | Splits, refunds, and reimbursements          | Category allocations that preserve purchase totals and linked credits allocated back to the original purchase's categories                                     |
| 11   | Rollover and payday periods                  | Monthly payday anchors with short-month handling, no/positive/all rollover, period history, and retention of cycle settings when copying scenarios             |
| 12   | Bill calendar                                | Payment dates, cancellation notice deadlines, reminder lead times, and `.ics` export for calendar-delivered reminders                                          |

## Operating boundaries

Imports are manual and local. There is no bank synchronization, multi-user hosting, or authentication. The server binds to localhost and uses the configured SQLite file.

Currencies remain separate; no live or historical FX conversion is performed. Scenario comparisons also separate monthly and yearly allowances. Account assignment can explicitly give unknown-currency legacy records the selected account's currency; known currencies must match.

Rejected CSV rows remain unresolved until their source or mapping is corrected. A user may explicitly import valid rows while skipping errors, but this does not make the rejected rows part of the ledger. Keep the original statement available locally for follow-up. Duplicate suggestions and subscription candidates require review rather than being unquestionable facts.

Savings contributions and cancellation allocations are tracking/planning records. They do not move funds or cancel a subscription. Historical capacity and bill forecasts depend on imported coverage and correct transaction linking. Budget period history recalculates with current settings rather than retaining immutable closed-period snapshots.

Price history begins at the migrated baseline and records subsequent edits. Subscription trend comparisons use recorded linked payments; absent historical payments are unknown. Calendar exports are snapshots of current dates and prices, with reminders delivered by the receiving calendar application.

JSON restore accepts files up to 50 MB with the same schema fingerprint and migration history. It does not upgrade older backups. A pre-restore copy is saved before replacement; foreign-key and integrity failures roll back the data transaction. Full JSON preserves all finance tables; CSV exports original transaction rows and does not replace a complete backup. Browser appearance preferences are device-local.

## Verification approach

Run the checks described in the README after integrating the complete stack. Domain and API regressions cover import identity/undo, currency isolation, split/refund allocation, payday and rollover boundaries, actual versus committed bills, goal records, subscription histories, calendar recurrence, and backup rollback/recovery. Browser checks exercise the connected user workflows in a disposable database.

The user-provided statement is a private local test input. It is not committed to the repository, included in public fixtures, or imported into the live database as part of development verification. Any unresolved rejected rows must be reported separately from successfully imported rows.

Final integrated test counts, browser results, and pull request links belong in the final verification report and PR descriptions; this document does not claim a completed final run.
