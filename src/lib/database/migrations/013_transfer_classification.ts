import type { Migration } from '../types';

export const migration013: Migration = {
	version: 13,
	description: 'Transfer source evidence, remembered rules, and manual decisions',
	up(db) {
		db.exec(`
			ALTER TABLE transactions ADD COLUMN source_format TEXT;
			ALTER TABLE transactions ADD COLUMN source_type TEXT;
			ALTER TABLE transactions ADD COLUMN source_product TEXT;
			ALTER TABLE transactions ADD COLUMN source_fee REAL;
			CREATE TABLE transfer_rules (
				id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
				currency TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('in','out')),
				description TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('transfer','cashflow')),
				UNIQUE(account_id,currency,direction,description)
			);
			CREATE TABLE transfer_decisions (
				transaction_id TEXT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
				decision TEXT NOT NULL CHECK(decision IN ('transfer','cashflow')),
				origin TEXT NOT NULL CHECK(origin IN ('manual','automatic','rule')),
				reason TEXT NOT NULL, rule_id TEXT REFERENCES transfer_rules(id) ON DELETE SET NULL
			);
			INSERT INTO schema_metadata(version) VALUES(13);
		`);
	},
	down() {
		throw new Error('Transfer decisions must be retained; restore a backup to downgrade');
	},
};
