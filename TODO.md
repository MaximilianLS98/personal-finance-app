# Remaining work

The twelve ranked feature areas are implemented in the [feature stack](docs/feature-stack.md). These are follow-ups and current boundaries, rather than the original implementation checklist.

- Resolve rejected rows in each imported statement before treating its reports or account reconciliation as complete. Correct the source/mapping and re-preview, or explicitly accept importing only valid rows. Private statement data should remain local.
- Add historical exchange-rate conversion if consolidated reporting is needed. Current reports intentionally preserve separate currency totals and an unknown-currency group.
- Support upgrading JSON backups across schema versions. Current restoration requires the same schema and migration history.
- Consider immutable closed budget periods if users need historical allowance/settings snapshots. Current rollover history recalculates from current settings and imported corrections.
- Extend savings goals with account-backed funding, withdrawals/reallocation, and richer contribution analytics. Contributions currently record money set aside, without moving funds.
- Consider a subscribed calendar feed and background reminder delivery. Current reminders use exported calendar snapshots and the user's calendar application.
- Revisit bank synchronization and authentication only as explicit product expansions. The current app is manual, local, and single-user; do not expose it beyond localhost without the appropriate access controls.

Development checks are listed in the README. Keep regression coverage focused on currency isolation, import identity/undo, effective spending allocations, forecast commitments, and backup recovery as these workflows evolve.
