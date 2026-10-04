import { it, expect } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import {
	setAllocations,
	linkRefund,
	getEffectiveTransactions,
} from '../../src/lib/transaction-ledger';
import { currencySummaries } from '../../src/lib/currency-report';
it('summary counts original transactions and category filters include allocated and refunded purchases', async () => {
	const m = new SQLiteConnectionManager({ filename: ':memory:' });
	const r = new SQLiteTransactionRepository(m);
	await r.initialize();
	try {
		const db = m.getConnection(),
			a = await r.createCategory({ name: 'A', color: '#112233', icon: 'Wallet' }),
			b = await r.createCategory({ name: 'B', color: '#112233', icon: 'Wallet' });
		const purchase = await r.create({
				date: new Date('2026-10-01'),
				description: 'Shop',
				amount: -100,
				type: 'expense',
				currency: 'NOK',
			}),
			refund = await r.create({
				date: new Date('2026-10-02'),
				description: 'Refund',
				amount: 20,
				type: 'income',
				currency: 'NOK',
			});
		setAllocations(db, purchase.id, [
			{ categoryId: a.id, amount: 40 },
			{ categoryId: b.id, amount: 60 },
		]);
		linkRefund(db, refund.id, purchase.id, 'refund');
		expect(currencySummaries(await getEffectiveTransactions(db))).toEqual([
			{ currency: 'NOK', totalIncome: 0, totalExpenses: 80, netAmount: -80, transactionCount: 2 },
		]);
		expect(await r.calculateSummary()).toEqual({
			totalIncome: 0,
			totalExpenses: 80,
			netAmount: -80,
			transactionCount: 2,
		});
		expect(
			(await r.findWithPagination({ page: 1, limit: 10, categoryIds: [a.id] })).pagination.total,
		).toBe(2);
		await r.create({
			date: new Date('2026-10-03'),
			description: 'Foreign',
			amount: -10,
			type: 'expense',
			currency: 'USD',
		});
		await expect(r.calculateSummary()).rejects.toThrow('single currency');
	} finally {
		await m.close();
	}
});
