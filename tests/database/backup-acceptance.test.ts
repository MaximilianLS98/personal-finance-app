import { setTransferClassification } from '../../src/lib/transfer-classification';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import {
	createFinanceBackup,
	restoreFinanceBackup,
	validateFinanceBackup,
} from '../../src/lib/finance-backup';
import {
	createAccount,
	commitImport,
	importHistory,
	listAccounts,
	matchTransfer,
	previewImport,
	transferCandidates,
	undoImport,
	unmatchTransfer,
} from '../../src/lib/ledger-service';
import { applyReview, reviewInbox, undoReview } from '../../src/lib/review-service';
import {
	getEffectiveTransactions,
	linkRefund,
	setAllocations,
} from '../../src/lib/transaction-ledger';
import {
	budgetForecast,
	cycleSettings,
	listGoals,
	planSubscription,
	saveContribution,
	saveCycleSettings,
	saveGoal,
} from '../../src/lib/planning';
import {
	billEvents,
	calendarICS,
	reminderPreferences,
	saveReminder,
} from '../../src/lib/subscription-calendar';
import { readSubscriptionHistory, subscriptionInsights } from '../../src/lib/subscription-history';
import { currencySummaries } from '../../src/lib/currency-report';

let manager: SQLiteConnectionManager, repo: SQLiteTransactionRepository;
const at = new Date('2026-10-10T12:00:00Z');
const statement = [
	'Date,Description,Amount,Currency',
	'2026-09-01,Synthetic salary,5000,NOK',
	'2026-09-10,Synthetic service,-100,NOK',
	'2026-10-01,Synthetic salary,5000,NOK',
	'2026-10-02,Synthetic purchase,-100,NOK',
	'2026-10-03,Synthetic refund,30,NOK',
	'2026-10-04,Synthetic coffee,-10,NOK',
	'2026-10-05,Synthetic service,-120,NOK',
	'Pending,Synthetic pending,-5,NOK',
].join('\n');
beforeEach(async () => {
	manager = new SQLiteConnectionManager({ filename: ':memory:' });
	repo = new SQLiteTransactionRepository(manager);
	await repo.initialize();
});
afterEach(() => manager.close());

