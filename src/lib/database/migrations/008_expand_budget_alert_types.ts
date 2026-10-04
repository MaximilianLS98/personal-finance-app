import type { Migration } from '../types';

export const migration008: Migration = {
	version: 8,
	description: 'Support budget integration alert types',
	up(db) {
		db.exec(`
   CREATE TABLE budget_alerts_next (
    id TEXT PRIMARY KEY CHECK (id != ''),
    budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN (
     'threshold', 'projection', 'exceeded', 'large_transaction', 'bulk_import',
     'subscription_added', 'subscription_removed', 'subscription_category_changed',
     'subscription_amount_changed', 'subscription_frequency_changed',
     'subscription_renewal', 'subscription_insufficient_budget'
    )),
    threshold_percentage INTEGER CHECK (threshold_percentage IS NULL OR threshold_percentage BETWEEN 0 AND 100),
    message TEXT NOT NULL CHECK (message != ''),
    is_read BOOLEAN DEFAULT 0 CHECK (is_read IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );
   INSERT INTO budget_alerts_next SELECT * FROM budget_alerts;
   DROP TABLE budget_alerts;
   ALTER TABLE budget_alerts_next RENAME TO budget_alerts;
   CREATE INDEX idx_budget_alerts_budget ON budget_alerts(budget_id);
   CREATE INDEX idx_budget_alerts_unread ON budget_alerts(is_read, created_at);
   INSERT INTO schema_metadata (version, applied_at) VALUES (8, CURRENT_TIMESTAMP);
  `);
	},
	down() {
		// Earlier schemas cannot represent all current alerts without discarding records.
		throw new Error('Migration 008 cannot be rolled back without losing alert data');
	},
};
