import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import {
	backupSummary,
	createFinanceBackup,
	exportTransactionsCSV,
	restoreFinanceBackup,
	validateFinanceBackup,
} from '../../src/lib/finance-backup';
let manager: SQLiteConnectionManager, repo: SQLiteTransactionRepository;
beforeEach(async () => {
	manager = new SQLiteConnectionManager({ filename: ':memory:' });
	repo = new SQLiteTransactionRepository(manager);
	await repo.initialize();
});
afterEach(async () => {
	await manager.close();
});
async function seed() {
	const category = await repo.createCategory({
		name: 'Backup category',
		icon: 'Wallet',
		color: '#123456',
	});
	const subscription = await repo.createSubscription({
		name: 'Preserved service',
		amount: 100,
		currency: 'NOK',
		billingFrequency: 'monthly',
		nextPaymentDate: new Date('2026-10-15'),
		startDate: new Date('2025-01-01'),
		isActive: true,
		categoryId: category.id,
	});
	await repo.updateSubscription(subscription.id, { amount: 120 });
	const transaction = await repo.create({
		date: new Date('2026-09-15'),
		amount: -120,
		currency: 'NOK',
		description: 'Preserved payment',
		type: 'expense',
		categoryId: category.id,
	});
	await repo.flagTransactionAsSubscription(transaction.id, subscription.id);
	return { category, subscription, transaction };
}
describe('portable finance backups', () => {
	it('round-trips every table and preserves price history without firing insert triggers', async () => {
		const { subscription } = await seed();
		const db = manager.getConnection();
		const backup = createFinanceBackup(db);
		await repo.updateSubscription(subscription.id, { amount: 999 });
		await repo.create({
			date: new Date(),
			description: 'Not in backup',
			amount: -50,
			type: 'expense',
		});
		restoreFinanceBackup(db, JSON.parse(JSON.stringify(backup)));
		const restored = createFinanceBackup(db);
		expect(restored.tables).toEqual(backup.tables);
		expect(restored.sequences).toEqual(backup.sequences);
		expect(restored.schemaFingerprint).toBe(backup.schemaFingerprint);
		expect(
			backupSummary(backup).tables.some(
				(t) => t.name === 'subscription_price_history' && t.records === 2,
			),
		).toBe(true);
		await repo.updateSubscription(subscription.id, { amount: 130 });
		expect(createFinanceBackup(db).tables.subscription_price_history.rows).toHaveLength(3);
	});
	it('detects tampering, incomplete data and schema version mismatch before changes', async () => {
		await seed();
		const db = manager.getConnection();
		const backup = createFinanceBackup(db);
		const tampered = structuredClone(backup);
		tampered.tables.transactions.rows[0][2] = 'Changed';
		expect(() => validateFinanceBackup(db, tampered)).toThrow('checksum');
		expect(() => restoreFinanceBackup(db, { ...backup, schemaVersion: 999 })).toThrow('schema');
		expect(() => validateFinanceBackup(db, { format: 'unknown' })).toThrow('format');
		expect(createFinanceBackup(db).tables).toEqual(backup.tables);
	});
	it('rolls back all replacements and restores triggers when foreign keys fail', async () => {
		const { transaction } = await seed();
		const db = manager.getConnection();
		db.exec('PRAGMA foreign_keys=OFF');
		db.query('UPDATE transactions SET category_id=? WHERE id=?').run(
			'missing-category',
			transaction.id,
		);
		const bad = createFinanceBackup(db);
		db.query('UPDATE transactions SET category_id=NULL,description=? WHERE id=?').run(
			'Current record to retain',
			transaction.id,
		);
		db.exec('PRAGMA foreign_keys=ON');
		const before = createFinanceBackup(db);
		expect(() => restoreFinanceBackup(db, bad)).toThrow('broken references');
		expect(createFinanceBackup(db).tables).toEqual(before.tables);
		expect(createFinanceBackup(db).schemaFingerprint).toBe(before.schemaFingerprint);
		expect((db.query('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(
			1,
		);
	});
	it('automatically includes newly added finance tables in complete export', async () => {
		const db = manager.getConnection();
		db.exec('CREATE TABLE future_goals(id TEXT PRIMARY KEY,name TEXT NOT NULL)');
		db.query('INSERT INTO future_goals VALUES(?,?)').run('goal', 'Savings');
		const backup = createFinanceBackup(db);
		expect(backup.tables.future_goals.rows).toEqual([['goal', 'Savings']]);
		db.exec('DELETE FROM future_goals');
		restoreFinanceBackup(db, backup);
		expect(db.query('SELECT name FROM future_goals').get()).toEqual({ name: 'Savings' });
	});
	it('exports original currency and safely quotes spreadsheet formulas and line breaks', async () => {
		await repo.create({
			date: new Date('2026-10-01'),
			description: '=HYPERLINK("unsafe")\nline two',
			amount: -10,
			currency: 'EUR',
			type: 'expense',
		});
		const csv = exportTransactionsCSV(manager.getConnection());
		expect(csv).toContain('"currency"');
		expect(csv).toContain('"EUR"');
		expect(csv).toContain('"-10"');
		expect(csv).toContain('"\'=HYPERLINK(""unsafe"")\nline two"');
	});
});
