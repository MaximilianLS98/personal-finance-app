import { afterEach, beforeEach, expect, it } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import { BudgetService } from '../../src/lib/budget-service';
import { cycleSettings, saveCycleSettings, budgetForecast } from '../../src/lib/planning';
let manager: SQLiteConnectionManager, repo: SQLiteTransactionRepository;
beforeEach(async () => {
	manager = new SQLiteConnectionManager({ filename: ':memory:' });
	repo = new SQLiteTransactionRepository(manager);
	await repo.initialize();
});
afterEach(async () => {
	await manager.close();
});
it('copies payday and rollover with budgets in an atomic scenario copy', async () => {
	const cat = await repo.createCategory({ name: 'Test', color: '#123456', icon: 'Wallet' });
	const original = await repo.createBudget({
		name: 'Source',
		categoryId: cat.id,
		amount: 1000,
		currency: 'NOK',
		period: 'monthly',
		startDate: new Date('2026-01-01'),
		endDate: new Date('2026-12-31'),
		isActive: true,
		alertThresholds: [100],
		scenarioId: 'default-scenario',
	});
	const db = manager.getConnection();
	saveCycleSettings(db, original.id, { payday: 15, rollover: 'positive' });
	await repo.create({
		description: 'Test bill',
		date: new Date('2026-01-20'),
		amount: -200,
		type: 'expense',
		currency: 'NOK',
		categoryId: cat.id,
	});
	const copied = await new BudgetService(repo).createBudgetScenario(
		'Copy',
		undefined,
		'default-scenario',
	);
	expect(copied.budgets).toHaveLength(1);
	const clone = copied.budgets[0];
	expect(cycleSettings(db, clone.id)).toEqual({ payday: 15, rollover: 'positive' });
	const before = budgetForecast(db, original, new Date('2026-02-20')),
		after = budgetForecast(db, clone, new Date('2026-02-20'));
	expect(after.availableAmount).toBe(before.availableAmount!);
	expect(after.periodStart).toBe(before.periodStart!);
	const count = (await repo.findAllBudgetScenarios()).length;
	db.exec(
		"CREATE TRIGGER reject_test_copy BEFORE INSERT ON budget_cycle_settings WHEN NEW.budget_id!='" +
			original.id +
			"' BEGIN SELECT RAISE(ABORT,'simulated copy failure'); END",
	);
	await expect(
		new BudgetService(repo).createBudgetScenario('Failed', undefined, 'default-scenario'),
	).rejects.toThrow('simulated copy failure');
	expect(await repo.findAllBudgetScenarios()).toHaveLength(count);
	expect(await repo.findAllBudgets()).toHaveLength(2);
});
it('rejects a missing source without leaving an empty new scenario', async () => {
	const count = (await repo.findAllBudgetScenarios()).length;
	await expect(
		new BudgetService(repo).createBudgetScenario('Missing', undefined, 'missing'),
	).rejects.toThrow('Source scenario not found');
	expect(await repo.findAllBudgetScenarios()).toHaveLength(count);
});
