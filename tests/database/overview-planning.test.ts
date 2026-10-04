import { it, expect } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import { monthlyOverview } from '../../src/lib/overview-service';
import { saveCycleSettings } from '../../src/lib/planning';
it('home risk uses the selected budget cycle and rollover rather than lifetime spending', async () => {
	const m = new SQLiteConnectionManager({ filename: ':memory:' }),
		repo = new SQLiteTransactionRepository(m);
	await repo.initialize();
	try {
		const db = m.getConnection();
		const budget = await repo.createBudget({
			name: 'Groceries',
			categoryId: 'cat_groceries',
			amount: 1000,
			currency: 'NOK',
			period: 'monthly',
			startDate: new Date('2026-01-01'),
			endDate: new Date('9999-12-31'),
			isActive: true,
			alertThresholds: [80],
			scenarioId: 'default-scenario',
		});
		await repo.create({
			date: new Date('2026-01-10'),
			description: 'Past month',
			amount: -1200,
			type: 'expense',
			categoryId: 'cat_groceries',
			currency: 'NOK',
		});
		await repo.create({
			date: new Date('2026-02-10'),
			description: 'Selected month',
			amount: -50,
			type: 'expense',
			categoryId: 'cat_groceries',
			currency: 'NOK',
		});
		expect(monthlyOverview(db, '2026-02').budgetRisks).toHaveLength(0);
		expect(monthlyOverview(db, '2026-01').budgetRisks[0]?.spent).toBe(1200);
		saveCycleSettings(db, budget.id, { payday: 15, rollover: 'all' });
		const progress = await repo.calculateBudgetProgress(budget.id);
		expect(progress?.periodStart?.endsWith('-15')).toBe(true);
	} finally {
		await m.close();
	}
});
