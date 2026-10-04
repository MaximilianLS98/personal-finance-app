import type { Database } from 'bun:sqlite';
import { currencyCode } from './money';
export function unassignedTransactions(db: Database) {
	return db
		.query(
			'SELECT id,date,description,amount,currency FROM transactions WHERE account_id IS NULL ORDER BY date DESC',
		)
		.all();
}
export function assignTransactions(db: Database, accountId: string, transactionIds: string[]) {
	if (
		!Array.isArray(transactionIds) ||
		!transactionIds.length ||
		transactionIds.length > 10000 ||
		!transactionIds.every((id) => typeof id === 'string')
	)
		throw new Error('Select transactions to assign');
	return db.transaction(() => {
		const account = db.query('SELECT currency FROM accounts WHERE id=?').get(accountId) as {
			currency: string;
		} | null;
		if (!account) throw new Error('Account not found');
		for (const id of new Set(transactionIds)) {
			const t = db.query('SELECT account_id,currency FROM transactions WHERE id=?').get(id) as {
				account_id: string | null;
				currency: string | null;
			} | null;
			if (!t || t.account_id) throw new Error('Only unassigned transactions can be assigned');
			if (currencyCode(t.currency) !== 'UNKNOWN' && currencyCode(t.currency) !== account.currency)
				throw new Error('Transaction currency does not match the account');
			db.query('UPDATE transactions SET account_id=?,currency=? WHERE id=?').run(
				accountId,
				account.currency,
				id,
			);
		}
		return { assigned: new Set(transactionIds).size };
	})();
}
