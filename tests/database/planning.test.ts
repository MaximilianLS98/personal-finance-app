import { linkRefund } from '../../src/lib/transaction-ledger';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrations } from '../../src/lib/database/migrations';
import {
	budgetForecast,
	budgetHistory,
	budgetWindow,
	listGoals,
	planSubscription,
	saveContribution,
	saveCycleSettings,
	saveGoal,
} from '../../src/lib/planning';
import type { Budget } from '../../src/lib/types';
let db: Database;
let budget: Budget;
beforeEach(() => {
	db = new Database(':memory:');
	db.exec('PRAGMA foreign_keys=ON');
	for (const m of migrations) m.up(db);
	db.query(
		"INSERT INTO categories(id,name,color,icon) VALUES('cat','Test','#123456','Wallet')",
	).run();
	budget = {
		id: 'budget',
		name: 'Test',
		categoryId: 'cat',
		amount: 1000,
		currency: 'NOK',
		period: 'monthly',
		startDate: new Date('2026-01-01'),
		endDate: new Date('9999-12-31'),
		isActive: true,
		alertThresholds: [100],
		createdAt: new Date(),
		updatedAt: new Date(),
	};
	db.query(
		'INSERT INTO budgets(id,name,category_id,amount,currency,period,start_date,end_date) VALUES(?,?,?,?,?,?,?,?)',
	).run(
		budget.id,
		budget.name,
		budget.categoryId,
		budget.amount,
		budget.currency,
		budget.period,
		budget.startDate.toISOString(),
		budget.endDate.toISOString(),
	);
});
afterEach(() => db.close());
function transaction(
	id: string,
	date: string,
	amount: number,
	currency: string | null = 'NOK',
	subscriptionId: string | null = null,
	type = 'expense',
) {
	db.query(
		'INSERT INTO transactions(id,date,description,amount,type,currency,category_id,subscription_id) VALUES(?,?,?,?,?,?,?,?)',
	).run(id, date, id, amount, type, currency, 'cat', subscriptionId);
}
function subscription(
	id: string,
	amount: number,
	next: string,
	frequency = 'monthly',
	currency: string | null = 'NOK',
) {
	db.query(
		'INSERT INTO subscriptions(id,name,amount,currency,billing_frequency,next_payment_date,category_id,start_date) VALUES(?,?,?,?,?,?,?,?)',
	).run(id, id, amount, currency, frequency, next, 'cat', '2026-01-01');
}
describe('budget cycles and truthful forecasts', () => {
	it('anchors payday 31 through February without drifting into March', () => {
		const settings = { payday: 31, rollover: 'none' as const };
		const feb = budgetWindow(budget, settings, new Date('2026-02-28'));
		expect(feb.start.toISOString().slice(0, 10)).toBe('2026-02-28');
		expect(feb.end.toISOString().slice(0, 10)).toBe('2026-03-30');
		const jan = budgetWindow(budget, settings, new Date('2026-02-27'));
		expect(jan.start.toISOString().slice(0, 10)).toBe('2026-01-31');
		expect(jan.end.toISOString().slice(0, 10)).toBe('2026-02-27');
	});
	it('calculates rollover and excludes unknown, foreign currency and transfers', () => {
		transaction('jan', '2026-01-12', -1200);
		transaction('eur', '2026-01-14', -9000, 'EUR');
		transaction('unknown', '2026-01-15', -8000, null);
		transaction('transfer', '2026-01-16', -5000, 'NOK', null, 'transfer');
		saveCycleSettings(db, budget.id, { payday: 1, rollover: 'all' });
		let history = budgetHistory(db, budget, new Date('2026-02-10'));
		expect(history[1].carried).toBe(-200);
		expect(history[1].available).toBe(800);
		saveCycleSettings(db, budget.id, { payday: 1, rollover: 'positive' });
		history = budgetHistory(db, budget, new Date('2026-02-10'));
		expect(history[1].carried).toBe(0);
		transaction('refund', '2026-01-20', 400);
		history = budgetHistory(db, budget, new Date('2026-02-10'));
		expect(history[1].carried).toBe(200);
	});
	it('separates actual bills and unpaid commitments without double counting paid bills', () => {
		subscription('paid', 100, '2026-02-05');
		subscription('future', 240, '2026-02-20');
		subscription('annual', 1200, '2026-05-01', 'annually');
		subscription('foreign', 500, '2026-02-20', 'monthly', 'EUR');
		transaction('bill', '2026-02-05', -100, 'NOK', 'paid');
		transaction('food', '2026-02-06', -50);
		const result = budgetForecast(db, budget, new Date('2026-02-10'));
		expect(result.currentSpent).toBe(150);
		expect(result.subscriptionPaid).toBe(100);
		expect(result.variableSpent).toBe(50);
		expect(result.upcomingCommitted).toBe(240);
		expect(result.discretionaryRemaining).toBe(610);
		expect(result.projectedSpent).toBe(480);
	});

	it('subtracts linked subscription refunds from paid bills, not from variable spending', () => {
		subscription('service', 100, '2026-02-05');
		transaction('bill', '2026-02-05', -100, 'NOK', 'service');
		transaction('food', '2026-02-06', -50);
		transaction('receipt', '2026-02-08', 100, 'NOK', null, 'income');
		linkRefund(db, 'receipt', 'bill', 'refund');
		const result = budgetForecast(db, budget, new Date('2026-02-10'));
		expect(result.currentSpent).toBe(50);
		expect(result.subscriptionPaid).toBe(0);
		expect(result.variableSpent).toBe(50);
		expect(result.projectedSpent).toBe(140);
	});

	it('keeps overdue unpaid bills committed and counts annual payments on their actual due date', () => {
		subscription('overdue', 100, '2026-02-02');
		subscription('annual', 1200, '2026-02-15', 'annually');
		expect(budgetForecast(db, budget, new Date('2026-02-10')).upcomingCommitted).toBe(1300);
	});
	it('clamps finite periods and rejects invalid cycle settings', () => {
		budget.endDate = new Date('2026-02-10');
		const window = budgetWindow(budget, { payday: 15, rollover: 'none' }, new Date('2026-03-01'));
		expect(window.end.toISOString().slice(0, 10)).toBe('2026-02-10');
		expect(() => saveCycleSettings(db, budget.id, { payday: 32, rollover: 'all' })).toThrow(
			'Payday',
		);
	});
});
describe('savings goals and realistic allocations', () => {
	const goal = { name: 'Emergency fund', target: 1200, currency: 'NOK', deadline: '2090-12-31' };
	it('persists edits and contribution history, recalculates progress and forbids currency relabeling', () => {
		const id = saveGoal(db, goal);
		const contribution = saveContribution(db, id, {
			amount: 200,
			date: '2026-01-10',
			note: 'First deposit',
		});
		expect(listGoals(db)[0].saved).toBe(200);
		saveContribution(db, id, { amount: 300, date: '2026-01-11' }, contribution);
		expect(listGoals(db)[0].saved).toBe(300);
		saveGoal(db, { ...goal, target: 1500 }, id);
		expect(listGoals(db)[0].remaining).toBe(1200);
		expect(() => saveGoal(db, { ...goal, currency: 'EUR' }, id)).toThrow('Currency cannot change');
		db.query('DELETE FROM goal_contributions WHERE id=?').run(contribution);
		expect(listGoals(db)[0].saved).toBe(0);
		expect(() => saveContribution(db, id, { amount: -1, date: '2026-01-10' })).toThrow();
		expect(() => saveGoal(db, { ...goal, deadline: '2026-02-30' })).toThrow();
	});
	it('allocates each cancellation scenario to only one goal and never adds hypothetical savings to actual progress', () => {
		const a = saveGoal(db, goal),
			b = saveGoal(db, { ...goal, name: 'Holiday' });
		subscription('monthly', 120, '2026-02-15');
		subscription('euro', 50, '2026-02-15', 'monthly', 'EUR');
		planSubscription(db, a, 'monthly');
		expect(listGoals(db).find((g) => g.id === a)?.plannedMonthly).toBe(120);
		expect(listGoals(db).find((g) => g.id === a)?.saved).toBe(0);
		planSubscription(db, b, 'monthly');
		expect(listGoals(db).find((g) => g.id === a)?.plannedMonthly).toBe(0);
		expect(listGoals(db).find((g) => g.id === b)?.plannedMonthly).toBe(120);
		expect(() => planSubscription(db, a, 'euro')).toThrow('currencies');
	});
	it('uses complete months and other same-currency goal commitments when estimating capacity', () => {
		const a = saveGoal(db, { ...goal, deadline: '2090-12-31' });
		saveGoal(db, { ...goal, name: 'Other', deadline: '2090-12-31' });
		saveGoal(db, { ...goal, name: 'Euro', currency: 'EUR', deadline: '2090-12-31' });
		transaction('income', '2026-01-05', 3000, 'NOK', null, 'income');
		transaction('expenses', '2026-01-10', -600);
		transaction('ignoretransfer', '2026-02-01', 9999, 'NOK', null, 'transfer');
		transaction('eur', '2026-02-01', 9999, 'EUR', null, 'income');
		transaction('partialmonth', '2026-04-01', 99999, 'NOK', null, 'income');
		const result = listGoals(db, new Date('2026-04-02')).find((g) => g.id === a)!;
		expect(result.capacity).toBe(800);
		expect(result.otherGoalsMonthly).toBe(result.monthlyRequired);
	});
	it('deletes goal records with contributions and plans atomically via foreign keys', () => {
		const id = saveGoal(db, goal);
		saveContribution(db, id, { amount: 1, date: '2026-01-01' });
		subscription('test', 1, '2026-02-01');
		planSubscription(db, id, 'test');
		db.query('DELETE FROM savings_goals WHERE id=?').run(id);
		expect(db.query('SELECT * FROM goal_contributions').all()).toHaveLength(0);
		expect(db.query('SELECT * FROM goal_subscription_plans').all()).toHaveLength(0);
	});
});