async function seedEveryFeature() {
	const db = manager.getConnection();
	const checking = createAccount(db, {
		name: 'Synthetic checking',
		currency: 'NOK',
		openingDate: '2026-09-01',
		openingBalance: 200,
	});
	const savings = createAccount(db, {
		name: 'Synthetic savings',
		currency: 'NOK',
		openingDate: '2026-09-01',
	});
	const mainBatch = commitImport(db, statement, 'synthetic-main.csv', {
		accountId: checking.id,
		acceptErrors: true,
	});
	commitImport(db, statement, 'synthetic-overlap.csv', {
		accountId: checking.id,
		acceptErrors: true,
	});
	const undone = commitImport(
		db,
		'Date,Description,Amount\n2026-10-04,Synthetic accidental import,-25',
		'synthetic-undone.csv',
		{ accountId: checking.id },
	);
	undoImport(db, undone.id);
	commitImport(
		db,
		'Date,Description,Amount\n2026-10-06,Synthetic transfer out,-200',
		'synthetic-out.csv',
		{ accountId: checking.id },
	);
	commitImport(
		db,
		'Date,Description,Amount\n2026-10-06,Synthetic transfer in,200',
		'synthetic-in.csv',
		{ accountId: savings.id },
	);
	const pair = transferCandidates(db)[0];
	const match = matchTransfer(db, pair.outgoing.id, pair.incoming.id);
	const rows = await repo.findAll();
	const purchase = rows.find((row) => row.description === 'Synthetic purchase')!;
	const refund = rows.find((row) => row.description === 'Synthetic refund')!;
	const coffee = rows.find((row) => row.description === 'Synthetic coffee')!;
	setTransferClassification(db, { id: coffee.id, decision: 'cashflow', remember: true });
	const reviewed = applyReview(db, {
		ids: [coffee.id],
		categoryId: 'cat_dining',
		pattern: 'Synthetic coffee',
		createRule: true,
	});
	const undoneReview = applyReview(db, { ids: [purchase.id], categoryId: 'cat_groceries' });
	undoReview(db, undoneReview.id);
	setAllocations(db, purchase.id, [
		{ categoryId: 'cat_groceries', amount: 75 },
		{ categoryId: 'cat_shopping', amount: 25 },
	]);
	linkRefund(db, refund.id, purchase.id, 'reimbursement');
	const subscription = await repo.createSubscription({
		name: 'Synthetic service',
		amount: 100,
		currency: 'NOK',
		billingFrequency: 'monthly',
		nextPaymentDate: new Date('2026-10-15'),
		startDate: new Date('2026-09-01'),
		categoryId: 'cat_entertainment',
		isActive: true,
		lastUsedDate: new Date('2026-10-01'),
		usageRating: 4,
	});
	await repo.updateSubscription(subscription.id, { amount: 120 });
	await repo.createSubscriptionPattern({
		subscriptionId: subscription.id,
		pattern: 'Synthetic service',
		patternType: 'contains',
		confidenceScore: 0.95,
		createdBy: 'user',
		isActive: true,
		createdAt: at,
		updatedAt: at,
	});
	for (const row of rows.filter((row) => row.description === 'Synthetic service')) {
		await repo.update(row.id, { categoryId: 'cat_entertainment' });
		await repo.flagTransactionAsSubscription(row.id, subscription.id);
	}
	saveReminder(db, {
		subscriptionId: subscription.id,
		reminderDays: 3,
		cancellationNoticeDays: 7,
		enabled: false,
	});
	const budget = await repo.createBudget({
		name: 'Synthetic groceries',
		categoryId: 'cat_groceries',
		amount: 1000,
		currency: 'NOK',
		period: 'monthly',
		startDate: new Date('2026-09-01'),
		endDate: new Date('2026-12-31'),
		isActive: true,
		alertThresholds: [75, 100],
		scenarioId: 'default-scenario',
	});
	saveCycleSettings(db, budget.id, { payday: 15, rollover: 'positive' });
	const scenario = await repo.createBudgetScenario(
		{ name: 'Synthetic comparison', isActive: false },
		'default-scenario',
	);
	await repo.createBudgetAlert({
		budgetId: budget.id,
		alertType: 'projection',
		message: 'Synthetic preserved alert',
		isRead: false,
	});
	const goalId = saveGoal(db, {
		name: 'Synthetic savings goal',
		target: 1500,
		currency: 'NOK',
		deadline: '2090-12-31',
	});
	const contributionId = saveContribution(db, goalId, {
		amount: 150,
		date: '2026-10-01',
		note: 'Synthetic deposit',
	});
	planSubscription(db, goalId, subscription.id);
	// Also preserve explicitly unknown currency and a separate foreign-currency bucket.
	await repo.create({
		date: new Date('2026-10-07'),
		description: 'Synthetic cash',
		amount: -5,
		type: 'expense',
	});
	await repo.create({
		date: new Date('2026-10-07'),
		description: 'Synthetic dollars',
		amount: -15,
		type: 'expense',
		currency: 'USD',
	});
	return {
		db,
		checking,
		savings,
		mainBatch,
		undone,
		match,
		pair,
		purchase,
		refund,
		coffee,
		reviewed,
		subscription,
		budget,
		scenario,
		goalId,
		contributionId,
	};
}

