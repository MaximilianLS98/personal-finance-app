# Personal Finance

A single-user local finance app for importing bank statements, reviewing spending, managing recurring bills, and planning budgets and savings. The workflow is **import → review → understand → decide → track progress**. Norwegian bank CSV statements and mapped transaction exports are supported.

## What you can do

- **Statements:** preview a CSV before saving, choose an account and currency, map columns, inspect rejected rows, select transactions, and review suspected duplicates. Import history records each batch and supports undo.
- **Accounts:** track bank and credit-card accounts with an opening balance and date, compare the calculated balance with a statement balance, and match or unmatch transfers between accounts. Existing unassigned records can be explicitly assigned to an account.
- **Review:** work through a monthly inbox of uncategorized transactions, categorization suggestions, subscription candidates, and possible duplicates. Apply categories in bulk, create merchant rules for matching history, and undo supported review actions.
- **Transactions:** search and filter records, split purchases between categories, and link refunds or reimbursements to purchases. Category spending uses the allocations and linked refunds; account balances retain the original cash movements.
- **Home and categories:** inspect a selected month's income, spending, category breakdown, review workload, upcoming bills, budget risks, savings progress, and latest imported date. Follow links into the underlying workflows.
- **Subscriptions:** manage recurring payments, detect recent and historical candidates across imported history, inspect linked-payment trends and price history, distinguish unknown usage from an old recorded last-use date, and compare cancellation and investment scenarios. Historical candidates show their last payment and default to inactive history; missing recent charges do not prove cancellation. Review matching payments for existing subscriptions separately.
- **Bill calendar:** see forecast payments and cancellation deadlines, configure notice and reminder lead times, and export a calendar file with reminders.
- **Budgets:** set category allowances in a specific currency, separate money already spent from bills still due, and inspect the discretionary amount remaining. Configure payday periods, rollover, and period history; compare scenarios by currency and monthly/yearly period.
- **Savings goals:** create targets and deadlines, record and correct contributions, track progress, and estimate monthly requirements against historical capacity and other goals. Allocate a subscription's potential cancellation savings to one goal.
- **Settings and data ownership:** download a complete JSON backup, validate and restore a compatible backup, recover the pre-restore copy, or export transactions as CSV. Locale and appearance preferences stay in the browser.

## Currency and data boundaries

Reports keep currencies separate. **There is no exchange-rate conversion.** Changing a display preference does not convert recorded money; missing currencies remain an explicit unknown group. Imports require a deliberate currency/account choice. Assigning older unknown-currency transactions to an account explicitly adopts that account's currency, while known currencies must match.

There is no bank synchronization, authentication, multi-user support, or hosted account. Keep the app on localhost. Importing is a manual local workflow; a selected file is parsed by the local server and persisted in the configured SQLite database.

Rejected CSV rows are not silently imported. Resolve the source data or mapping and preview again, or explicitly choose to import the valid rows while skipping errors. Keep unresolved rows pending for review; the app does not invent dates, amounts, or descriptions to fill them in. Duplicate detection is a review aid: legitimate repeated purchases can be retained explicitly.

### Revolut statements

In **Statements**, preview the Revolut CSV, select the matching currency/account, and choose one product (Current, Savings, or Pocket) per account. Only completed movements are imported; other states appear as explicit exclusions. Nonzero fees require a choice about whether Amount already includes Fee, followed by a fresh preview. See [Revolut import details](docs/revolut-import.md) for timestamps, balance reconciliation, and duplicate handling.

## Run locally

Use **Bun** (validated with 1.3.9). The backend uses `bun:sqlite`, so Node alone cannot run the server.

```sh
bun install --frozen-lockfile
bun run dev
```

