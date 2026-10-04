import { it, expect } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import { createAccount, commitImport, matchTransfer } from '../../src/lib/ledger-service';
it('prevents edits to matched amounts and restores the counterpart when a transaction is deleted', async () => {
	const m = new SQLiteConnectionManager({ filename: ':memory:' });
	const repo = new SQLiteTransactionRepository(m);
	await repo.initialize();
	try {
		const db = m.getConnection();
		for (const [name, amount] of [
			['One', -100],
			['Two', 100],
		] as const) {
			const a = createAccount(db, { name, currency: 'NOK', openingDate: '2026-01-01' });
			commitImport(db, `Date,Description,Amount\n2026-10-01,Transfer,${amount}`, 'synthetic.csv', {
				accountId: a.id,
			});
		}
		const rows = db.query('SELECT id FROM transactions ORDER BY amount').all() as { id: string }[];
		matchTransfer(db, rows[0].id, rows[1].id);
		await expect(repo.update(rows[0].id, { amount: -200 })).rejects.toThrow('Unmatch');
		await repo.delete(rows[0].id);
		expect((await repo.findById(rows[1].id))?.type).toBe('income');
		expect(db.query('SELECT * FROM transfer_matches').all()).toHaveLength(0);
	} finally {
		await m.close();
	}
});
