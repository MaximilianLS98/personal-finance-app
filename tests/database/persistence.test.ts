import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { MigrationRunner, migrations } from '../../src/lib/database/migrations';
import { migration008 } from '../../src/lib/database/migrations/008_expand_budget_alert_types';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import type { BudgetAlert, Subscription, Transaction } from '../../src/lib/types';

let manager: SQLiteConnectionManager;
let repo: SQLiteTransactionRepository;
const expense: Omit<Transaction, 'id'> = {
	date: new Date('2026-10-01'),
	description: 'Synthetic groceries',
	amount: -100,
	type: 'expense',
};
beforeEach(async () => {
	manager = new SQLiteConnectionManager({ filename: ':memory:' });
	repo = new SQLiteTransactionRepository(manager);
	await repo.initialize();
});
afterEach(async () => {
	await manager.close();
});

async function category() {
	return repo.createCategory({ name: 'Synthetic', color: '#123456', icon: 'Wallet' });
}
async function budget() {
	const cat = await category();
	return repo.createBudget({
		name: 'Monthly',
		categoryId: cat.id,
		amount: 1000,
		currency: 'NOK',
		period: 'monthly',
		startDate: new Date('2026-10-01'),
		endDate: new Date('2026-10-31'),
		isActive: true,
		alertThresholds: [50, 100],
		scenarioId: 'default-scenario',
	});
}
async function subscription() {
	const cat = await category();
	const data: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'> = {
		name: 'Synthetic service',
		amount: 120,
		currency: 'NOK',
		billingFrequency: 'monthly',
		nextPaymentDate: new Date(),
		categoryId: cat.id,
		isActive: true,
		startDate: new Date('2026-01-01'),
	};
	return repo.createSubscription(data);
}

describe('connection ownership and migrations', () => {
	it('shares one ready connection across concurrent repositories, survives closing a borrower', async () => {
		const other = new SQLiteTransactionRepository(manager);
		await Promise.all([repo.initialize(), other.initialize(), manager.initialize()]);
		await repo.create(expense);
		await repo.close();
		expect((await other.findAll()).length).toBe(1);
		await repo.initialize();
		expect((await repo.findAll()).length).toBe(1);
		expect(await manager.isHealthy()).toBe(true);
	});
	it('serializes simultaneous initialization of a new manager', async () => {
		const fresh = new SQLiteConnectionManager({ filename: ':memory:' });
		try {
			const repos = Array.from({ length: 10 }, () => new SQLiteTransactionRepository(fresh));
			await Promise.all(repos.map((r) => r.initialize()));
			expect((await repos[0].findAllBudgetScenarios()).length).toBe(1);
			expect(new MigrationRunner(fresh.getConnection()).getAppliedMigrations()).toEqual(
				migrations.map((m) => m.version),
			);
		} finally {
			await fresh.close();
		}
	});
	it('is idempotent and preserves records when migrations run again', async () => {
		const tx = await repo.create(expense);
		const runner = new MigrationRunner(manager.getConnection());
		await runner.runPendingMigrations();
		expect(await repo.findById(tx.id)).toEqual(tx);
		expect(runner.getPendingMigrations()).toEqual([]);
	});
	it('upgrades a version 7 database without losing alerts', async () => {
		const { Database } = await import('bun:sqlite');
		const db = new Database(':memory:');
		try {
			for (const migration of migrations.filter((m) => m.version < 8)) migration.up(db);
			db.exec(
				"INSERT INTO budget_alerts(id,budget_id,alert_type,message,is_read) VALUES ('old','legacy','threshold','Keep this alert',1)",
			);
			db.transaction(() => migration008.up(db))();
			expect(
				db.query('SELECT message, is_read FROM budget_alerts WHERE id = ?').get('old'),
			).toEqual({ message: 'Keep this alert', is_read: 1 });
		} finally {
			db.close();
		}
	});
});

