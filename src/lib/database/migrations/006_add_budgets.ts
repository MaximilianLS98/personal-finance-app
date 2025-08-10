/**
 * Migration 006: Add budget management tables
 * Adds budgets, budget_scenarios, and budget_alerts tables
 */

import type { Migration } from '../types';

export const migration006: Migration = {
	version: 6,
	name: 'Add budget management tables',
	up: (db) => {
		// Create budget scenarios table first (referenced by budgets)
		db.exec(`
			CREATE TABLE IF NOT EXISTS budget_scenarios (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT,
				is_active BOOLEAN NOT NULL DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				
				-- Add check constraints
				CHECK (id != ''),
				CHECK (name != ''),
				CHECK (is_active IN (0, 1))
			);
		`);

		// Create budgets table
		db.exec(`
			CREATE TABLE IF NOT EXISTS budgets (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT,
				category_id TEXT NOT NULL,
				amount DECIMAL(10,2) NOT NULL,
				currency TEXT NOT NULL DEFAULT 'NOK',
				period TEXT NOT NULL,
				start_date DATE NOT NULL,
				end_date DATE NOT NULL,
				is_active BOOLEAN NOT NULL DEFAULT 1,
				alert_thresholds TEXT, -- JSON array of threshold percentages [50, 75, 90, 100]
				scenario_id TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				
				-- Add foreign key constraints
				FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
				FOREIGN KEY (scenario_id) REFERENCES budget_scenarios(id) ON DELETE SET NULL,
				
				-- Add check constraints
				CHECK (id != ''),
				CHECK (name != ''),
				CHECK (category_id != ''),
				CHECK (amount >= 0),
				CHECK (currency != ''),
				CHECK (period IN ('monthly', 'yearly')),
				CHECK (is_active IN (0, 1)),
				CHECK (start_date <= end_date)
			);
		`);

		// Create budget alerts table
		db.exec(`
			CREATE TABLE IF NOT EXISTS budget_alerts (
				id TEXT PRIMARY KEY,
				budget_id TEXT NOT NULL,
				alert_type TEXT NOT NULL,
				threshold_percentage INTEGER,
				message TEXT NOT NULL,
				is_read BOOLEAN DEFAULT 0,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				
				-- Add foreign key constraints
				FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
				
				-- Add check constraints
				CHECK (id != ''),
				CHECK (budget_id != ''),
				CHECK (alert_type IN ('threshold', 'projection', 'exceeded')),
				CHECK (threshold_percentage IS NULL OR (threshold_percentage >= 0 AND threshold_percentage <= 100)),
				CHECK (message != ''),
				CHECK (is_read IN (0, 1))
			);
		`);

		// Create indexes for performance
		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(start_date, end_date);
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets(is_active);
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_budgets_scenario ON budgets(scenario_id);
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget ON budget_alerts(budget_id);
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_budget_alerts_unread ON budget_alerts(is_read, created_at);
		`);

		db.exec(`
			CREATE INDEX IF NOT EXISTS idx_budget_scenarios_active ON budget_scenarios(is_active);
		`);

		// Create updated_at triggers for budget tables
		db.exec(`
			CREATE TRIGGER IF NOT EXISTS update_budgets_updated_at
			AFTER UPDATE ON budgets
			FOR EACH ROW
			BEGIN
				UPDATE budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
			END;
		`);

		db.exec(`
			CREATE TRIGGER IF NOT EXISTS update_budget_scenarios_updated_at
			AFTER UPDATE ON budget_scenarios
			FOR EACH ROW
			BEGIN
				UPDATE budget_scenarios SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
			END;
		`);

		// Insert migration metadata
		db.exec(`
			INSERT OR IGNORE INTO schema_metadata (version, applied_at) 
			VALUES (6, CURRENT_TIMESTAMP)
		`);

		console.log('Migration 006: Added budget management tables');
	},
	down: (db) => {
		// Drop triggers first
		db.exec('DROP TRIGGER IF EXISTS update_budgets_updated_at;');
		db.exec('DROP TRIGGER IF EXISTS update_budget_scenarios_updated_at;');

		// Drop indexes
		db.exec('DROP INDEX IF EXISTS idx_budgets_category;');
		db.exec('DROP INDEX IF EXISTS idx_budgets_period;');
		db.exec('DROP INDEX IF EXISTS idx_budgets_active;');
		db.exec('DROP INDEX IF EXISTS idx_budgets_scenario;');
		db.exec('DROP INDEX IF EXISTS idx_budget_alerts_budget;');
		db.exec('DROP INDEX IF EXISTS idx_budget_alerts_unread;');
		db.exec('DROP INDEX IF EXISTS idx_budget_scenarios_active;');

		// Drop tables in reverse order (respecting foreign keys)
		db.exec('DROP TABLE IF EXISTS budget_alerts;');
		db.exec('DROP TABLE IF EXISTS budgets;');
		db.exec('DROP TABLE IF EXISTS budget_scenarios;');

		// Remove migration metadata
		db.exec('DELETE FROM schema_metadata WHERE version = 6;');

		console.log('Migration 006: Removed budget management tables');
	},
};
