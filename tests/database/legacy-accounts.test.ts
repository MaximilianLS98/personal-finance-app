import { it, expect } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import { createAccount } from '../../src/lib/ledger-service';
import { assignTransactions, unassignedTransactions } from '../../src/lib/legacy-accounts';
it('assigns selected legacy records and their unknown currency atomically', async () => {
	const m = new SQLiteConnectionManager({ filename: ':memory:' });
	const r = new SQLiteTransactionRepository(m);
	await r.initialize();
	try {
		const db = m.getConnection();
		const a = createAccount(db, { name: 'Legacy', currency: 'NOK', openingDate: '2026-01-01' });
		const old = await r.create({
			date: new Date('2026-10-01'),
			description: 'Old',
			amount: -10,
			type: 'expense',
		});
		const foreign = await r.create({
			date: new Date('2026-10-02'),
			description: 'Foreign',
			amount: -20,
			type: 'expense',
			currency: 'USD',
		});
		expect(() => assignTransactions(db, a.id, [old.id, foreign.id])).toThrow('currency');
		expect(unassignedTransactions(db)).toHaveLength(2);
		assignTransactions(db, a.id, [old.id]);
		expect((await r.findById(old.id))?.currency).toBe('NOK');
		expect(unassignedTransactions(db)).toHaveLength(1);
	} finally {
		await m.close();
	}
});
