import { beforeEach, afterEach, it, expect } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import {
	createAccount,
	commitImport,
	previewImport,
	detectTransfers,
	listAccounts,
	unmatchTransfer,
	undoImport,
	transferCandidates,
} from '../../src/lib/ledger-service';
import {
	setTransferClassification,
	listTransferRules,
	deleteTransferRule,
	transferDecision,
} from '../../src/lib/transfer-classification';
import { getEffectiveTransactions, setAllocations } from '../../src/lib/transaction-ledger';
import { currencySummaries } from '../../src/lib/currency-report';
let manager: SQLiteConnectionManager;
beforeEach(async () => {
	manager = new SQLiteConnectionManager({ filename: ':memory:' });
	await manager.initialize();
	await manager.runMigrations();
});
afterEach(() => manager.close());
const header =
	'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';
function bank(name = 'Bank', currency = 'NOK') {
	return createAccount(manager.getConnection(), { name, currency, openingDate: '2026-01-01' });
}
function rev(description: string, amount: number, type = 'Transfer', day = '2026-05-01', fee = 0) {
	return `${type},Current,${day} 18:00:00,${day} 18:00:00,${description},${amount},${fee},NOK,COMPLETED,0`;
}
function rows() {
	return manager.getConnection().query('SELECT * FROM transactions ORDER BY amount').all() as {
		id: string;
		type: string;
		description: string;
		amount: number;
	}[];
}
it('excludes pockets and fee-free exchanges, preserves purchases, third-party transfers, fees and account balances', async () => {
	const db = manager.getConnection(),
		a = bank('Revolut');
	const csv = [
		header,
		rev('To pocket NOK Rainy day from NOK', -100),
		rev('Pocket Withdrawal', 25),
		rev('Exchanged to AUD', -50, 'Exchange'),
		rev('Transfer to Someone', -20),
		rev('Shop', -10, 'Card Payment'),
		rev('Exchanged to EUR', -30, 'Exchange', '2026-05-02', 1),
	].join('\n');
	const options = { accountId: a.id, revolutFeeMode: 'deduct' as const };
	expect(
		previewImport(db, csv, options).rows.filter((r) => r.transaction.type === 'transfer'),
	).toHaveLength(3);
	const result = commitImport(db, csv, 'synthetic.csv', options);
	expect(result.detection.classified).toBe(3);
	expect(listAccounts(db)[0].balance).toBe(-186);
	expect(currencySummaries(await getEffectiveTransactions(db))[0]).toMatchObject({
		totalIncome: 0,
		totalExpenses: 61,
	});
	expect(detectTransfers(db)).toEqual({ classified: 0, matched: 0 });
});
it('matches unambiguous top-ups in either import order using calendar days, and undo restores the surviving side', () => {
	for (const order of [0, 1]) {
		const db = manager.getConnection(),
			n = bank('Nordea'),
			r = bank('Revolut');
		const imports = [
			() =>
				commitImport(db, 'Date,Description,Amount\n2026-05-04,Revolut**1234*,-2000', 'bank.csv', {
					accountId: n.id,
				}),
			() =>
				commitImport(db, [header, rev('Top-up by *1234', 2000, 'Deposit')].join('\n'), 'rev.csv', {
					accountId: r.id,
				}),
		];
		imports[order]();
		const last = imports[1 - order]();
		expect(last.detection.matched).toBe(1);
		expect(rows().filter((t) => t.type === 'transfer')).toHaveLength(2);
		undoImport(db, last.id);
		expect(rows().filter((t) => t.type === 'transfer')).toHaveLength(0);
		db.query('DELETE FROM transactions').run();
	}
});
it('leaves ambiguous amounts and unrelated same-amount payments for review', () => {
	const db = manager.getConnection(),
		n = bank('Nordea'),
		r = bank('Revolut');
	commitImport(
		db,
		'Date,Description,Amount\n2026-05-01,Revolut**1234*,-2000\n2026-05-02,Revolut**1234*,-2000\n2026-05-03,Shop,-100',
		'bank.csv',
		{ accountId: n.id },
	);
	commitImport(
		db,
		[header, rev('Top-up by *1234', 2000, 'Deposit'), rev('Salary', 100, 'Deposit')].join('\n'),
		'rev.csv',
		{ accountId: r.id },
	);
	expect(db.query('SELECT * FROM transfer_matches').all()).toHaveLength(0);
	expect(transferCandidates(db)).toHaveLength(3);
});
it('remembers exact account/currency/direction rules, applies history, preserves manual exceptions and supports forgetting', () => {
	const db = manager.getConnection(),
		a = bank(),
		other = bank('Other');
	const csv =
		'Date,Description,Amount\n2026-05-01,Own savings,-100\n2026-05-02,Own savings,-150\n2026-05-03,Own savings,50\n2026-05-04,Own savings extra,-10';
	commitImport(db, csv, 'bank.csv', { accountId: a.id });
	commitImport(db, csv, 'other.csv', { accountId: other.id });
	const original = rows().filter((t) => t.amount === -100)[0];
	expect(
		setTransferClassification(db, {
			id: original.id,
			decision: 'transfer',
			remember: true,
			applyHistory: true,
		}).changed,
	).toBe(2);
	expect(rows().filter((t) => t.type === 'transfer')).toHaveLength(2);
	const rule = listTransferRules(db)[0];
	commitImport(db, 'Date,Description,Amount\n2026-05-07,  own savings  ,-55', 'new.csv', {
		accountId: a.id,
	});
	const last = rows().find((t) => t.amount === -55)!;
	expect(last.type).toBe('transfer');
	setTransferClassification(db, { id: last.id, decision: 'cashflow' });
	detectTransfers(db);
	expect(rows().find((t) => t.id === last.id)?.type).toBe('expense');
	setTransferClassification(db, { id: original.id, decision: 'transfer', applyHistory: true });
	expect(rows().find((t) => t.id === last.id)?.type).toBe('expense');
	deleteTransferRule(db, rule.id);
	expect(listTransferRules(db)).toHaveLength(0);
	commitImport(db, 'Date,Description,Amount\n2026-05-08,Own savings,-45', 'later.csv', {
		accountId: a.id,
	});
	expect(rows().find((t) => t.amount === -45)?.type).toBe('expense');
});
it('a rejected match stays rejected after another scan or overlapping import', () => {
	const db = manager.getConnection(),
		n = bank(),
		r = bank('Revolut');
	commitImport(db, 'Date,Description,Amount\n2026-05-01,Revolut**1234*,-2000', 'n.csv', {
		accountId: n.id,
	});
	const csv = [header, rev('Top-up by *1234', 2000, 'Deposit')].join('\n');
	commitImport(db, csv, 'r.csv', { accountId: r.id });
	const match = db.query('SELECT id FROM transfer_matches').get() as { id: string };
	unmatchTransfer(db, match.id, true);
	expect(detectTransfers(db).matched).toBe(0);
	expect(commitImport(db, csv, 'again.csv', { accountId: r.id }).created).toBe(0);
	expect(rows().map((t) => t.type)).toEqual(['expense', 'income']);
});
it('backfills source evidence on overlapping imports and respects type edits made in the existing editor', async () => {
	const db = manager.getConnection(),
		a = bank('Revolut');
	const csv = [header, rev('Pocket Withdrawal', 100)].join('\n');
	commitImport(db, csv, 'r.csv', { accountId: a.id });
	const id = rows()[0].id;
	db.query('DELETE FROM transfer_decisions').run();
	db.query(
		"UPDATE transactions SET type='income',source_format=NULL,source_type=NULL,source_fee=NULL",
	).run();
	expect(detectTransfers(db).classified).toBe(1);
	const repo = new SQLiteTransactionRepository(manager);
	await repo.initialize();
	await repo.update(id, { type: 'income' });
	expect(transferDecision(db, id)?.origin).toBe('manual');
	commitImport(db, csv, 'again.csv', { accountId: a.id });
	expect(rows()[0].type).toBe('income');
	expect(db.query('SELECT source_type FROM transactions').get()).toEqual({
		source_type: 'Transfer',
	});
});
it('refuses manual changes to split purchases and automatic scanning skips them', () => {
	const db = manager.getConnection(),
		a = bank();
	commitImport(db, 'Date,Description,Amount\n2026-05-01,Split,-100', 'n.csv', { accountId: a.id });
	const categories = db.query('SELECT id FROM categories LIMIT 2').all() as { id: string }[];
	const id = rows()[0].id;
	setAllocations(
		db,
		id,
		categories.map((c) => ({ categoryId: c.id, amount: 50 })),
	);
	expect(() => setTransferClassification(db, { id, decision: 'transfer', remember: true })).toThrow(
		'splits',
	);
	expect(listTransferRules(db)).toHaveLength(0);
	expect(detectTransfers(db).classified).toBe(0);
});
it('a remembered cash-flow exception overrides built-in detection on future imports', () => {
	const db = manager.getConnection(),
		a = bank('Revolut');
	commitImport(db, [header, rev('Pocket Withdrawal', 100)].join('\n'), 'r.csv', {
		accountId: a.id,
	});
	setTransferClassification(db, { id: rows()[0].id, decision: 'cashflow', remember: true });
	const next = [header, rev('Pocket Withdrawal', 50, 'Transfer', '2026-05-10')].join('\n');
	expect(previewImport(db, next, { accountId: a.id }).rows[0].transaction.type).toBe('income');
	commitImport(db, next, 'again.csv', { accountId: a.id });
	expect(rows().every((t) => t.type === 'income')).toBe(true);
	expect(transferDecision(db, rows()[0].id)?.origin).toBe('rule');
});
