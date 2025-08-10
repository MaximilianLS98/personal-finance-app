/**
 * Migration 007: Add default budget scenario
 * Creates a default "General" scenario and sets it as active
 */

import type { Migration } from '../types';

export const migration007: Migration = {
	version: 7,
	name: 'Add default budget scenario',
	up: (db) => {
		// Insert default scenario
		db.exec(`
			INSERT OR IGNORE INTO budget_scenarios (
				id, 
				name, 
				description, 
				is_active, 
				created_at, 
				updated_at
			) VALUES (
				'default-scenario',
				'General',
				'Default scenario for general budget management',
				1,
				CURRENT_TIMESTAMP,
				CURRENT_TIMESTAMP
			);
		`);

		// Update any existing budgets without a scenario to use the default scenario
		db.exec(`
			UPDATE budgets 
			SET scenario_id = 'default-scenario' 
			WHERE scenario_id IS NULL;
		`);

		// Insert migration metadata
		db.exec(`
			INSERT OR IGNORE INTO schema_metadata (version, applied_at) 
			VALUES (7, CURRENT_TIMESTAMP)
		`);

		console.log('Migration 007: Added default budget scenario');
	},
	down: (db) => {
		// Remove the default scenario assignment from budgets
		db.exec(`
			UPDATE budgets 
			SET scenario_id = NULL 
			WHERE scenario_id = 'default-scenario';
		`);

		// Remove the default scenario
		db.exec(`
			DELETE FROM budget_scenarios 
			WHERE id = 'default-scenario';
		`);

		// Remove migration metadata
		db.exec('DELETE FROM schema_metadata WHERE version = 7;');

		console.log('Migration 007: Removed default budget scenario');
	},
};