describe('persisted domain behavior', () => {
	it('imports atomically, identifies duplicates within and across batches, excludes transfers from totals', async () => {
		const income = { ...expense, description: 'Salary', amount: 1000, type: 'income' as const };
		const transfer = {
			...expense,
			description: 'Transfer',
			amount: 300,
			type: 'transfer' as const,
		};
		const first = await repo.createMany([expense, expense, income, transfer]);
		expect(first.created.length).toBe(3);
		expect(first.duplicates.length).toBe(1);
		const second = await repo.createMany([expense, income]);
		expect(second.created.length).toBe(0);
		expect(second.duplicates.length).toBe(2);
		expect(await repo.calculateSummary()).toEqual({
			totalIncome: 1000,
			totalExpenses: 100,
			netAmount: 900,
			transactionCount: 3,
		});
	});
	it('rolls back a batch when a record violates a foreign key', async () => {
		await expect(
			repo.createMany([
				expense,
				{ ...expense, description: 'Bad category', categoryId: 'missing' },
			]),
		).rejects.toThrow();
		expect(await repo.findAll()).toEqual([]);
	});
	it('updates, filters, paginates and deletes transactions', async () => {
		const cat = await category();
		const tx = await repo.create(expense);
		await repo.update(tx.id, { categoryId: cat.id, description: 'Updated' });
		const page = await repo.findWithPagination({
			page: 1,
			limit: 10,
			categoryIds: [cat.id],
			searchTerm: 'Updated',
		});
		expect(page.data[0].id).toBe(tx.id);
		expect(page.pagination.total).toBe(1);
		expect(await repo.delete(tx.id)).toBe(true);
		expect(await repo.findById(tx.id)).toBeNull();
	});
	it('persists category rules and archives categories while preserving transaction history', async () => {
		const cat = await category();
		const tx = await repo.create({ ...expense, categoryId: cat.id });
		const rule = await repo.createCategoryRule({
			categoryId: cat.id,
			pattern: 'Synthetic',
			patternType: 'contains',
			confidenceScore: 0.8,
			createdBy: 'user',
		});
		await repo.updateRuleUsage(rule.id, true);
		expect((await repo.getCategoryRules()).find((r) => r.id === rule.id)?.usageCount).toBe(1);
		await repo.deleteCategory(cat.id);
		expect((await repo.findById(tx.id))?.categoryId).toBe(cat.id);
		expect(await repo.getCategoryById(cat.id)).toBeNull();
		expect(
			manager.getConnection().query('SELECT is_active FROM categories WHERE id = ?').get(cat.id),
		).toEqual({ is_active: 0 });
	});
	it('links subscriptions to transactions and clears links on deletion', async () => {
		const sub = await subscription();
		const tx = await repo.create(expense);
		await repo.flagTransactionAsSubscription(tx.id, sub.id);
		expect((await repo.findSubscriptionTransactions(sub.id))[0].id).toBe(tx.id);
		expect(await repo.calculateTotalMonthlyCost()).toBe(120);
		await repo.updateSubscription(sub.id, { amount: 240 });
		expect(await repo.calculateTotalMonthlyCost()).toBe(240);
		await repo.deleteSubscription(sub.id);
		expect(await repo.findSubscriptionById(sub.id)).toBeNull();
		expect(await repo.findById(tx.id)).not.toBeNull();
	});
	it('updates scenarios, activates exactly one, and protects active scenarios from deletion', async () => {
		const scenario = await repo.createBudgetScenario({ name: 'Alternative', isActive: false });
		expect(
			(await repo.updateBudgetScenario(scenario.id, { name: 'Updated', description: 'Scenario' }))
				?.name,
		).toBe('Updated');
		await repo.activateBudgetScenario(scenario.id);
		expect(
			(await repo.findAllBudgetScenarios()).filter((s) => s.isActive).map((s) => s.id),
		).toEqual([scenario.id]);
		await expect(repo.deleteBudgetScenario(scenario.id)).rejects.toThrow(
			'Cannot delete active scenario',
		);
		await repo.activateBudgetScenario('default-scenario');
		expect(await repo.deleteBudgetScenario(scenario.id)).toBe(true);
		expect(await repo.updateBudgetScenario('missing', { name: 'No' })).toBeNull();
	});
	it('persists every supported alert type, reads, marks and deletes alerts with budget cascade', async () => {
		const b = await budget();
		const types: BudgetAlert['alertType'][] = [
			'threshold',
			'projection',
			'exceeded',
			'large_transaction',
			'bulk_import',
			'subscription_added',
			'subscription_removed',
			'subscription_category_changed',
			'subscription_amount_changed',
			'subscription_frequency_changed',
			'subscription_renewal',
			'subscription_insufficient_budget',
		];
		for (const alertType of types)
			await repo.createBudgetAlert({
				budgetId: b.id,
				alertType,
				thresholdPercentage: 0,
				message: alertType,
				isRead: false,
			});
		const alerts = await repo.findBudgetAlerts(b.id);
		expect(alerts.length).toBe(types.length);
		expect(alerts[0].thresholdPercentage).toBe(0);
		await repo.markBudgetAlertAsRead(alerts[0].id);
		expect((await repo.findUnreadBudgetAlerts()).length).toBe(types.length - 1);
		expect(await repo.deleteBudgetAlert(alerts[0].id)).toBe(true);
		await repo.deleteBudget(b.id);
		expect(await repo.findBudgetAlerts()).toEqual([]);
	});
});

it('does not trust caller-provided transaction IDs', async () => {
	const imported = { ...expense, id: 'csv-generated-id' };
	const result = await repo.createMany([imported]);
	expect(result.created[0].id).not.toBe(imported.id);
	expect(await repo.findById(result.created[0].id)).not.toBeNull();
});

it('creating an active scenario leaves exactly one active scenario', async () => {
	const next = await repo.createBudgetScenario({ name: 'New active scenario', isActive: true });
	expect((await repo.findAllBudgetScenarios()).filter((s) => s.isActive).map((s) => s.id)).toEqual([
		next.id,
	]);
});

it('persists data across independent file-backed connection lifetimes', async () => {
	const { mkdtempSync, rmSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const dir = mkdtempSync(join(tmpdir(), 'finance-persistence-'));
	const path = join(dir, 'test.db');
	const first = new SQLiteConnectionManager({ filename: path });
	const second = new SQLiteConnectionManager({ filename: path });
	try {
		const writer = new SQLiteTransactionRepository(first);
		await writer.initialize();
		const saved = await writer.create(expense);
		await first.close();
		const reader = new SQLiteTransactionRepository(second);
		await reader.initialize();
		expect(await reader.findById(saved.id)).toEqual(saved);
	} finally {
		await first.close();
		await second.close();
		rmSync(dir, { recursive: true });
	}
});
