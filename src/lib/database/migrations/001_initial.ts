/**
 * Initial database schema migration
 * Creates the transactions table with proper indexing and constraints
 */

import type { Migration } from '../types';

export const migration001: Migration = {
	version: 1,
	description: 'Initial schema creation with transactions table',
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	up: (db: any) => {
		// Create transactions table with proper schema
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

		// Create indexes for optimal query performance
		db.exec('CREATE INDEX idx_transactions_date ON transactions(date);');
		db.exec('CREATE INDEX idx_transactions_type ON transactions(type);');
		db.exec('CREATE INDEX idx_transactions_amount ON transactions(amount);');

		// Create unique constraint to prevent duplicates
		db.exec(
			'CREATE UNIQUE INDEX idx_transactions_unique ON transactions(date, description, amount);',
		);

		// Create metadata table for schema versioning
		db.exec(`
			CREATE TABLE schema_metadata (
				version INTEGER PRIMARY KEY,
				applied_at TEXT DEFAULT CURRENT_TIMESTAMP
			);
		`);

		// Insert initial version record
		db.exec('INSERT INTO schema_metadata (version) VALUES (1);');
	},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	down: (db: any) => {
		// Drop tables in reverse order
		db.exec('DROP TABLE IF EXISTS schema_metadata;');
		db.exec('DROP TABLE IF EXISTS transactions;');
	},
};
