import { beforeEach, afterEach, describe, it, expect } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import {
	createAccount,
	commitImport,
	previewImport,
	undoImport,
	listAccounts,
	matchTransfer,
	unmatchTransfer,
	reconcileAccount,
} from '../../src/lib/ledger-service';
import { currencySummaries } from '../../src/lib/currency-report';
import { parseCSV } from '../../src/lib/csv-parser';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
let manager: SQLiteConnectionManager;
beforeEach(async () => {
	manager = new SQLiteConnectionManager({ filename: ':memory:' });
	await manager.initialize();
	await manager.runMigrations();
});
afterEach(() => manager.close());
function account(name = 'Bank', currency = 'NOK') {
	return createAccount(manager.getConnection(), {
		name,
		currency,
		openingDate: '2026-01-01',
		openingBalance: 1000,
	});
}
const csv =
	'Bokføringsdato;Beløp;Tittel;Valuta\n2026/10/01;-25,00;Synthetic coffee;NOK\n2026/10/01;-25,00;Synthetic coffee;NOK';
describe('account-aware reversible imports', () => {
	it('previews without saving, preserves repeated purchases, skips overlapping statements and allows explicit duplicate override', () => {
		const db = manager.getConnection(),
			a = account();
		expect(previewImport(db, csv, { accountId: a.id }).rows).toHaveLength(2);
		expect(db.query('SELECT * FROM transactions').all()).toHaveLength(0);
		expect(commitImport(db, csv, 'synthetic.csv', { accountId: a.id }).created).toBe(2);
		expect(listAccounts(db)[0].balance).toBe(950);
		expect(commitImport(db, csv, 'overlap.csv', { accountId: a.id }).created).toBe(0);
		expect(
			commitImport(db, csv, 'override.csv', { accountId: a.id, keepDuplicates: [1] }).created,
		).toBe(1);
	});
	it('keeps identical payments in different accounts and supports atomic undo', () => {
		const db = manager.getConnection(),
			a = account(),
			b = account('Second');
		const first = commitImport(db, csv, 'first.csv', { accountId: a.id });
		commitImport(db, csv, 'second.csv', { accountId: b.id });
		undoImport(db, first.id);
		expect(db.query('SELECT * FROM transactions').all()).toHaveLength(2);
		expect(() => undoImport(db, first.id)).toThrow();
		expect(commitImport(db, csv, 'again.csv', { accountId: a.id }).created).toBe(2);
	});
	it('rejects mixed currency and malformed mapping without partial writes', () => {
		const db = manager.getConnection(),
			a = account();
		expect(() =>
			commitImport(db, csv.replaceAll('NOK', 'USD'), 'bad.csv', { accountId: a.id }),
		).toThrow();
		expect(db.query('SELECT * FROM import_batches').all()).toHaveLength(0);
		expect(() =>
			previewImport(db, csv, { accountId: a.id, columns: { date: -1, description: 2, amount: 1 } }),
		).toThrow();
	});
	it('supports custom columns, rejected rows and explicit exclusion', () => {
		const db = manager.getConnection(),
			a = account();
		const text = 'When;Details;Sum\n01.10.2026;Shop;-20\n31.02.2026;Bad;-30\n02.10.2026;Skip;-40';
		const options = {
			accountId: a.id,
			columns: { date: 0, description: 1, amount: 2 },
			excludeRows: [2],
			acceptErrors: true,
		};
		const preview = previewImport(db, text, options);
		expect(preview.errors).toHaveLength(1);
		expect(commitImport(db, text, 'mapped.csv', options).created).toBe(1);
	});
	it('parses quoted multiline Norwegian descriptions and rejects malformed amounts/dates', () => {
		expect(
			parseCSV('Date,Description,Amount\n2026-10-01,"Line one\nLine two",-10').transactions,
		).toHaveLength(1);
		expect(
			parseCSV('Date,Description,Amount\n2026-02-31,Invalid,-10\n2026-10-01,Invalid,12.3.4').errors,
		).toHaveLength(2);
	});
	it('matches only equal opposite cross-account payments and restores types when an import is undone', () => {
		const db = manager.getConnection(),
			a = account(),
			b = account('Savings');
		const out = commitImport(db, 'Date,Description,Amount\n2026-10-01,Move,-100', 'out.csv', {
			accountId: a.id,
		});
		commitImport(db, 'Date,Description,Amount\n2026-10-02,Move,100', 'in.csv', { accountId: b.id });
		const rows = db.query('SELECT id,amount FROM transactions ORDER BY amount').all() as {
			id: string;
			amount: number;
		}[];
		const m = matchTransfer(db, rows[0].id, rows[1].id);
		expect(db.query("SELECT * FROM transactions WHERE type='transfer'").all()).toHaveLength(2);
		unmatchTransfer(db, m.id);
		expect(() => matchTransfer(db, rows[1].id, rows[0].id)).toThrow();
		matchTransfer(db, rows[0].id, rows[1].id);
		undoImport(db, out.id);
		expect(db.query('SELECT type FROM transactions').get()).toEqual({ type: 'income' });
	});
	it('reconciles as-of balances without counting later payments', () => {
		const db = manager.getConnection(),
			a = account();
		commitImport(
			db,
			'Date,Description,Amount\n2026-10-01,First,-100\n2026-10-03,Later,-200',
			'dates.csv',
			{ accountId: a.id },
		);
		expect(reconcileAccount(db, a.id, '2026-10-01', 900).difference).toBe(0);
		expect(reconcileAccount(db, a.id, '2026-10-03', 900).difference).toBe(200);
	});
	it('keeps known and unknown currency summaries separate and preserves currency in date-range queries', async () => {
		const repo = new SQLiteTransactionRepository(manager);
		await repo.initialize();
		for (const currency of ['NOK', 'USD', undefined])
			await repo.create({
				date: new Date('2026-10-01'),
				description: 'Same',
				amount: -10,
				type: 'expense',
				currency,
			});
		const rows = await repo.findByDateRange(new Date('2026-01-01'), new Date('2027-01-01'));
		expect(currencySummaries(rows).map((g) => g.currency)).toEqual(['NOK', 'UNKNOWN', 'USD']);
		expect(currencySummaries(rows).every((g) => g.totalExpenses === 10)).toBe(true);
	});
});
