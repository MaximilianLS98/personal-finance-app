import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import {
	createAccount,
	commitImport,
	previewImport,
	listAccounts,
	matchTransfer,
	transferCandidates,
	undoImport,
	reconcileAccount,
	importHistory,
} from '../../src/lib/ledger-service';
import { applyReview, reviewInbox, undoReview } from '../../src/lib/review-service';
import {
	getEffectiveTransactions,
	linkRefund,
	setAllocations,
	transactionDetails,
} from '../../src/lib/transaction-ledger';
import { monthlyOverview } from '../../src/lib/overview-service';
import { currencySummaries } from '../../src/lib/currency-report';
import {
	budgetForecast,
	budgetHistory,
	cycleSettings,
	listGoals,
	planSubscription,
	saveContribution,
	saveCycleSettings,
	saveGoal,
} from '../../src/lib/planning';

let manager: SQLiteConnectionManager;
let repository: SQLiteTransactionRepository;
beforeEach(async () => {
	manager = new SQLiteConnectionManager({ filename: ':memory:' });
	repository = new SQLiteTransactionRepository(manager);
	await repository.initialize();
});
afterEach(() => manager.close());

const statement = [
	'Date,Description,Amount,Currency',
	'2026-09-05,Synthetic salary,9000,NOK',
	'2026-09-10,Synthetic market,-600,NOK',
	'2026-09-20,Synthetic service,-100,NOK',
	'2026-10-01,Synthetic salary,3000,NOK',
	'2026-10-02,Synthetic market,-1000,NOK',
	'2026-10-02,Synthetic coffee,-50,NOK',
	'2026-10-02,Synthetic coffee,-50,NOK',
	'2026-10-03,Synthetic reimbursement,300,NOK',
	'2026-10-03,Synthetic service,-100,NOK',
	'Pending,Synthetic pending,-20,NOK',
].join('\n');
const usdStatement =
	'Date,Description,Amount,Currency\n2026-10-01,Synthetic salary,1000,USD\n2026-10-02,Synthetic market,-90,USD\n2026-10-03,Synthetic dollar receipt,10,USD';

async function importJourney() {
	const db = manager.getConnection();
	const checking = createAccount(db, {
		name: 'Synthetic checking',
		currency: 'NOK',
		openingDate: '2026-09-01',
	});
	const savings = createAccount(db, {
		name: 'Synthetic savings',
		currency: 'NOK',
		openingDate: '2026-09-01',
	});
	const dollars = createAccount(db, {
		name: 'Synthetic dollar account',
		currency: 'USD',
		openingDate: '2026-09-01',
	});
	const preview = previewImport(db, statement, { accountId: checking.id });
	expect(preview.rows).toHaveLength(9);
	expect(preview.errors).toEqual([
		'Row 11: Pending transaction has no booking date; import it after it is booked',
	]);
	expect(
		preview.rows.filter((row) => row.transaction.description === 'Synthetic coffee'),
	).toHaveLength(2);
	expect(await repository.findAll()).toHaveLength(0);
	expect(() => commitImport(db, statement, 'synthetic.csv', { accountId: checking.id })).toThrow(
		'confirm importing valid rows',
	);
	expect(importHistory(db)).toHaveLength(0);
	const mainBatch = commitImport(db, statement, 'synthetic.csv', {
		accountId: checking.id,
		acceptErrors: true,
	});
	expect(mainBatch.created).toBe(9);
	const overlap = previewImport(db, statement, { accountId: checking.id });
	expect(overlap.rows.every((row) => row.duplicate)).toBe(true);
	expect(
		commitImport(db, statement, 'synthetic-overlap.csv', {
			accountId: checking.id,
			acceptErrors: true,
		}),
	).toMatchObject({ created: 0, skipped: 9 });
	commitImport(db, usdStatement, 'synthetic-usd.csv', { accountId: dollars.id });
	const transferBatch = commitImport(
		db,
		'Date,Description,Amount\n2026-10-04,Synthetic savings transfer,-500',
		'synthetic-out.csv',
		{ accountId: checking.id },
	);
	commitImport(
		db,
		'Date,Description,Amount\n2026-10-04,Synthetic savings receipt,500',
		'synthetic-in.csv',
		{ accountId: savings.id },
	);
	await repository.create({
		date: new Date('2026-10-03'),
		description: 'Synthetic legacy cash',
		amount: -25,
		type: 'expense',
		categoryId: 'cat_groceries',
	});
	return { db, checking, savings, dollars, mainBatch, transferBatch };
}

