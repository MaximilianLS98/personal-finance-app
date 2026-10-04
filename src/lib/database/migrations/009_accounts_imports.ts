import type { Migration } from '../types';

export const migration009: Migration = {
	version: 9,
	description: 'Accounts, reversible import batches, and matched transfers',
	up(db) {
		db.exec(`
			CREATE TABLE accounts (
				id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0),
				currency TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'bank' CHECK(kind IN ('bank','credit','cash')),
				opening_balance REAL NOT NULL DEFAULT 0, opening_date TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE import_batches (
				id TEXT PRIMARY KEY, filename TEXT NOT NULL, account_id TEXT REFERENCES accounts(id),
				created_at TEXT NOT NULL, row_count INTEGER NOT NULL, skipped_count INTEGER NOT NULL,
				errors_json TEXT NOT NULL DEFAULT '[]', undone_at TEXT
			);
			ALTER TABLE transactions ADD COLUMN account_id TEXT REFERENCES accounts(id);
			ALTER TABLE transactions ADD COLUMN import_id TEXT REFERENCES import_batches(id);
			ALTER TABLE transactions ADD COLUMN source_key TEXT;
			DROP INDEX IF EXISTS idx_transactions_unique;
			CREATE INDEX idx_transaction_identity ON transactions(date, description, amount, currency, account_id);
			CREATE UNIQUE INDEX idx_transaction_legacy_identity ON transactions(date, description, amount, COALESCE(currency,''), COALESCE(account_id,'')) WHERE source_key IS NULL;
			CREATE UNIQUE INDEX idx_transaction_source ON transactions(source_key) WHERE source_key IS NOT NULL;
			CREATE INDEX idx_transaction_import ON transactions(import_id);
			CREATE TABLE transfer_matches (
				id TEXT PRIMARY KEY, outgoing_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
				incoming_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
				outgoing_type TEXT NOT NULL, incoming_type TEXT NOT NULL,
				CHECK(outgoing_id != incoming_id)
			);
			INSERT INTO schema_metadata(version) VALUES (9);
		`);
	},
	down() {
		throw new Error('Account and import history must be retained; restore a backup to downgrade');
	},
};
