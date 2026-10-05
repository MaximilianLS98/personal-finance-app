import type { Database } from 'bun:sqlite';
import { financeDb } from './finance-db';
import { currencyCode } from './money';
import type { Transaction } from './types';
import { transferDecision } from './transfer-classification';

export interface LedgerRow {
	id: string;
	date: string;
	description: string;
	amount: number;
	type: Transaction['type'];
	currency: string | null;
	category_id: string | null;
	account_id: string | null;
}
export interface Allocation {
	categoryId: string;
	amount: number;
}
const cents = (value: number) => Math.round(value * 100);
export async function getEffectiveTransactions(database?: Database): Promise<Transaction[]> {
	const db = database ?? (await financeDb());
	return (
		db.query('SELECT * FROM effective_transactions ORDER BY date,id').all() as LedgerRow[]
	).map((row) => ({
		id: row.id,
		date: new Date(row.date),
		description: row.description,
		amount: row.amount,
		type: row.type,
		currency: currencyCode(row.currency),
		categoryId: row.category_id ?? undefined,
	}));
}
export function setAllocations(db: Database, id: string, allocations: Allocation[]) {
	return db.transaction(() => {
		const row = db.query('SELECT * FROM transactions WHERE id=?').get(id) as LedgerRow | null;
		if (!row) throw new Error('Transaction not found');
		if (row.type !== 'expense' || row.amount >= 0) throw new Error('Only purchases can be split');
		if (!Array.isArray(allocations) || allocations.length > 30)
			throw new Error('Provide up to 30 allocations');
		if (
			allocations.length &&
			(allocations.length < 2 ||
				new Set(allocations.map((a) => a.categoryId)).size !== allocations.length ||
				allocations.some(
					(a) =>
						!Number.isFinite(a.amount) ||
						a.amount <= 0 ||
						Math.abs(a.amount * 100 - cents(a.amount)) > 0.00001,
				) ||
				allocations.reduce((sum, a) => sum + cents(a.amount), 0) !== cents(-row.amount))
		)
			throw new Error(
				'Use distinct categories and positive amounts that add up exactly to the purchase',
			);
		for (const a of allocations)
			if (!db.query('SELECT 1 FROM categories WHERE id=? AND is_active=1').get(a.categoryId))
				throw new Error('Category not found');
		db.query('DELETE FROM transaction_allocations WHERE transaction_id=?').run(id);
		for (const a of allocations)
			db.query('INSERT INTO transaction_allocations VALUES(?,?,?)').run(id, a.categoryId, a.amount);
	})();
}
export function linkRefund(
	db: Database,
	refundId: string,
	purchaseId: string,
	kind: 'refund' | 'reimbursement',
) {
	return db.transaction(() => {
		if (!['refund', 'reimbursement'].includes(kind))
			throw new Error('Choose refund or reimbursement');
		const refund = db
			.query('SELECT * FROM transactions WHERE id=?')
			.get(refundId) as LedgerRow | null;
		const purchase = db
			.query('SELECT * FROM transactions WHERE id=?')
			.get(purchaseId) as LedgerRow | null;
		if (
			!refund ||
			!purchase ||
			refund.type !== 'income' ||
			refund.amount <= 0 ||
			purchase.type !== 'expense' ||
			purchase.amount >= 0
		)
			throw new Error('Link a positive receipt to an expense purchase');
		if (currencyCode(refund.currency) !== currencyCode(purchase.currency))
			throw new Error('Receipt and purchase must use the same currency');
		if (refund.date.slice(0, 10) < purchase.date.slice(0, 10))
			throw new Error('Receipt cannot precede its purchase');
		const linked = db
			.query(
				'SELECT COALESCE(SUM(t.amount),0) amount FROM refund_links r JOIN transactions t ON t.id=r.refund_id WHERE r.purchase_id=? AND r.refund_id!=?',
			)
			.get(purchaseId, refundId) as { amount: number };
		if (cents(linked.amount + refund.amount) > cents(-purchase.amount))
			throw new Error('Total refunds cannot exceed the original purchase');
		db.query(
			'INSERT INTO refund_links(refund_id,purchase_id,kind) VALUES(?,?,?) ON CONFLICT(refund_id) DO UPDATE SET purchase_id=excluded.purchase_id,kind=excluded.kind',
		).run(refundId, purchaseId, kind);
	})();
}
export function transactionDetails(db: Database, id: string) {
	const transaction = db.query('SELECT * FROM transactions WHERE id=?').get(id) as LedgerRow | null;
	if (!transaction) throw new Error('Transaction not found');
	return {
		transaction,
		account: transaction.account_id
			? (db.query('SELECT name FROM accounts WHERE id=?').get(transaction.account_id) as {
					name: string;
				} | null)
			: null,
		transferDecision: transferDecision(db, id),
		transferMatch: db
			.query('SELECT id FROM transfer_matches WHERE outgoing_id=? OR incoming_id=?')
			.get(id, id) as { id: string } | null,
		allocations: db
			.query(
				'SELECT category_id categoryId,amount FROM transaction_allocations WHERE transaction_id=?',
			)
			.all(id) as Allocation[],
		refund: db
			.query(
				'SELECT r.*,p.description purchase_description FROM refund_links r JOIN transactions p ON p.id=r.purchase_id WHERE refund_id=?',
			)
			.get(id),
		receipts: db
			.query(
				'SELECT r.*,t.amount,t.description FROM refund_links r JOIN transactions t ON t.id=r.refund_id WHERE purchase_id=?',
			)
			.all(id),
		purchases:
			transaction.amount > 0
				? db
						.query(
							"SELECT id,date,description,amount FROM transactions WHERE type='expense' AND amount<0 AND COALESCE(currency,'UNKNOWN')=? AND substr(date,1,10)<=? ORDER BY date DESC",
						)
						.all(currencyCode(transaction.currency), transaction.date.slice(0, 10))
				: [],
	};
}
