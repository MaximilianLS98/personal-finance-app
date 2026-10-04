import { afterEach, beforeEach, expect, it } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import { BudgetSuggestionGenerator } from '../../src/lib/budget-suggestion-generator';
import { BudgetAnalyticsEngine } from '../../src/lib/budget-analytics-engine';
import { budgetTotals, comparableBudgetTotal } from '../../src/lib/budget-totals';
import { migration010 as allocationMigration } from '../../src/lib/database/migrations/010_review_allocations';
import type { Budget } from '../../src/lib/types';
let manager: SQLiteConnectionManager, repo: SQLiteTransactionRepository, categoryId: string;
beforeEach(async () => {
	manager = new SQLiteConnectionManager({ filename: ':memory:' });
	repo = new SQLiteTransactionRepository(manager);
	await repo.initialize();
	categoryId = (
		await repo.createCategory({ name: 'Test currency', color: '#123456', icon: 'Wallet' })
	).id;
});
afterEach(async () => manager.close());
async function expense(id: string, amount: number, currency?: string) {
	return repo.create({
		date: new Date(Date.now() - 86400000),
		description: id,
		amount,
		type: 'expense',
		categoryId,
		currency,
	});
}
it('scopes historical suggestions and subscription floors to the requested currency', async () => {
	await expense('NOK', -100, 'NOK');
	await expense('EUR', -999, 'EUR');
	await expense('unknown', -300);
	await repo.createSubscription({
		name: 'EUR bill',
		amount: 500,
		currency: 'EUR',
		billingFrequency: 'monthly',
		nextPaymentDate: new Date(),
		categoryId,
		isActive: true,
		startDate: new Date(),
	});
	const nok = await repo.analyzeHistoricalSpending(categoryId, 3, 'NOK');
	expect(nok.averageMonthly).toBe(100);
	expect(nok.subscriptionCosts).toBe(0);
	const unknown = await repo.analyzeHistoricalSpending(categoryId, 3, 'UNKNOWN');
	expect(unknown.averageMonthly).toBe(300);
	const generator = new BudgetSuggestionGenerator(repo);
	expect((await generator.calculateSubscriptionAllocation(categoryId, 'NOK')).count).toBe(0);
	expect((await generator.calculateSubscriptionAllocation(categoryId, 'EUR')).monthlyTotal).toBe(
		500,
	);
	const suggestions = await generator.generateSuggestions(
		categoryId,
		{ type: 'monthly', startDate: new Date(), endDate: new Date() },
		'NOK',
	);
	expect(suggestions.subscriptionCosts.fixedAmount).toBe(0);
	expect(suggestions.suggestions.moderate.amount).toBeLessThan(300);
});
it('uses real split and refund allocations in historical and variance reports', async () => {
	const db = manager.getConnection();
	// Standalone planning checkout may precede the ledger layer. Integrated stacks already have it.
	if (!db.query("SELECT 1 FROM sqlite_master WHERE name='effective_transactions'").get()) {
		db.query('DELETE FROM schema_metadata WHERE version=?').run(allocationMigration.version);
		allocationMigration.up(db);
	}
	const other = (await repo.createCategory({ name: 'Other', color: '#654321', icon: 'Wallet' })).id;
	const purchase = await expense('Purchase', -100, 'NOK');
	db.query(
		'INSERT INTO transaction_allocations(transaction_id,category_id,amount) VALUES(?,?,?),(?,?,?)',
	).run(purchase.id, categoryId, 60, purchase.id, other, 40);
	const refund = await repo.create({
		date: new Date(Date.now() - 86400000),
		description: 'Refund',
		amount: 50,
		type: 'income',
		currency: 'NOK',
	});
	db.query('INSERT INTO refund_links(refund_id,purchase_id,kind) VALUES(?,?,?)').run(
		refund.id,
		purchase.id,
		'refund',
	);
	expect((await repo.analyzeHistoricalSpending(categoryId, 3, 'NOK')).averageMonthly).toBe(30);
	expect(
		await repo.categorySpendingInRange(
			categoryId,
			'NOK',
			new Date(Date.now() - 86400000 * 3),
			new Date(),
		),
	).toBe(30);
	const budget = await repo.createBudget({
		name: 'NOK budget',
		categoryId,
		amount: 100,
		currency: 'NOK',
		period: 'monthly',
		startDate: new Date(Date.now() - 86400000 * 3),
		endDate: new Date(),
		isActive: true,
		alertThresholds: [100],
	});
	const variance = await new BudgetAnalyticsEngine(repo).calculateBudgetVariance(budget);
	expect(variance.monthlyVariances.reduce((sum, m) => sum + m.actual, 0)).toBe(30);
});
it('never adds currencies or monthly and yearly allowances in scenario totals', () => {
	const budgets = [
		{ amount: 100, currency: 'NOK', period: 'monthly' },
		{ amount: 200, currency: 'EUR', period: 'monthly' },
		{ amount: 1200, currency: 'NOK', period: 'yearly' },
		{ amount: 50, currency: 'NOK', period: 'monthly' },
	] as Budget[];
	expect(budgetTotals(budgets)).toEqual([
		{ amount: 200, currency: 'EUR', period: 'monthly' },
		{ amount: 150, currency: 'NOK', period: 'monthly' },
		{ amount: 1200, currency: 'NOK', period: 'yearly' },
	]);
	expect(comparableBudgetTotal(budgets)).toBe(0);
	expect(comparableBudgetTotal([budgets[0], budgets[3]])).toBe(150);
});

it('requires an explicit currency in the public suggestions API', async () => {
	const { GET } = await import('../../src/app/api/budgets/suggestions/[categoryId]/route');
	const { NextRequest } = await import('next/server');
	const response = await GET(
		new NextRequest(
			'http://localhost/api/budgets/suggestions/test?startDate=2026-01-01&endDate=2026-12-31',
		),
		{ params: Promise.resolve({ categoryId }) },
	);
	expect(response.status).toBe(400);
	expect((await response.json()).error).toContain('currency');
});
