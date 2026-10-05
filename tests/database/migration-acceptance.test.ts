import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { MigrationRunner, migrations } from '../../src/lib/database/migrations';
import { createFinanceBackup, validateFinanceBackup } from '../../src/lib/finance-backup';
import { readSubscriptionHistory } from '../../src/lib/subscription-history';

let db: Database;
const versions = Array.from({ length: 13 }, (_, i) => i + 1);
beforeEach(() => {
	db = new Database(':memory:');
	db.exec('PRAGMA foreign_keys=ON');
});
afterEach(() => db.close());
function seedVersionEight() {
	for (const migration of migrations.filter((m) => m.version <= 8)) migration.up(db);
	db.exec(`
  INSERT INTO categories(id,name,color,icon,parent_id) VALUES('legacy-parent','Synthetic parent','#123456','Wallet',NULL);
  INSERT INTO categories(id,name,color,icon,parent_id) VALUES('legacy-child','Synthetic child','#654321','Wallet','legacy-parent');
  INSERT INTO category_rules(id,category_id,pattern,pattern_type,confidence_score,usage_count,created_by)
   VALUES('legacy-rule','legacy-child','Synthetic merchant','contains',0.85,4,'user');
  INSERT INTO subscriptions(id,name,amount,currency,billing_frequency,next_payment_date,category_id,start_date,last_used_date,usage_rating)
   VALUES('legacy-service','Synthetic legacy service',100,'NOK','monthly','2026-10-15','legacy-child','2025-01-01','2026-09-01',4);
  INSERT INTO subscriptions(id,name,amount,currency,billing_frequency,next_payment_date,category_id,start_date,created_at,updated_at)
   VALUES('unknown-service','Synthetic unknown currency service',20,NULL,'annually','2026-12-15','legacy-child','2025-01-01',NULL,NULL);
  INSERT INTO subscription_patterns(id,subscription_id,pattern,pattern_type,confidence_score,created_by)
   VALUES('legacy-pattern','legacy-service','Synthetic service','contains',0.9,'user');
  INSERT INTO transactions(id,date,description,amount,type,currency,category_id,is_subscription,subscription_id)
   VALUES('legacy-payment','2026-09-15','Synthetic service payment',-100,'expense','NOK','legacy-child',1,'legacy-service');
  INSERT INTO transactions(id,date,description,amount,type,currency,category_id)
   VALUES('legacy-unknown','2026-09-16','Synthetic old cash',-20,'expense',NULL,NULL);
  INSERT INTO transactions(id,date,description,amount,type,currency)
   VALUES('legacy-transfer','2026-09-17','Synthetic historical transfer',100,'transfer','NOK');
  INSERT INTO budgets(id,name,category_id,amount,currency,period,start_date,end_date,alert_thresholds,scenario_id)
   VALUES('legacy-budget','Synthetic legacy budget','legacy-child',500,'NOK','monthly','2026-01-01','2026-12-31','[50,100]','default-scenario');
  INSERT INTO budget_alerts(id,budget_id,alert_type,message,is_read)
   VALUES('legacy-alert','legacy-budget','subscription_renewal','Synthetic preserved renewal',1);
 `);
}

describe('migration registry and version-eight upgrade acceptance', () => {
	it('registers every schema version once and applies the registry idempotently', async () => {
		const runner = new MigrationRunner(db);
		expect(migrations.map((m) => m.version)).toEqual(versions);
		expect(runner.validateMigrations()).toBe(true);
		expect(runner.getAppliedMigrations()).toEqual([]);
		expect(runner.getPendingMigrations().map((m) => m.version)).toEqual(versions);
		await runner.runPendingMigrations();
		expect(runner.getAppliedMigrations()).toEqual(versions);
		expect(runner.getPendingMigrations()).toEqual([]);
		const first = createFinanceBackup(db);
		await runner.runPendingMigrations();
		expect(createFinanceBackup(db).tables).toEqual(first.tables);
		expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
	});
	it('upgrades populated version eight to thirteen without losing records or guessing unknown currencies', async () => {
		seedVersionEight();
		const before = createFinanceBackup(db);
		expect(before.schemaVersion).toBe(8);
		const runner = new MigrationRunner(db);
		expect(runner.getAppliedMigrations()).toEqual(versions.slice(0, 8));
		expect(runner.getPendingMigrations().map((m) => m.version)).toEqual([9, 10, 11, 12, 13]);
		await runner.runPendingMigrations();
		const after = createFinanceBackup(db);
		expect(after.schemaVersion).toBe(13);
		for (const [name, table] of Object.entries(before.tables)) {
			const afterTable = after.tables[name];
			const positions = table.columns.map((column) => afterTable.columns.indexOf(column));
			const oldColumnsAfter = afterTable.rows.map((row) =>
				positions.map((position) => row[position]),
			);
			// Existing metadata records are also preserved while versions 9–13 are appended.
			expect(oldColumnsAfter).toEqual(expect.arrayContaining(table.rows));
			if (name !== 'schema_metadata') expect(afterTable.rows.length).toBe(table.rows.length);
		}
		expect(
			db
				.query(
					'SELECT amount,currency,account_id,import_id,source_key FROM transactions WHERE id=?',
				)
				.get('legacy-unknown'),
		).toEqual({ amount: -20, currency: null, account_id: null, import_id: null, source_key: null });
		expect(
			db.query('SELECT type,subscription_id FROM transactions WHERE id=?').get('legacy-payment'),
		).toEqual({ type: 'expense', subscription_id: 'legacy-service' });
		expect(db.query('SELECT type FROM transactions WHERE id=?').get('legacy-transfer')).toEqual({
			type: 'transfer',
		});
		expect(
			db.query('SELECT alert_type,is_read FROM budget_alerts WHERE id=?').get('legacy-alert'),
		).toEqual({ alert_type: 'subscription_renewal', is_read: 1 });
		const history = readSubscriptionHistory(db);
		expect(history.prices).toHaveLength(2);
		expect(history.prices.find((price) => price.subscriptionId === 'legacy-service')).toMatchObject(
			{ amount: 100, currency: 'NOK', source: 'baseline' },
		);
		expect(
			history.prices.find((price) => price.subscriptionId === 'unknown-service'),
		).toMatchObject({ amount: 20, currency: 'UNKNOWN', source: 'baseline' });
		expect(history.payments).toHaveLength(1);
		expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
		expect(db.query('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
		expect(() => validateFinanceBackup(db, before)).toThrow('different database schema');
		await runner.runPendingMigrations();
		expect(createFinanceBackup(db).tables).toEqual(after.tables);
		expect(runner.getAppliedMigrations()).toEqual(versions);
		// Newly installed triggers remain usable with nullable legacy timestamps/currencies.
		db.query('UPDATE subscriptions SET amount=25 WHERE id=?').run('unknown-service');
		const latest = readSubscriptionHistory(db).prices.at(-1)!;
		expect(latest).toMatchObject({
			subscriptionId: 'unknown-service',
			amount: 25,
			currency: 'UNKNOWN',
			source: 'edited',
		});
		expect(Number.isFinite(Date.parse(latest.recordedAt))).toBe(true);
	});
});