describe('cross-feature acceptance journey', () => {
	it('carries statement review through trustworthy reports, budgets, savings plans and reversible transfers', async () => {
		const { db, checking, savings, dollars, transferBatch } = await importJourney();
		const transactions = await repository.findAll();
		const purchase = transactions.find(
			(row) => row.description === 'Synthetic market' && row.amount === -1000,
		)!;
		const receipt = transactions.find((row) => row.description === 'Synthetic reimbursement')!;
		const coffee = transactions.filter((row) => row.description === 'Synthetic coffee');
		const servicePayments = transactions.filter((row) => row.description === 'Synthetic service');

		// One merchant decision applies across pages/months/currencies, without adding their amounts together.
		const marketReview = applyReview(db, {
			ids: [purchase.id],
			categoryId: 'cat_groceries',
			pattern: 'Synthetic market',
			applyHistory: true,
			createRule: true,
		});
		expect(marketReview.count).toBe(3);
		const coffeeReview = applyReview(db, {
			ids: coffee.map((row) => row.id),
			categoryId: 'cat_dining',
		});
		undoReview(db, coffeeReview.id);
		expect(
			reviewInbox(db, '2026-10').groups.find((group) => group.merchant === 'SYNTHETIC COFFEE')?.ids,
		).toHaveLength(2);
		applyReview(db, { ids: coffee.map((row) => row.id), categoryId: 'cat_dining' });
		applyReview(db, { ids: servicePayments.map((row) => row.id), categoryId: 'cat_entertainment' });
		setAllocations(db, purchase.id, [
			{ categoryId: 'cat_groceries', amount: 750 },
			{ categoryId: 'cat_shopping', amount: 250 },
		]);
		linkRefund(db, receipt.id, purchase.id, 'reimbursement');

		const candidates = transferCandidates(db);
		expect(candidates).toHaveLength(1);
		const pair = candidates[0];
		matchTransfer(db, pair.outgoing.id, pair.incoming.id);
		expect(transferCandidates(db)).toHaveLength(0);
		expect(reviewInbox(db, '2026-10').total).toBe(0);

		const summaries = currencySummaries(await getEffectiveTransactions(db));
		expect(summaries).toEqual([
			{
				currency: 'NOK',
				totalIncome: 12000,
				totalExpenses: 1600,
				netAmount: 10400,
				transactionCount: 11,
			},
			{
				currency: 'UNKNOWN',
				totalIncome: 0,
				totalExpenses: 25,
				netAmount: -25,
				transactionCount: 1,
			},
			{
				currency: 'USD',
				totalIncome: 1010,
				totalExpenses: 90,
				netAmount: 920,
				transactionCount: 3,
			},
		]);
		// Splits create accounting portions, not additional bank transactions.
		expect((await repository.findAll()).length).toBe(15);
		expect(summaries.reduce((count, summary) => count + summary.transactionCount, 0)).toBe(15);
		const overview = monthlyOverview(db, '2026-10');
		expect(overview.totals.find((total) => total.currency === 'NOK')).toMatchObject({
			income: 3000,
			expenses: 900,
			net: 2100,
			count: 8,
		});
		expect(
			overview.categories
				.filter((category) => category.currency === 'NOK')
				.map((category) => ({ category: category.categoryId, amount: category.amount })),
		).toEqual([
			{ category: 'cat_groceries', amount: 525 },
			{ category: 'cat_shopping', amount: 175 },
			{ category: 'cat_dining', amount: 100 },
			{ category: 'cat_entertainment', amount: 100 },
		]);
		expect(overview.categories.find((category) => category.currency === 'USD')?.amount).toBe(90);
		expect(overview.categories.find((category) => category.currency === 'UNKNOWN')?.amount).toBe(
			25,
		);
		expect(reconcileAccount(db, checking.id, '2026-10-04', 9900).difference).toBe(0);
		expect(listAccounts(db).find((account) => account.id === savings.id)?.balance).toBe(500);
		expect(listAccounts(db).find((account) => account.id === dollars.id)?.balance).toBe(920);

		const groceries = await repository.createBudget({
			name: 'Synthetic groceries',
			categoryId: 'cat_groceries',
			amount: 1000,
			currency: 'NOK',
			period: 'monthly',
			startDate: new Date('2026-09-01'),
			endDate: new Date('2026-12-31'),
			isActive: true,
			alertThresholds: [80, 100],
			scenarioId: 'default-scenario',
		});
		const entertainment = await repository.createBudget({
			currency: 'NOK',
			period: 'monthly',
			startDate: new Date('2026-09-01'),
			endDate: new Date('2026-12-31'),
			isActive: true,
			alertThresholds: [80, 100],
			scenarioId: 'default-scenario',
			name: 'Synthetic entertainment',
			categoryId: 'cat_entertainment',
			amount: 300,
		});
		saveCycleSettings(db, groceries.id, { payday: 1, rollover: 'positive' });
		saveCycleSettings(db, entertainment.id, { payday: 1, rollover: 'positive' });
		const at = new Date('2026-10-10T12:00:00Z');
		expect(budgetHistory(db, groceries, at)).toEqual([
			{
				start: '2026-09-01',
				end: '2026-09-30',
				baseAmount: 1000,
				carried: 0,
				available: 1000,
				spent: 600,
				remaining: 400,
			},
			{
				start: '2026-10-01',
				end: '2026-10-31',
				baseAmount: 1000,
				carried: 400,
				available: 1400,
				spent: 525,
				remaining: 875,
			},
		]);
		expect(budgetForecast(db, groceries, at)).toMatchObject({
			currentSpent: 525,
			rolloverAmount: 400,
			availableAmount: 1400,
			discretionaryRemaining: 875,
		});
		const paidSubscription = await repository.createSubscription({
			name: 'Synthetic paid service',
			amount: 100,
			currency: 'NOK',
			billingFrequency: 'monthly',
			nextPaymentDate: new Date('2026-10-03'),
			categoryId: 'cat_entertainment',
			isActive: true,
			startDate: new Date('2026-09-01'),
		});
		const upcomingSubscription = await repository.createSubscription({
			name: 'Synthetic upcoming service',
			amount: 200,
			currency: 'NOK',
			billingFrequency: 'monthly',
			nextPaymentDate: new Date('2026-10-20'),
			categoryId: 'cat_entertainment',
			isActive: true,
			startDate: new Date('2026-10-01'),
		});
		for (const payment of servicePayments)
			await repository.flagTransactionAsSubscription(payment.id, paidSubscription.id);
		expect(budgetForecast(db, entertainment, at)).toMatchObject({
			currentSpent: 100,
			rolloverAmount: 200,
			availableAmount: 500,
			subscriptionPaid: 100,
			upcomingCommitted: 200,
			variableSpent: 0,
			projectedSpent: 300,
			discretionaryRemaining: 200,
		});

		const goalId = saveGoal(db, {
			name: 'Synthetic emergency fund',
			target: 1200,
			currency: 'NOK',
			deadline: '2090-12-31',
		});
		saveContribution(db, goalId, { amount: 200, date: '2026-09-30', note: 'Actual contribution' });
		planSubscription(db, goalId, upcomingSubscription.id);
		expect(listGoals(db, at).find((goal) => goal.id === goalId)).toMatchObject({
			saved: 200,
			remaining: 1000,
			plannedMonthly: 200,
			capacity: 2766.67,
		});
		expect((await repository.findSubscriptionById(upcomingSubscription.id))?.isActive).toBe(true);
		expect(currencySummaries(await getEffectiveTransactions(db))).toEqual(summaries);
		// Planning a cancellation changes neither saved cash nor an active subscription.
		const scenario = await repository.createBudgetScenario(
			{ name: 'Synthetic alternative', isActive: false },
			'default-scenario',
		);
		expect(scenario.budgets).toHaveLength(2);
		for (const copy of scenario.budgets)
			expect(cycleSettings(db, copy.id)).toEqual({ payday: 1, rollover: 'positive' });
		await repository.activateBudgetScenario(scenario.id);
		expect(
			(await repository.findAllBudgetScenarios()).filter((s) => s.isActive).map((s) => s.id),
		).toEqual([scenario.id]);
		expect(currencySummaries(await getEffectiveTransactions(db))).toEqual(summaries);

		// Undo only the outgoing statement; the surviving receipt becomes income again atomically.
		undoImport(db, transferBatch.id);
		expect(await repository.findById(pair.outgoing.id)).toBeNull();
		expect((await repository.findById(pair.incoming.id))?.type).toBe('income');
		expect(currencySummaries(await getEffectiveTransactions(db))).toEqual([
			{
				currency: 'NOK',
				totalIncome: 12500,
				totalExpenses: 1600,
				netAmount: 10900,
				transactionCount: 10,
			},
			summaries[1],
			summaries[2],
		]);
		expect(reconcileAccount(db, checking.id, '2026-10-04', 10400).difference).toBe(0);
		expect(transactionDetails(db, purchase.id).allocations).toHaveLength(2);
		expect(listGoals(db, at).find((goal) => goal.id === goalId)?.saved).toBe(200);
	});

	it('rolls back rejected cross-feature actions without altering balances or classifications', async () => {
		const { db, checking } = await importJourney();
		const rows = await repository.findAll();
		const purchase = rows.find((row) => row.amount === -1000)!;
		const receipt = rows.find((row) => row.description === 'Synthetic reimbursement')!;
		const usdReceipt = rows.find((row) => row.description === 'Synthetic dollar receipt')!;
		const originalSummary = currencySummaries(await getEffectiveTransactions(db));
		const originalBalances = listAccounts(db);
		const originalHistory = importHistory(db);
		expect(() =>
			applyReview(db, {
				ids: [purchase.id, 'missing-transaction'],
				categoryId: 'cat_groceries',
				createRule: true,
				pattern: 'Synthetic',
			}),
		).toThrow('unavailable');
		expect((await repository.findById(purchase.id))?.categoryId).toBeUndefined();
		expect(
			(await repository.getCategoryRules()).filter((rule) => rule.createdBy === 'user'),
		).toHaveLength(0);
		expect(() =>
			setAllocations(db, purchase.id, [
				{ categoryId: 'cat_groceries', amount: 750 },
				{ categoryId: 'cat_shopping', amount: 200 },
			]),
		).toThrow('add up exactly');
		expect(transactionDetails(db, purchase.id).allocations).toEqual([]);
		expect(() => linkRefund(db, usdReceipt.id, purchase.id, 'refund')).toThrow('same currency');
		expect(() => matchTransfer(db, purchase.id, receipt.id)).toThrow('equal opposite');
		expect(() =>
			commitImport(db, usdStatement, 'wrong-account.csv', { accountId: checking.id }),
		).toThrow('currency');
		expect(importHistory(db)).toEqual(originalHistory);
		expect(currencySummaries(await getEffectiveTransactions(db))).toEqual(originalSummary);
		expect(listAccounts(db)).toEqual(originalBalances);

		setAllocations(db, purchase.id, [
			{ categoryId: 'cat_groceries', amount: 750 },
			{ categoryId: 'cat_shopping', amount: 250 },
		]);
		linkRefund(db, receipt.id, purchase.id, 'refund');
		const protectedSummary = currencySummaries(await getEffectiveTransactions(db));
		await expect(repository.update(purchase.id, { amount: -500 })).rejects.toThrow('Remove splits');
		expect(currencySummaries(await getEffectiveTransactions(db))).toEqual(protectedSummary);
		expect(transactionDetails(db, receipt.id).refund).toBeTruthy();
		expect(listAccounts(db)).toEqual(originalBalances);
	});
});
