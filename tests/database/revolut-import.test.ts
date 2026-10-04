import { afterEach, beforeEach, expect, it } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import {
	createAccount,
	previewImport,
	commitImport,
	undoImport,
	listAccounts,
	importHistory,
} from '../../src/lib/ledger-service';
let manager: SQLiteConnectionManager;
beforeEach(async () => {
	manager = new SQLiteConnectionManager({ filename: ':memory:' });
	await manager.initialize();
	await manager.runMigrations();
});
afterEach(async () => manager.close());
const header =
	'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';
const csv = `${header}
Deposit,Current,2026-10-01 09:00:00,2026-10-01 09:00:01,Synthetic funding,100,0,NOK,COMPLETED,100
Card Payment,Current,2026-10-01 10:00:00,2026-10-01 10:01:00,Synthetic shop,-20,0,NOK,COMPLETED,80
Card Payment,Current,2026-10-01 11:00:00,,Synthetic pending,-5,0,NOK,PENDING,
Card Payment,Current,2026-10-01 12:00:00,,Synthetic reversal,-7,0,NOK,REVERTED,
Transfer,Savings,2026-10-01 13:00:00,2026-10-01 13:00:01,Synthetic savings,10,0,NOK,COMPLETED,10`;
it('requires product selection, preserves account balances, is idempotent and reverses its own batch', () => {
	const db = manager.getConnection(),
		account = createAccount(db, {
			name: 'Current test',
			currency: 'NOK',
			openingDate: '2026-10-01',
		}),
		options = { accountId: account.id, revolutProduct: 'Current' };
	expect(previewImport(db, csv, { accountId: account.id }).requiresProductSelection).toBe(true);
	expect(() =>
		commitImport(db, csv, 'synthetic.csv', { accountId: account.id, acceptErrors: true }),
	).toThrow('Choose one Revolut product');
	const preview = previewImport(db, csv, options);
	expect(preview.rows).toHaveLength(2);
	expect(preview.skippedRows).toHaveLength(3);
	expect(preview.errors).toHaveLength(0);
	const first = commitImport(db, csv, 'synthetic.csv', options);
	expect(first.created).toBe(2);
	expect(first.skipped).toBe(3);
	expect(listAccounts(db)[0].balance).toBe(80);
	const repeat = commitImport(db, csv, 'renamed.csv', options);
	expect(repeat.created).toBe(0);
	expect(listAccounts(db)[0].balance).toBe(80);
	undoImport(db, repeat.id);
	expect(listAccounts(db)[0].balance).toBe(80);
	undoImport(db, first.id);
	expect(listAccounts(db)[0].balance).toBe(0);
	expect((importHistory(db) as { errors_json: string }[])[0].errors_json).toContain('PENDING');
	expect(commitImport(db, csv, 'again.csv', options).created).toBe(2);
});
it('does not merge different completion times and recognizes reordered overlapping statement exports', () => {
	const db = manager.getConnection(),
		account = createAccount(db, {
			name: 'Timestamp test',
			currency: 'NOK',
			openingDate: '2026-10-01',
		});
	const a =
		'Card Payment,Current,2026-10-01 10:00:00,2026-10-02 10:00:00,Repeat shop,-10,0,NOK,COMPLETED,90';
	const b =
		'Card Payment,Current,2026-10-01 11:00:00,2026-10-02 11:00:00,Repeat shop,-10,0,NOK,COMPLETED,80';
	expect(
		commitImport(db, `${header}\n${a}\n${b}`, 'synthetic.csv', { accountId: account.id }).created,
	).toBe(2);
	expect(
		commitImport(db, `${header}\n${b}`, 'overlap.csv', { accountId: account.id }).created,
	).toBe(0);
	expect(listAccounts(db)[0].balance).toBe(-20);
});
it('retains the currency/account guard and explicit fee decisions on commit', () => {
	const db = manager.getConnection(),
		account = createAccount(db, { name: 'Guard', currency: 'EUR', openingDate: '2026-10-01' });
	expect(() =>
		commitImport(db, csv, 'synthetic.csv', { accountId: account.id, revolutProduct: 'Current' }),
	).toThrow('currency');
	const nok = createAccount(db, { name: 'NOK fee', currency: 'NOK', openingDate: '2026-10-01' });
	const fee = `${header}\nCard Payment,Current,2026-10-01 10:00:00,2026-10-02 10:00:00,Fee purchase,-10,1,NOK,COMPLETED,89`;
	expect(() => commitImport(db, fee, 'synthetic.csv', { accountId: nok.id })).toThrow(
		'Review rejected',
	);
	expect(
		commitImport(db, fee, 'synthetic.csv', { accountId: nok.id, revolutFeeMode: 'deduct' }).created,
	).toBe(1);
	expect(listAccounts(db).find((a) => a.id === nok.id)?.balance).toBe(-11);
});

it('keeps source identity stable across fee interpretation changes and rejects coerced fee options', () => {
	const db = manager.getConnection(),
		account = createAccount(db, { name: 'Fees', currency: 'NOK', openingDate: '2026-10-01' });
	const fee = `${header}\nCard Payment,Current,2026-10-01 10:00:00,2026-10-02 10:00:00,Fee purchase,-10,1,NOK,COMPLETED,89`;
	commitImport(db, fee, 'fees.csv', { accountId: account.id, revolutFeeMode: 'deduct' });
	expect(
		previewImport(db, fee, { accountId: account.id, revolutFeeMode: 'included' }).rows[0].duplicate,
	).toBe(true);
	expect(
		commitImport(db, fee, 'fees.csv', { accountId: account.id, revolutFeeMode: 'included' })
			.created,
	).toBe(0);
	expect(() =>
		commitImport(db, fee, 'fees.csv', {
			accountId: account.id,
			revolutFeeMode: ['deduct'] as unknown as 'deduct',
		}),
	).toThrow('fee handling');
});
