# Codebase review and refactor plan

## Purpose and scope

Max Personal Finance imports Norwegian bank CSV statements into a local SQLite database. Transactions feed category rules, income/expense reports, recurring subscription detection and projections, and budget scenarios/alerts. The runtime is Bun, with Next.js App Router, React Query, Zustand, shadcn/Radix controls, and Recharts. Authentication and piggybanks are design documents, not implemented features.

Preserve current routes, financial records, migration history, and supported workflows. This is a maintainability and correctness refactor, not a dependency upgrade or a new product redesign. Use synthetic records in a separate database for manual verification.

## Baseline findings

- 133 TypeScript diagnostics; production builds explicitly ignore type and lint errors.
- 97 ESLint errors and 100 warnings in source files (excluding macOS metadata).
- Jest cannot execute any tests: `bun:sqlite` is unresolved and AppleDouble files are collected as test suites.
- The 3,570-line repository combines transactions, categories, subscriptions, budgets, scenarios, and alerts. Multiple incompatible interfaces describe the same repository.
- Every request may close a process-wide SQLite connection while other requests still use it. Initialization/migrations have no shared readiness promise.
- Scenario update/delete and alert read/update/delete are stubs; a separate unused extension file duplicates budget code.
- Production routes include test response shims and an obsolete in-memory summary store.
- Query invalidation is duplicated/incomplete; JSON date transport and API response types are inconsistent.
- Navigation includes fictitious companies/users and dead links. The README is the Next.js starter template.

## Implementation sequence

1. **Verification foundation:** repair scripts/configuration; separate actual SQLite integration tests from DOM tests; ignore generated metadata; restore strict checks without hiding failures.
2. **Persistence boundaries:** domain repositories behind a compatible facade, one repository contract, typed SQLite handles, concurrency-safe initialization and explicit connection ownership. Keep existing migrations/data readable.
3. **Correctness and shared logic:** complete existing scenario/alert operations; remove obsolete implementations; harden shared API helpers and cache invalidation; consolidate recurring financial calculations where duplication exists.
4. **UI and housekeeping:** remove starter navigation/dead assets, fix discovered form and hydration issues, remove unused imports and misleading comments, document architecture and supported development commands.
5. **Acceptance:** typecheck, lint, domain/UI tests, real SQLite regression tests, production build, and local browser/API smoke checks for imports, transactions, categories, subscriptions, budgets, scenarios, settings, and responsive navigation.

## Verification principles

- Regression tests must exercise behavior: persisted CRUD, duplicate imports, migration idempotence, simultaneous repositories, calculations, errors, and relevant user flows.
- Retire fake SQL interpreters in favor of the actual Bun SQLite driver where feasible. Do not alter production behavior to satisfy obsolete test assumptions.
- Do not read or import the personal bank statements in `test-data` for UI testing.
- Record final checks and any known limitations here after implementation.

## Confirmed execution baseline (2026-10-04)

Existing uncommitted tooling changes are retained. Current Jest baseline: 14 failed suites, 4 passed; 53 failed tests, 132 passed. ESLint: 99 errors, 101 warnings. Port 3000 is occupied; use 3100 with an explicit `PORT` override and `FINANCE_DATABASE_PATH` for isolated verification. Additional findings: unsupported budget alert types in the schema, invalid dashboard interval inputs can stall a request, and starter UI/test-only production branches.

## Completed refactor

- Split persistence into six domain repositories behind the existing facade; consolidated three conflicting interfaces into one typed contract. Bun SQLite handles and migration callbacks are typed.
- Serialized connection initialization and migrations. A repository releases only its own borrowed handle. Connection managers remain responsible for actual closure.
- Implemented scenario update/delete and alert read/update/delete; activation and active-scenario creation keep one active scenario. Migration 008 retains existing alerts while permitting integration alert types.
- Removed test-only production response shims, the in-memory summary store, the root route's test branch, fake SQL interpreters, unused alternate persistence code, manual test scripts, unused components, and starter assets/navigation.
- Fixed generated transaction IDs, typed API errors and dashboard data, hydrated transaction dates at the query boundary, centralized financial query invalidation, and consolidated monthly subscription cost calculations.
- Fixed subscription creation response handling, projection export data access, missing projection selection, synthetic renewal data in insights, new-budget prerendering, upload progress cleanup, immediate post-upload summary refresh, and no-match category feedback.
- Removed explicit `any` and suppression directives from source, unused imports/locals, and enabled strict production checks. Added consistent Prettier formatting and reproducible scripts.
- Fixed settings hydration and mobile action overflow in settings, scenarios, subscription details, and projections. Kept the existing design and route structure.
- Documented purpose, architecture, local data ownership, commands, and the current product limitations in README.

## Verification record

- `bun install --frozen-lockfile`: succeeds without lockfile changes.
- `bun run check`: TypeScript and ESLint clean; **144 Jest tests** in 12 suites and **41 Bun SQLite/API tests** pass.
- `bun run build`: production build and all static pages prerender successfully with type/lint checks enabled.
- `bun run format:check` and `git diff --check`: pass.
- Real database tests cover simultaneous initialization, borrowed-connection closure, reopening file-backed data, migration idempotence and version 7 upgrade preservation, duplicate imports, batch rollback, transaction IDs/CRUD/filtering, category archival/rules, subscription links/costs, scenario operations, and all alert types.
- Browser checks cover all primary pages at desktop and 390px mobile widths, populated subscription details/projections, and budget edit/analytics. Synthetic CSV import produced income 5,000, expenses 422, and net 4,578, with a recurring subscription candidate. Subscription creation through the form succeeded and redirected to its persisted detail page.
- HTTP smoke checks cover category creation and assignment, scenario create/update/activation, budget create/update/analytics, detection/projections, and 30 concurrent API reads.
- Local verification uses `/tmp/personal-finance-refactor-review.db` on **127.0.0.1:3100**. No personal statement fixtures were read or imported; existing services on 3000, 4173, and 8081 were left running.

## Remaining product limitations

This refactor does not add authentication, currency conversion, bank synchronization, or piggybanks. Subscription trend percentages still use placeholders pending historical analytics. Existing large UI pages and some SQL row mapping remain candidates for incremental extraction; the critical persistence boundaries and verification foundation are now separated. This was a local refactor, with no deployment or pull request created.
