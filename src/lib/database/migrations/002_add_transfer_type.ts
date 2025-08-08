/**
 * Migration to add 'transfer' transaction type support
 * Updates the CHECK constraint to include 'transfer' alongside 'income' and 'expense'
 */

import type { Migration } from '../types';

export const migration002: Migration = {
	version: 2,
	description: 'Add transfer transaction type support',
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	up: (db: any) => {
		// Check if migration has already been applied by checking the table structure
		try {
			const tableInfo = db.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'").get();
			if (tableInfo && tableInfo.sql.includes("('income', 'expense', 'transfer')")) {
				// Migration already applied
				db.exec('INSERT OR IGNORE INTO schema_metadata (version) VALUES (2);');
				return;
			}
		} catch (error) {
			// Table might not exist, continue with migration
		}

		// Use transaction for atomic operation
		const transaction = db.transaction(() => {
			// Drop the old constraint and add the new one that includes 'transfer'
			// SQLite doesn't support ALTER TABLE ... DROP CONSTRAINT, so we need to recreate the table
			
			// First, create a backup table
			db.exec(`
				CREATE TABLE transactions_backup (
					id TEXT PRIMARY KEY,
					date TEXT NOT NULL,
					description TEXT NOT NULL,
					amount REAL NOT NULL,
					type TEXT NOT NULL,
					created_at TEXT DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT DEFAULT CURRENT_TIMESTAMP
				);
			`);

			// Copy data to backup (only if transactions table exists and has data)
			try {
				db.exec(`
					INSERT INTO transactions_backup (id, date, description, amount, type, created_at, updated_at)
					SELECT id, date, description, amount, type, created_at, updated_at FROM transactions;
				`);
			} catch (error) {
				// Table might be empty or not exist, continue
			}

			// Drop the original table
			try {
				db.exec('DROP TABLE IF EXISTS transactions;');
			} catch (error) {
				// Table might not exist, continue
			}

			// Create the new table with updated constraint
			db.exec(`
				CREATE TABLE transactions (
					id TEXT PRIMARY KEY,
					date TEXT NOT NULL,
					description TEXT NOT NULL,
					amount REAL NOT NULL,
					type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
					created_at TEXT DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT DEFAULT CURRENT_TIMESTAMP
				);
			`);

			// Copy data back
			try {
				db.exec(`
					INSERT INTO transactions (id, date, description, amount, type, created_at, updated_at)
					SELECT id, date, description, amount, type, created_at, updated_at FROM transactions_backup;
				`);
			} catch (error) {
				// Backup might be empty, continue
			}

			// Drop the backup table
			try {
				db.exec('DROP TABLE IF EXISTS transactions_backup;');
			} catch (error) {
				// Backup table might not exist, continue
			}

			// Recreate indexes
			db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);');
			db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);');
			db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);');
			db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique ON transactions(date, description, amount);');

			// Update schema metadata
			db.exec('INSERT OR IGNORE INTO schema_metadata (version) VALUES (2);');
		});
		
		transaction();
	},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	down: (db: any) => {
		// Revert back to the original constraint
		// First, create a backup table
		db.exec(`
			CREATE TABLE transactions_backup (
				id TEXT PRIMARY KEY,
				date TEXT NOT NULL,
				description TEXT NOT NULL,
				amount REAL NOT NULL,
				type TEXT NOT NULL,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			);
		`);

		// Copy non-transfer data to backup (convert transfers to expenses)
		db.exec(`
			INSERT INTO transactions_backup (id, date, description, amount, type, created_at, updated_at)
			SELECT id, date, description, amount, 
				CASE WHEN type = 'transfer' THEN 'expense' ELSE type END as type,
				created_at, updated_at 
			FROM transactions;
		`);

		// Drop the original table
		db.exec('DROP TABLE transactions;');

		// Create the original table with old constraint
		db.exec(`
			CREATE TABLE transactions (
				id TEXT PRIMARY KEY,
				date TEXT NOT NULL,
				description TEXT NOT NULL,
				amount REAL NOT NULL,
				type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			);
		`);

		// Copy data back
		db.exec(`
			INSERT INTO transactions (id, date, description, amount, type, created_at, updated_at)
			SELECT id, date, description, amount, type, created_at, updated_at FROM transactions_backup;
		`);

		// Drop the backup table
		db.exec('DROP TABLE transactions_backup;');

		// Recreate indexes
		db.exec('CREATE INDEX idx_transactions_date ON transactions(date);');
		db.exec('CREATE INDEX idx_transactions_type ON transactions(type);');
		db.exec('CREATE INDEX idx_transactions_amount ON transactions(amount);');
		db.exec('CREATE UNIQUE INDEX idx_transactions_unique ON transactions(date, description, amount);');

		// Remove migration version
		db.exec('DELETE FROM schema_metadata WHERE version = 2;');
	},
};