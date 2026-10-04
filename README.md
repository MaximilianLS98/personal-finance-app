# Personal Finance

A local personal finance dashboard for importing bank statements, organizing transactions, and understanding recurring spending. Norwegian bank CSV formats are supported alongside comma-separated transaction exports.

- **Home:** import CSV files, review parsing errors and duplicate records, and view income/expense totals.
- **Transactions and categories:** search, filter, edit, categorize, and apply reusable categorization rules. Transfers are excluded from income/expense totals.
- **Subscriptions:** manage recurring payments, detect candidates from transaction history, review upcoming payments, and compare long-term costs with investment projections.
- **Budgets:** create category budgets, compare scenarios, track actual spending, and generate threshold/subscription alerts.
- **Settings:** choose display currency, locale, and theme.

This is a single-user local app. There is no authentication or bank synchronization. Currency settings control display formatting; they do not convert currencies. Reports currently sum nominal transaction amounts, so mixed-currency imports require care. Investment projections are estimates based on the selected assumptions.

## Run locally

Use **Bun** (validated with 1.3.9). The backend uses `bun:sqlite`, so Node alone cannot run the server.

```sh
bun install --frozen-lockfile
bun run dev
```

Open [localhost:3100](http://localhost:3100). Development and production servers bind to `127.0.0.1`, with port **3100** by default so they can coexist with projects such as `home-brain` on port 3000.

```sh
# Choose another port if 3100 is occupied
PORT=3101 bun run dev

# Run with disposable data, separate from your finance records
FINANCE_DATABASE_PATH=/tmp/personal-finance-demo.db bun run dev

# Production build and local server (stop dev first)
bun run build
bun run start
```

`FINANCE_DATABASE_PATH` defaults to `data/finance-tracker.db`. The directory is created automatically. Schema migrations run on first database access. The database, journals, generated files, and local environment settings are ignored by Git. Stop the app before copying the database for a backup, or use SQLite's backup facility when it is running.

## Checks

```sh
bun run check         # TypeScript, ESLint, Jest, real SQLite/API tests
bun run build         # Production compilation and prerender verification
bun run format:check  # Consistent source/document formatting
bun run format        # Apply formatting
bun run test:watch    # Jest watch mode
```

Jest runs browser components and pure domain tests in jsdom. `bun run test:db` runs database and API integration tests with real SQLite, Request, and File implementations. Each database test uses isolated in-memory data. The files in `test-data/` are not used by automated or manual smoke tests; use synthetic CSV records for development.

## Architecture

- `src/app/`: Next.js App Router pages and API handlers; components for reports, imports, and subscription workflows.
- `src/components/`: application navigation and shared Radix/shadcn UI primitives.
- `src/lib/database/contracts.ts`: the repository contract, re-exported at legacy import locations.
- `src/lib/database/repository.ts`: compatibility facade delegating to domain repositories under `repositories/`.
- `src/lib/database/connection.ts`: typed Bun SQLite connection ownership and shared initialization/migration readiness.
- `src/lib/database/migrations/`: ordered schema history. Add migrations for schema changes rather than rewriting an existing database.
- `src/lib/`: CSV parsing, categorization, subscription detection, projections, budget services, API helpers, and React Query hooks.
- `src/lib/query-keys.ts`: query keys and shared invalidation for changes affecting multiple financial views.
- `tests/database/`: persistence, migration, API, and connection-lifecycle regressions.

Repositories borrow the manager's connection. `repository.close()` releases that repository's handle; it never closes other requests' connection. Tests or explicit lifecycle owners close `SQLiteConnectionManager`. Initialization and migrations are awaited before a repository can be used. Migration 008 expands budget alert types without discarding existing alerts; it deliberately refuses a lossy downgrade.

The files under `.kiro/specs/` are design history. Authentication and piggybanks described there are not implemented. See [the review and refactor plan](docs/refactor-plan.md) for the cleanup scope and verification record.