describe('complete feature backup acceptance', () => {
	it('restores every feature table and derived result, including linked records and trigger behavior', async () => {
		const fixture = await seedEveryFeature();
		const { db } = fixture;
		const backup = createFinanceBackup(db);
		const requiredTables = [
			'accounts',
			'import_batches',
			'transfer_matches',
			'transfer_rules',
			'transfer_decisions',
			'transactions',
			'categories',
			'category_rules',
			'review_actions',
			'transaction_allocations',
			'refund_links',
			'subscriptions',
			'subscription_patterns',
			'subscription_price_history',
			'subscription_reminders',
			'budgets',
			'budget_scenarios',
			'budget_alerts',
			'budget_cycle_settings',
			'savings_goals',
			'goal_contributions',
			'goal_subscription_plans',
			'schema_metadata',
		];
		expect(Object.keys(backup.tables).sort()).toEqual(requiredTables.sort());
		for (const table of requiredTables) expect(backup.tables[table].rows.length).toBeGreaterThan(0);
		expect(backup.schemaVersion).toBe(13);
		const history = readSubscriptionHistory(db);
		const before = {
			accounts: listAccounts(db),
			imports: importHistory(db),
			review: reviewInbox(db),
			totals: currencySummaries(await getEffectiveTransactions(db)),
			forecast: budgetForecast(db, fixture.budget, at),
			goals: listGoals(db, at),
			insights: subscriptionInsights(
				await repo.findAllSubscriptions(),
				history.payments,
				history.prices,
				at,
			),
			calendar: calendarICS(
				billEvents(
					await repo.findAllSubscriptions(),
					reminderPreferences(db),
					'2026-10-01',
					'2026-12-31',
				),
				'2026-10-01',
				'2026-12-31',
				at,
			),
		};
		// Mutate all kinds of state after the backup, including deletion of linked parents.
		unmatchTransfer(db, fixture.match.id);
		undoReview(db, fixture.reviewed.id);
		db.query('DELETE FROM savings_goals WHERE id=?').run(fixture.goalId);
		db.query('DELETE FROM budgets WHERE id=?').run(fixture.budget.id);
		await repo.deleteSubscription(fixture.subscription.id);
		db.query('DELETE FROM transactions WHERE id=?').run(fixture.purchase.id);
		createAccount(db, {
			name: 'Synthetic account not backed up',
			currency: 'EUR',
			openingDate: '2026-01-01',
		});
		expect(createFinanceBackup(db).tables).not.toEqual(backup.tables);
		restoreFinanceBackup(db, JSON.parse(JSON.stringify(backup)));
		const restored = createFinanceBackup(db);
		expect(restored.tables).toEqual(backup.tables);
		expect(restored.sequences).toEqual(backup.sequences);
		expect(restored.schemaFingerprint).toBe(backup.schemaFingerprint);
		expect(db.query('PRAGMA foreign_key_check').all()).toEqual([]);
		expect(db.query('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
		const afterHistory = readSubscriptionHistory(db);
		expect({
			accounts: listAccounts(db),
			imports: importHistory(db),
			review: reviewInbox(db),
			totals: currencySummaries(await getEffectiveTransactions(db)),
			forecast: budgetForecast(db, fixture.budget, at),
			goals: listGoals(db, at),
			insights: subscriptionInsights(
				await repo.findAllSubscriptions(),
				afterHistory.payments,
				afterHistory.prices,
				at,
			),
			calendar: calendarICS(
				billEvents(
					await repo.findAllSubscriptions(),
					reminderPreferences(db),
					'2026-10-01',
					'2026-12-31',
				),
				'2026-10-01',
				'2026-12-31',
				at,
			),
		}).toEqual(before);
		expect(
			previewImport(db, statement, { accountId: fixture.checking.id }).rows.every(
				(row) => row.duplicate,
			),
		).toBe(true);
		expect(cycleSettings(db, fixture.scenario.budgets[0].id)).toEqual({
			payday: 15,
			rollover: 'positive',
		});
		// Re-created triggers retain both protection and operational behavior after restore.
		expect(() =>
			db.query('UPDATE transactions SET amount=-1 WHERE id=?').run(fixture.pair.outgoing.id),
		).toThrow('Unmatch');
		expect(() =>
			db.query('UPDATE transactions SET amount=-1 WHERE id=?').run(fixture.purchase.id),
		).toThrow('Remove splits');
		const lastPriceId = afterHistory.prices.at(-1)!.id;
		await repo.updateSubscription(fixture.subscription.id, { amount: 130 });
		expect(readSubscriptionHistory(db).prices.at(-1)!.id).toBeGreaterThan(lastPriceId);
		unmatchTransfer(db, fixture.match.id);
		expect((await repo.findById(fixture.pair.outgoing.id))?.type).toBe('expense');
		expect((await repo.findById(fixture.pair.incoming.id))?.type).toBe('income');
		// A repeated restore is idempotent and does not synthesize extra price history.
		restoreFinanceBackup(db, backup);
		expect(createFinanceBackup(db).tables).toEqual(backup.tables);
	});
	it('rejects incompatible snapshots before touching a full-feature database', async () => {
		const { db } = await seedEveryFeature();
		const original = createFinanceBackup(db);
		expect(() => validateFinanceBackup(db, { ...original, schemaVersion: 8 })).toThrow(
			'different database schema',
		);
		expect(() => restoreFinanceBackup(db, { ...original, checksum: '0'.repeat(64) })).toThrow(
			'checksum',
		);
		expect(createFinanceBackup(db).tables).toEqual(original.tables);
	});
});