Open [localhost:3100](http://localhost:3100). Development and production servers bind to `127.0.0.1`, with port **3100** by default.

```sh
# Choose another port
PORT=3101 bun run dev

# Use disposable data, separate from your finance records
FINANCE_DATABASE_PATH=/tmp/personal-finance-demo.db bun run dev

# Production build and local server (stop dev first)
bun run build
bun run start
```

`FINANCE_DATABASE_PATH` defaults to `data/finance-tracker.db`. The directory is created automatically and migrations run on first database access. Database files, journals, generated files, and local environment settings are ignored by Git.

## Backup and recovery

Use **Settings → Backup and data export** to download a consistent JSON snapshot of every finance table, including linked records and history. CSV export contains the original transaction rows and is useful for external analysis; use JSON to preserve the full application state.

Restore accepts JSON backups up to 50 MB with the **same database schema and migration history**. It checks the format, checksum, columns, and schema fingerprint before presenting the contents for review. Confirming replacement saves the current state under the database directory's `backups/` folder, then replaces records in one transaction. Constraint or reference failures roll back the replacement. The latest pre-restore copy remains downloadable from Settings after reopening the app.

Backups from another schema version must be restored with the matching app version; automatic backup upgrades are not implemented. Browser appearance preferences are not included. If copying the SQLite file manually, stop the app first or use SQLite's backup facility while it is running.

## Interpreting estimates

- Subscription trends compare recorded linked payments in completed months. Missing history means insufficient evidence, not zero spending. Price history starts with the migrated baseline and subsequent edits; it cannot reconstruct unrecorded past prices.
- Calendar events forecast the current subscription schedule and prices. The `.ics` file is a snapshot, not a live calendar feed. Export again after changes; the calendar application delivers reminders when this app is closed.
- Budget forecasts use actual spending, linked subscription payments, unpaid scheduled bills, and variable spending pace. Incomplete imports or unlinked bill payments affect the estimate. Rollover history recalculates using current allowances and cycle settings.
- Goal contributions are records of money set aside; they do not transfer money between real accounts. Capacity estimates use the last three complete months and account for other goals in the same currency. Cancellation plans remain hypothetical until contributions are recorded.
- Investment projections depend on the selected assumptions and are not guaranteed returns.

## Checks

```sh
bun run check         # TypeScript, ESLint, Jest, real SQLite/API tests
bun run build         # Production compilation and prerender verification
bun run format:check  # Consistent source/document formatting
bun run format        # Apply formatting
bun run test:watch    # Jest watch mode
```

Jest runs browser components and pure domain tests in jsdom. `bun run test:db` runs database and API integration tests against isolated SQLite data; tests that exercise disk backups use temporary directories. Use synthetic statements for repeatable development checks. User-provided bank statements belong only in disposable local verification, never in commits or public test output. An import check is not authorization to populate the user's live database.

## Architecture

- `src/app/`: Next.js App Router pages, API handlers, and feature components.
- `src/components/`: application navigation and shared Radix/shadcn UI primitives.
- `src/lib/database/contracts.ts`: repository contract, re-exported at legacy import locations.
- `src/lib/database/repository.ts`: facade delegating to domain repositories.
- `src/lib/database/connection.ts`: Bun SQLite connection ownership and shared initialization/migration readiness.
- `src/lib/database/migrations/`: ordered schema changes, including accounts/imports, the effective transaction ledger, planning, and subscription history.
- `src/lib/`: CSV parsing, ledger/review services, money handling, subscriptions, projections, budget planning, backups, and query invalidation.
- `tests/database/`: persistence, migration, API, and lifecycle regressions.

Repositories borrow the manager's connection. `repository.close()` releases that repository's handle without closing another request's connection. Lifecycle owners close `SQLiteConnectionManager`. Reports use the effective transaction ledger where category splits and refunds must affect spending, while original transactions remain the account cash ledger.

The files under `.kiro/specs/` are design history, including broader proposals beyond the implemented scope. Savings goals are now implemented; authentication remains a future proposal. See [the feature stack](docs/feature-stack.md), [remaining work](TODO.md), and [the refactor plan](docs/refactor-plan.md).
