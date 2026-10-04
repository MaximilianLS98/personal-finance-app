import type { Migration } from '../types';

export const migration010: Migration = {
	version: 10,
	description: 'Subscription price history and renewal reminder preferences',
	up(db) {
		db.exec(`
   CREATE TABLE subscription_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    amount REAL NOT NULL, currency TEXT NOT NULL, billing_frequency TEXT NOT NULL,
    custom_frequency_days INTEGER, recorded_at TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('baseline','created','edited'))
   );
   CREATE INDEX idx_subscription_price_history ON subscription_price_history(subscription_id, id);
   INSERT INTO subscription_price_history(subscription_id,amount,currency,billing_frequency,custom_frequency_days,recorded_at,source)
   SELECT id,amount,UPPER(COALESCE(NULLIF(TRIM(currency),''),'UNKNOWN')),billing_frequency,custom_frequency_days,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'baseline' FROM subscriptions;
   CREATE TRIGGER subscription_price_created AFTER INSERT ON subscriptions BEGIN
    INSERT INTO subscription_price_history(subscription_id,amount,currency,billing_frequency,custom_frequency_days,recorded_at,source)
    VALUES(new.id,new.amount,UPPER(COALESCE(NULLIF(TRIM(new.currency),''),'UNKNOWN')),new.billing_frequency,new.custom_frequency_days,COALESCE(new.created_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),'created');
   END;
   CREATE TRIGGER subscription_price_edited AFTER UPDATE ON subscriptions
   WHEN old.amount IS NOT new.amount OR old.currency IS NOT new.currency OR old.billing_frequency IS NOT new.billing_frequency OR old.custom_frequency_days IS NOT new.custom_frequency_days
   BEGIN
    INSERT INTO subscription_price_history(subscription_id,amount,currency,billing_frequency,custom_frequency_days,recorded_at,source)
    VALUES(new.id,new.amount,UPPER(COALESCE(NULLIF(TRIM(new.currency),''),'UNKNOWN')),new.billing_frequency,new.custom_frequency_days,COALESCE(new.updated_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),'edited');
   END;
   CREATE TABLE subscription_reminders (
    subscription_id TEXT PRIMARY KEY REFERENCES subscriptions(id) ON DELETE CASCADE,
    reminder_days INTEGER NOT NULL DEFAULT 7 CHECK(reminder_days BETWEEN 0 AND 365),
    cancellation_notice_days INTEGER NOT NULL DEFAULT 0 CHECK(cancellation_notice_days BETWEEN 0 AND 365),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
   );
   INSERT INTO schema_metadata(version) VALUES(10);
  `);
	},
	down(db) {
		db.exec(
			'DROP TRIGGER subscription_price_created; DROP TRIGGER subscription_price_edited; DROP TABLE subscription_reminders; DROP TABLE subscription_price_history;',
		);
	},
};
