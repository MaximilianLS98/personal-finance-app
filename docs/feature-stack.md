# Finance feature stack

Destination: complete the twelve ranked product improvements with local data ownership,
reviewable stacked PRs, and automated plus browser validation.

1. Preserve the existing verified refactor as the stack base.
2. Ledger foundation: currency-safe reporting, accounts, import preview/history/undo,
   column mapping, occurrence-aware duplicate review, balances and matched transfers.
3. Data ownership: validated backup/restore and portable exports.
4. Subscriptions: measured trends, price history, usage certainty, bill calendar and reminders.
5. Planning: committed budget spending, rollover/payday periods and savings goals.
6. Review: monthly inbox, bulk categorization/undo, split purchases/refunds,
   monthly home overview and category analytics.

Each layer must pass relevant domain/API tests and type/lint checks before publication.
The final stack receives the complete check suite, production build, and browser checks.
The user-provided bank statement is used only in a disposable local database, never committed.

Implementation decisions: per-currency reporting rather than live exchange-rate services;
local calendar export for reminders while the app is closed; no bank synchronization or
multi-user hosting. Estimated investment scenarios retain their stated assumptions.

## Verification log

Work in progress.
