import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { MigrationRunner } from '../../src/lib/database/migrations';
import {
	getEffectiveTransactions,
	linkRefund,
	setAllocations,
} from '../../src/lib/transaction-ledger';
import { applyReview, reviewInbox, undoReview } from '../../src/lib/review-service';
import { monthlyOverview } from '../../src/lib/overview-service';
let db: Database;
beforeEach(async () => {
	db = new Database(':memory:');
	db.exec('PRAGMA foreign_keys=ON');
	await new MigrationRunner(db).runPendingMigrations();
});
afterEach(() => db.close());
function transaction(
	id: string,
	amount: number,
	category: string | null = null,
	currency: string | null = 'NOK',
	date = '2026-10-02',
	description = 'SYNTHETIC SHOP',
) {
	db.query(
		'INSERT INTO transactions(id,date,description,amount,type,category_id,currency,source_key) VALUES(?,?,?,?,?,?,?,?)',
	).run(
		id,
		date,
		description,
		amount,
		amount > 0 ? 'income' : 'expense',
		category,
		currency,
		'synthetic:' + id,
	);
}
describe('split purchases and refund ledger', () => {
	it('allocates a purchase exactly and apportions refund expenses rather than income', async () => {
		transaction('purchase', -100, 'cat_shopping');
		transaction('receipt', 40, null, 'NOK', '2026-10-03');
		setAllocations(db, 'purchase', [
			{ categoryId: 'cat_groceries', amount: 75 },
			{ categoryId: 'cat_shopping', amount: 25 },
		]);
		linkRefund(db, 'receipt', 'purchase', 'refund');
		const ledger = await getEffectiveTransactions(db);
		expect(ledger.reduce((sum, t) => sum - t.amount, 0)).toBe(60);
		expect(ledger.filter((t) => t.type === 'income')).toHaveLength(0);
		expect(
			ledger.filter((t) => t.categoryId === 'cat_groceries').reduce((sum, t) => sum - t.amount, 0),
		).toBe(45);
		const report = monthlyOverview(db, '2026-10');
		expect(report.totals[0]).toMatchObject({ income: 0, expenses: 60, net: -60, count: 2 });
		expect(report.categories.find((c) => c.categoryId === 'cat_shopping')?.amount).toBe(15);
	});

	it('apportions refund cents so rounded categories always reconcile with the receipt', async () => {
		transaction('purchase', -0.03, 'cat_shopping');
		transaction('receipt', 0.01, null, 'NOK', '2026-10-03');
		setAllocations(db, 'purchase', [
			{ categoryId: 'cat_groceries', amount: 0.01 },
			{ categoryId: 'cat_shopping', amount: 0.01 },
			{ categoryId: 'cat_entertainment', amount: 0.01 },
		]);
		linkRefund(db, 'receipt', 'purchase', 'refund');
		const report = monthlyOverview(db, '2026-10');
		expect(report.totals[0].expenses).toBe(0.02);
		expect(Math.round(report.categories.reduce((sum, row) => sum + row.amount, 0) * 100)).toBe(2);
		const receipt = (await getEffectiveTransactions(db)).filter((t) => t.id === 'receipt');
		expect(receipt.map((t) => t.amount).sort()).toEqual([0, 0, 0.01]);
		transaction('remainder', 0.02, null, 'NOK', '2026-10-04');
		linkRefund(db, 'remainder', 'purchase', 'refund');
		const fullyRefunded = monthlyOverview(db, '2026-10');
		expect(fullyRefunded.totals[0].expenses).toBe(0);
		expect(fullyRefunded.categories.every((category) => category.amount === 0)).toBe(true);
		expect(
			Math.round(fullyRefunded.categories.reduce((sum, row) => sum + row.amount, 0) * 100),
		).toBe(0);
	});
	it('allocates indivisible refunds by largest remainder and deterministic category order', async () => {
		transaction('purchase', -10, 'cat_shopping');
		transaction('receipt', 1, null, 'NOK', '2026-10-03');
		setAllocations(db, 'purchase', [
			{ categoryId: 'cat_groceries', amount: 3.33 },
			{ categoryId: 'cat_shopping', amount: 6.67 },
		]);
		linkRefund(db, 'receipt', 'purchase', 'refund');
		const receipt = (await getEffectiveTransactions(db)).filter((t) => t.id === 'receipt');
		expect(receipt.find((t) => t.categoryId === 'cat_groceries')?.amount).toBe(0.33);
		expect(receipt.find((t) => t.categoryId === 'cat_shopping')?.amount).toBe(0.67);
	});
	it('deducts refunds in the receipt month and keeps currencies separate', () => {
		transaction('purchase', -100, 'cat_shopping', 'NOK', '2026-09-30');
		transaction('refund', 40, null, 'NOK');
		transaction('usd', -900, null, 'USD');
		transaction('unknown', -12, null, null);
		linkRefund(db, 'refund', 'purchase', 'reimbursement');
		expect(monthlyOverview(db, '2026-10').totals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ currency: 'NOK', income: 0, expenses: -40 }),
				expect.objectContaining({ currency: 'USD', expenses: 900 }),
				expect.objectContaining({ currency: 'UNKNOWN', expenses: 12 }),
			]),
		);
	});
	it('rejects invalid allocations atomically', () => {
		transaction('purchase', -100);
		setAllocations(db, 'purchase', [
			{ categoryId: 'cat_groceries', amount: 50 },
			{ categoryId: 'cat_shopping', amount: 50 },
		]);
		for (const allocations of [
			[
				{ categoryId: 'cat_groceries', amount: 40 },
				{ categoryId: 'cat_shopping', amount: 50 },
			],
			[
				{ categoryId: 'cat_groceries', amount: 50 },
				{ categoryId: 'cat_groceries', amount: 50 },
			],
			[
				{ categoryId: 'missing', amount: 50 },
				{ categoryId: 'cat_groceries', amount: 50 },
			],
			[
				{ categoryId: 'cat_shopping', amount: 0.001 },
				{ categoryId: 'cat_groceries', amount: 99.999 },
			],
		])
			expect(() => setAllocations(db, 'purchase', allocations)).toThrow();
		expect(db.query('SELECT * FROM transaction_allocations').all()).toHaveLength(2);
		expect(() => db.query('UPDATE transactions SET amount=-50 WHERE id=?').run('purchase')).toThrow(
			'Remove splits',
		);
	});
	it('rejects currency mismatches, earlier receipts, expense receipts and excessive cumulative refunds', () => {
		transaction('purchase', -100);
		transaction('usd', 25, null, 'USD');
		transaction('early', 25, null, 'NOK', '2026-10-01');
		transaction('first', 75);
		transaction('second', 30);
		expect(() => linkRefund(db, 'usd', 'purchase', 'refund')).toThrow('currency');
		expect(() => linkRefund(db, 'early', 'purchase', 'refund')).toThrow('precede');
		expect(() => linkRefund(db, 'purchase', 'purchase', 'refund')).toThrow('positive receipt');
		linkRefund(db, 'first', 'purchase', 'refund');
		expect(() => linkRefund(db, 'second', 'purchase', 'reimbursement')).toThrow('exceed');
		expect(() => db.query("UPDATE transactions SET currency='EUR' WHERE id='first'").run()).toThrow(
			'Remove splits',
		);
	});
	it('cascades links on deletion and restores original income reporting', async () => {
		transaction('purchase', -100);
		transaction('refund', 50);
		linkRefund(db, 'refund', 'purchase', 'refund');
		db.query('DELETE FROM transactions WHERE id=?').run('purchase');
		expect((await getEffectiveTransactions(db))[0].type).toBe('income');
	});
});
describe('monthly merchant review', () => {
	it('groups merchants by currency and scopes months', () => {
		transaction('a', -10);
		transaction('b', -15);
		transaction('c', -20, null, 'USD');
		transaction('old', -10, null, 'NOK', '2026-09-01');
		const inbox = reviewInbox(db, '2026-10');
		expect(inbox.total).toBe(3);
		expect(inbox.groups).toHaveLength(2);
		expect(inbox.groups[0].ids).toHaveLength(2);
		expect(() => reviewInbox(db, '2026-13')).toThrow();
	});
	it('applies historical merchant rules and undoes both categorization and rule creation', () => {
		transaction('new', -20);
		transaction('old', -30, 'cat_shopping', 'NOK', '2026-09-01');
		transaction('different', -40, null, 'NOK', '2026-10-01', 'DIFFERENT');
		const action = applyReview(db, {
			ids: ['new'],
			categoryId: 'cat_groceries',
			pattern: 'synthetic shop',
			applyHistory: true,
			createRule: true,
		});
		expect(action.count).toBe(2);
		expect(reviewInbox(db).total).toBe(1);
		expect(db.query("SELECT * FROM category_rules WHERE created_by='user'").all()).toHaveLength(1);
		undoReview(db, action.id);
		expect(db.query("SELECT category_id FROM transactions WHERE id='old'").get()).toEqual({
			category_id: 'cat_shopping',
		});
		expect(db.query("SELECT * FROM category_rules WHERE created_by='user'").all()).toHaveLength(0);
		expect(() => undoReview(db, action.id)).toThrow('already undone');
	});
	it('refuses stale undo and skips historical split purchases', () => {
		transaction('a', -100);
		transaction('split', -100);
		setAllocations(db, 'split', [
			{ categoryId: 'cat_shopping', amount: 50 },
			{ categoryId: 'cat_groceries', amount: 50 },
		]);
		const action = applyReview(db, {
			ids: ['a'],
			categoryId: 'cat_groceries',
			pattern: 'synthetic',
			applyHistory: true,
		});
		expect(action.count).toBe(1);
		db.query("UPDATE transactions SET category_id='cat_shopping' WHERE id='a'").run();
		expect(() => undoReview(db, action.id)).toThrow('changed after');
	});
	it('requires undoing later overlapping reviews even if their category is unchanged', () => {
		transaction('a', -100);
		const first = applyReview(db, { ids: ['a'], categoryId: 'cat_groceries' });
		const second = applyReview(db, { ids: ['a'], categoryId: 'cat_groceries' });
		expect(() => undoReview(db, first.id)).toThrow('later changes');
		undoReview(db, second.id);
		undoReview(db, first.id);
		expect(reviewInbox(db).total).toBe(1);
	});
	it('identifies possible duplicates without merging currencies or deleting transactions', () => {
		transaction('a', -10);
		transaction('b', -10);
		transaction('c', -10, null, 'USD');
		expect(reviewInbox(db).duplicates).toHaveLength(1);
		expect(db.query('SELECT id FROM transactions').all()).toHaveLength(3);
	});
});
