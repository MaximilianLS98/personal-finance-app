import type { Database } from 'bun:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import Papa from 'papaparse';
import { parseCSV, type ParseOptions } from './csv-parser';
import { money, validCurrency } from './money';

export interface Account {
	id: string;
	name: string;
	currency: string;
	kind: 'bank' | 'credit' | 'cash';
	opening_balance: number;
	opening_date: string;
	balance: number;
}
export interface ImportOptions {
	revolutProduct?: string;
	revolutFeeMode?: ParseOptions['revolutFeeMode'];
	accountId: string;
	acceptErrors?: boolean;
	currency?: string;
	columns?: ParseOptions['columns'];
	keepDuplicates?: number[];
	excludeRows?: number[];
}
export function listAccounts(db: Database): Account[] {
	return db
		.query(
			`SELECT a.*, a.opening_balance + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id=a.id AND t.date >= a.opening_date),0) AS balance FROM accounts a ORDER BY a.name`,
		)
		.all() as Account[];
}
function validDate(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		Number.isFinite(Date.parse(value)) &&
		new Date(value).toISOString().slice(0, 10) === value
	);
}
function validateImportOptions(value: unknown): asserts value is ImportOptions {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Provide import options');
	const options = value as Record<string, unknown>;
	if (typeof options.accountId !== 'string' || !options.accountId)
		throw new Error('Select an existing account');
	if (
		options.revolutFeeMode !== undefined &&
		(typeof options.revolutFeeMode !== 'string' ||
			!['deduct', 'included'].includes(options.revolutFeeMode))
	)
		throw new Error('Choose valid Revolut fee handling');
	if (
		options.revolutProduct !== undefined &&
		(typeof options.revolutProduct !== 'string' ||
			!options.revolutProduct.trim() ||
			options.revolutProduct.length > 100)
	)
		throw new Error('Choose a valid Revolut product');
	if (options.acceptErrors !== undefined && typeof options.acceptErrors !== 'boolean')
		throw new Error('Error confirmation must be a boolean');
	if (options.currency !== undefined && !validCurrency(options.currency))
		throw new Error('Invalid import currency');
	for (const name of ['keepDuplicates', 'excludeRows']) {
		const rows = options[name];
		if (
			rows !== undefined &&
			(!Array.isArray(rows) ||
				rows.some((row) => !Number.isSafeInteger(row) || row < 2) ||
				new Set(rows).size !== rows.length)
		)
			throw new Error('Row selections must contain distinct CSV source row numbers');
	}
	if (options.columns !== undefined) {
		if (!options.columns || typeof options.columns !== 'object' || Array.isArray(options.columns))
			throw new Error('Invalid column mapping');
		for (const [key, index] of Object.entries(options.columns))
			if (
				!['date', 'description', 'amount', 'currency'].includes(key) ||
				!Number.isSafeInteger(index) ||
				Number(index) < 0
			)
				throw new Error('Invalid column mapping');
	}
}
export function createAccount(
	db: Database,
	input: {
		name: string;
		currency: string;
		kind?: string;
		openingBalance?: number;
		openingDate: string;
	},
) {
	if (
		typeof input.name !== 'string' ||
		!input.name.trim() ||
		input.name.length > 100 ||
		!validCurrency(input.currency) ||
		!['bank', 'cash', 'credit'].includes(input.kind || 'bank') ||
		!Number.isFinite(input.openingBalance ?? 0) ||
		!validDate(input.openingDate)
	)
		throw new Error('Provide a name, currency, valid opening date and balance');
	const id = randomUUID();
	db.query(
		'INSERT INTO accounts(id,name,currency,kind,opening_balance,opening_date) VALUES (?,?,?,?,?,?)',
	).run(
		id,
		input.name.trim(),
		input.currency,
		input.kind || 'bank',
		money(input.openingBalance ?? 0),
		input.openingDate,
	);
	return listAccounts(db).find((a) => a.id === id)!;
}
function importRows(db: Database, content: string, options: ImportOptions) {
	validateImportOptions(options);
	const account = listAccounts(db).find((a) => a.id === options.accountId);
	if (!account) throw new Error('Select an existing account before importing');
	const parsed = parseCSV(content, {
		columns: options.columns,
		revolutProduct: options.revolutProduct,
		revolutFeeMode: options.revolutFeeMode,
	});
	const occurrences = new Map<string, number>();
	const headers =
		Papa.parse<string[]>(content.replace(/^\uFEFF/, ''), { preview: 1 }).data[0] || [];
	const rows = (parsed.requiresProductSelection ? [] : parsed.transactions).map((t, index) => {
		const currency = t.currency || options.currency || account.currency;
		if (currency !== account.currency)
			throw new Error('Statement currency must match the selected account currency');
		const identity = JSON.stringify([
			account.id,
			currency,
			parsed.format === 'revolut' ? t.date.toISOString() : t.date.toISOString().slice(0, 10),
			...(parsed.format === 'revolut'
				? [
						parsed.sourceMetadata?.[index].product,
						parsed.sourceMetadata?.[index].startedDate,
						parsed.sourceMetadata?.[index].type,
					]
				: []),
			t.description,
			...(parsed.format === 'revolut'
				? [parsed.sourceMetadata?.[index].originalAmount, parsed.sourceMetadata?.[index].fee]
				: [t.amount]),
		]);
		const occurrence = (occurrences.get(identity) || 0) + 1;
		occurrences.set(identity, occurrence);
		const key = createHash('sha256')
			.update(identity + ':' + occurrence)
			.digest('hex');
		const exact = db.query('SELECT id FROM transactions WHERE source_key = ?').get(key);
		const legacy = db
			.query(
				`SELECT COUNT(*) AS n FROM transactions WHERE
 ((account_id=? AND currency=?) OR (account_id IS NULL AND (currency IS NULL OR currency='' OR currency=?)))
 AND (CASE WHEN substr(date,12,8)='00:00:00' THEN substr(date,1,10) ELSE date(date,'localtime') END)=?
 AND description=? AND amount=? AND source_key IS NULL`,
			)
			.get(
				account.id,
				currency,
				currency,
				t.date.toISOString().slice(0, 10),
				t.description,
				t.amount,
			) as { n: number };
		// Description-only transfer guesses are presented as ordinary cash flows until both sides are matched.
		return {
			rowNumber: parsed.sourceRowNumbers[index],
			source: parsed.sourceMetadata?.[index],
			key,
			duplicate: !!exact || occurrence <= legacy.n,
			duplicateReason: exact
				? 'Already imported'
				: occurrence <= legacy.n
					? 'Matches existing history; assign unassigned records in Accounts'
					: undefined,
			transaction: {
				...t,
				currency,
				type: t.amount >= 0 ? ('income' as const) : ('expense' as const),
			},
		};
	});
	return {
		format: parsed.format,
		products: parsed.products,
		requiresProductSelection: parsed.requiresProductSelection,
		skippedRows: parsed.skippedRows ?? [],
		rows,
		headers,
		columns: parsed.columns,
		errors: parsed.errors,
		totalRows: parsed.totalRows,
		validRows: parsed.validRows,
		account,
	};
}
export function previewImport(db: Database, content: string, options: ImportOptions) {
	return importRows(db, content, options);
}
export function commitImport(
	db: Database,
	content: string,
	filename: string,
	options: ImportOptions,
) {
	return db.transaction(() => {
		const preview = importRows(db, content, options);
		if (preview.requiresProductSelection)
			throw new Error('Choose one Revolut product for the selected account before importing');
		if (preview.errors.length && !options.acceptErrors)
			throw new Error('Review rejected rows and confirm importing valid rows');
		if (!preview.rows.length) throw new Error(preview.errors[0] || 'No valid transactions');
		const id = randomUUID(),
			now = new Date().toISOString();
		const keep = new Set(options.keepDuplicates || []),
			exclude = new Set(options.excludeRows || []);
		const sourceRows = new Set(preview.rows.map((row) => row.rowNumber));
		if ([...keep, ...exclude].some((row) => !sourceRows.has(row)))
			throw new Error('A selected CSV row is unavailable; preview the statement again');
		const selected = preview.rows.filter(
			(r) => !exclude.has(r.rowNumber) && (!r.duplicate || keep.has(r.rowNumber)),
		);
		db.query(
			'INSERT INTO import_batches(id,filename,account_id,created_at,row_count,skipped_count,errors_json) VALUES(?,?,?,?,?,?,?)',
		).run(
			id,
			filename,
			options.accountId,
			now,
			selected.length,
			preview.rows.length - selected.length + preview.skippedRows.length,
			JSON.stringify([
				...preview.errors,
				...preview.skippedRows.map((row) => `Row ${row.rowNumber}: ${row.reason}`),
			]),
		);
		const insert = db.query(
			'INSERT INTO transactions(id,date,description,amount,type,currency,account_id,import_id,source_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
		);
		for (const row of selected) {
			const t = row.transaction;
			insert.run(
				randomUUID(),
				t.date.toISOString(),
				t.description,
				t.amount,
				t.type,
				t.currency,
				options.accountId,
				id,
				row.duplicate ? row.key + ':manual:' + randomUUID() : row.key,
				now,
				now,
			);
		}
		return {
			id,
			created: selected.length,
			skipped: preview.rows.length - selected.length + preview.skippedRows.length,
			errors: preview.errors,
		};
	})();
}
export function importHistory(db: Database) {
	return db
		.query(
			'SELECT b.*, a.name AS account_name FROM import_batches b LEFT JOIN accounts a ON a.id=b.account_id ORDER BY b.created_at DESC',
		)
		.all();
}
export function undoImport(db: Database, id: string) {
	return db.transaction(() => {
		const batch = db
			.query('SELECT id FROM import_batches WHERE id=? AND undone_at IS NULL')
			.get(id);
		if (!batch) throw new Error('Import not found or already undone');
		// Undo matched pairs first, including their counterpart in a different import.
		const pairs = db
			.query(
				'SELECT m.id FROM transfer_matches m JOIN transactions t ON t.id=m.outgoing_id OR t.id=m.incoming_id WHERE t.import_id=?',
			)
			.all(id) as { id: string }[];
		for (const pair of pairs) unmatchTransfer(db, pair.id);
		db.query('DELETE FROM transactions WHERE import_id=?').run(id);
		db.query('UPDATE import_batches SET undone_at=? WHERE id=?').run(new Date().toISOString(), id);
	})();
}
interface TransferRow {
	id: string;
	date: string;
	description: string;
	amount: number;
	currency: string;
	account_id: string;
	type: string;
	account_name: string;
}
export function transferCandidates(db: Database) {
	const rows = db
		.query(
			`SELECT t.*,a.name AS account_name FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.type!='transfer' AND NOT EXISTS(SELECT 1 FROM transfer_matches m WHERE t.id=m.incoming_id OR t.id=m.outgoing_id) ORDER BY t.date DESC`,
		)
		.all() as TransferRow[];
	return rows
		.filter((t) => t.amount < 0)
		.flatMap((outgoing) =>
			rows
				.filter(
					(t) =>
						t.amount > 0 &&
						t.account_id !== outgoing.account_id &&
						t.currency === outgoing.currency &&
						Math.abs(t.amount + outgoing.amount) < 0.005 &&
						Math.abs(Date.parse(t.date) - Date.parse(outgoing.date)) <= 3 * 86400000,
				)
				.map((incoming) => ({ outgoing, incoming })),
		)
		.slice(0, 200);
}
export function matchTransfer(db: Database, outgoingId: string, incomingId: string) {
	return db.transaction(() => {
		const rows = db
			.query('SELECT * FROM transactions WHERE id IN (?,?)')
			.all(outgoingId, incomingId) as TransferRow[];
		const outgoing = rows.find((r) => r.id === outgoingId),
			incoming = rows.find((r) => r.id === incomingId);
		if (
			!outgoing ||
			!incoming ||
			!outgoing.account_id ||
			!incoming.account_id ||
			outgoing.account_id === incoming.account_id ||
			outgoing.currency !== incoming.currency ||
			outgoing.amount >= 0 ||
			incoming.amount <= 0 ||
			Math.abs(outgoing.amount + incoming.amount) > 0.005 ||
			Math.abs(Date.parse(outgoing.date) - Date.parse(incoming.date)) > 3 * 86400000
		)
			throw new Error(
				'Select equal opposite payments in different accounts in the same currency within three days',
			);
		if (
			db
				.query('SELECT id FROM transfer_matches WHERE outgoing_id IN (?,?) OR incoming_id IN (?,?)')
				.get(outgoingId, incomingId, outgoingId, incomingId)
		)
			throw new Error('A transaction is already matched');
		db.query("UPDATE transactions SET type='transfer' WHERE id IN (?,?)").run(
			outgoingId,
			incomingId,
		);
		const id = randomUUID();
		db.query('INSERT INTO transfer_matches VALUES (?,?,?,?,?)').run(
			id,
			outgoingId,
			incomingId,
			outgoing.type,
			incoming.type,
		);
		db.query("UPDATE transactions SET type='transfer' WHERE id IN (?,?)").run(
			outgoingId,
			incomingId,
		);
		return { id };
	})();
}
export function unmatchTransfer(db: Database, id: string) {
	return db.transaction(() => {
		const p = db.query('SELECT * FROM transfer_matches WHERE id=?').get(id) as {
			outgoing_id: string;
			incoming_id: string;
			outgoing_type: string;
			incoming_type: string;
		} | null;
		if (!p) throw new Error('Transfer not found');
		db.query('DELETE FROM transfer_matches WHERE id=?').run(id);
	})();
}
export function reconcileAccount(db: Database, id: string, asOf: string, statementBalance: number) {
	const account = listAccounts(db).find((a) => a.id === id);
	if (
		!account ||
		!validDate(asOf) ||
		asOf < account.opening_date ||
		!Number.isFinite(statementBalance)
	)
		throw new Error('Provide a valid account, statement date and balance');
	const row = db
		.query(
			'SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE account_id=? AND date>=? AND date<?',
		)
		.get(id, account.opening_date, new Date(Date.parse(asOf) + 86400000).toISOString()) as {
		total: number;
	};
	const calculated = money(account.opening_balance + row.total);
	return {
		calculated,
		statementBalance,
		difference: money(statementBalance - calculated),
		currency: account.currency,
		asOf,
	};
}
