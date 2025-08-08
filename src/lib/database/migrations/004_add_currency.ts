import type { Migration } from '../types';

export const migration004: Migration = {
	version: 4,
	description: "Add optional 'currency' column to transactions",
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	up: (db: any) => {
		// Add currency column if it doesn't exist
		try {
			const info = db.query("PRAGMA table_info('transactions')").all() as Array<{
				name: string;
			}>;
			const hasCurrency = info.some((c) => c.name === 'currency');
			if (!hasCurrency) {
				db.exec('ALTER TABLE transactions ADD COLUMN currency TEXT');
			}
		} catch (e) {
			// Fallback: recreate table with new column if ALTER failed (older SQLite)
			db.exec(`
				CREATE TABLE IF NOT EXISTS transactions_new (
					id TEXT PRIMARY KEY,
					date TEXT NOT NULL,
					description TEXT NOT NULL,
					amount REAL NOT NULL,
					type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
					currency TEXT,
					category_id TEXT REFERENCES categories(id),
					created_at TEXT DEFAULT CURRENT_TIMESTAMP,
					updated_at TEXT DEFAULT CURRENT_TIMESTAMP
				);
			`);
			try {
				db.exec(`
					INSERT INTO transactions_new (id, date, description, amount, type, currency, category_id, created_at, updated_at)
					SELECT id, date, description, amount, type, NULL as currency, category_id, created_at, updated_at FROM transactions;
				`);
			} catch {}
			try {
				db.exec('DROP TABLE IF EXISTS transactions;');
			} catch {}
			db.exec('ALTER TABLE transactions_new RENAME TO transactions;');
			// Recreate indexes
			db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);');
			db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);');
			db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);');
			db.exec(
				'CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);',
			);
			db.exec(
				'CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique ON transactions(date, description, amount);',
			);
		}
		// Mark migration as applied
		db.exec('INSERT OR IGNORE INTO schema_metadata (version) VALUES (4);');
	},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	down: (db: any) => {
		// Rollback: recreate table without currency column
		db.exec(`
			CREATE TABLE transactions_backup AS 
			SELECT id, date, description, amount, type, category_id, created_at, updated_at FROM transactions;
		`);
		db.exec('DROP TABLE IF EXISTS transactions;');
		db.exec(`
			CREATE TABLE transactions (
				id TEXT PRIMARY KEY,
				date TEXT NOT NULL,
				description TEXT NOT NULL,
				amount REAL NOT NULL,
				type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
				category_id TEXT REFERENCES categories(id),
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			);
		`);
		db.exec(`
			INSERT INTO transactions (id, date, description, amount, type, category_id, created_at, updated_at)
			SELECT id, date, description, amount, type, category_id, created_at, updated_at FROM transactions_backup;
		`);
		db.exec('DROP TABLE transactions_backup;');
		// Recreate indexes
		db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);');
		db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);');
		db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount);');
		db.exec(
			'CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);',
		);
		db.exec(
			'CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_unique ON transactions(date, description, amount);',
		);
		// Remove migration record
		db.exec('DELETE FROM schema_metadata WHERE version = 4;');
	},
};
