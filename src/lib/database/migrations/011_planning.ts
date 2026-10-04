import type { Migration } from '../types';

export const migration011: Migration = {
	version: 11,
	description: 'Budget cycles, rollover and savings goals',
	up(db) {
		db.exec(`
   CREATE TABLE budget_cycle_settings (
    budget_id TEXT PRIMARY KEY REFERENCES budgets(id) ON DELETE CASCADE,
    payday INTEGER NOT NULL DEFAULT 1 CHECK (payday BETWEEN 1 AND 31),
    rollover TEXT NOT NULL DEFAULT 'none' CHECK (rollover IN ('none','positive','all'))
   );
   CREATE TABLE savings_goals (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    target REAL NOT NULL CHECK(target > 0), currency TEXT NOT NULL,
    deadline TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   CREATE TABLE goal_contributions (
    id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
    amount REAL NOT NULL CHECK(amount > 0), date TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
   );
   CREATE INDEX idx_goal_contributions_goal ON goal_contributions(goal_id, date);
   CREATE TABLE goal_subscription_plans (
    subscription_id TEXT PRIMARY KEY REFERENCES subscriptions(id) ON DELETE CASCADE,
    goal_id TEXT NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE
   );
   INSERT INTO schema_metadata(version) VALUES(11);
  `);
	},
	down(db) {
		db.exec(
			`DROP TABLE goal_subscription_plans; DROP TABLE goal_contributions; DROP TABLE savings_goals; DROP TABLE budget_cycle_settings; DELETE FROM schema_metadata WHERE version=11;`,
		);
	},
};
