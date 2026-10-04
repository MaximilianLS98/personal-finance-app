import { parseCSV } from '../csv-parser';
const header =
	'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';
const row = (overrides: Partial<Record<string, string>> = {}) => {
	const values = {
		Type: 'Card Payment',
		Product: 'Current',
		'Started Date': '2026-10-01 23:59:59',
		'Completed Date': '2026-10-02 00:03:12',
		Description: 'Synthetic merchant',
		Amount: '-20.00',
		Fee: '0.00',
		Currency: 'NOK',
		State: 'COMPLETED',
		Balance: '80.00',
		...overrides,
	};
	return header
		.split(',')
		.map((key) => `"${values[key as keyof typeof values].replaceAll('"', '""')}"`)
		.join(',');
};
const statement = (...rows: string[]) => `${header}\n${rows.join('\n')}`;
it('detects Revolut, preserves posted timestamps and quoted descriptions, and ignores unsafe generic mappings', () => {
	const result = parseCSV(statement(row({ Description: 'Synthetic, "quoted" merchant' })), {
		columns: { date: 2, amount: 9 },
	});
	expect(result.format).toBe('revolut');
	expect(result.errors).toEqual([]);
	expect(result.transactions[0].date.toISOString()).toBe('2026-10-02T00:03:12.000Z');
	expect(result.transactions[0].description).toBe('Synthetic, "quoted" merchant');
	expect(result.transactions[0].amount).toBe(-20);
	expect(result.sourceRowNumbers).toEqual([2]);
});
it('explicitly excludes incomplete and reversed movements rather than rejecting their missing completion date', () => {
	const result = parseCSV(
		statement(
			row(),
			row({ State: 'PENDING', 'Completed Date': '' }),
			row({ State: 'REVERTED', 'Completed Date': '' }),
			row({ State: 'DECLINED', 'Completed Date': '' }),
		),
	);
	expect(result.totalRows).toBe(4);
	expect(result.validRows).toBe(1);
	expect(result.errors).toEqual([]);
	expect(result.skippedRows?.map((r) => r.rowNumber)).toEqual([3, 4, 5]);
});
it('rejects unknown states and invalid timestamps rather than inventing a booking date', () => {
	const result = parseCSV(
		statement(
			row({ State: 'NEW_STATE' }),
			row({ 'Completed Date': '' }),
			row({ 'Completed Date': '2026-02-30 12:00:00' }),
			row({ 'Completed Date': '2026-10-01 25:00:00' }),
		),
	);
	expect(result.validRows).toBe(0);
	expect(result.errors).toHaveLength(4);
});
it('isolates products and exposes mixed-product account selection', () => {
	const csv = statement(row(), row({ Product: 'Savings' }), row({ Product: 'Pocket' }));
	expect(parseCSV(csv).requiresProductSelection).toBe(true);
	const result = parseCSV(csv, { revolutProduct: 'Current' });
	expect(result.validRows).toBe(1);
	expect(result.skippedRows).toHaveLength(2);
	expect(result.products).toEqual(['Current', 'Pocket', 'Savings']);
	expect(result.requiresProductSelection).toBe(false);
});
it('requires a fee decision for nonzero fees and applies signed fees at most once', () => {
	const csv = statement(
		row({ Fee: '1.50' }),
		row({ Amount: '100', Fee: '2' }),
		row({ Amount: '5', Fee: '-1' }),
	);
	expect(parseCSV(csv).errors).toHaveLength(3);
	expect(parseCSV(csv, { revolutFeeMode: 'deduct' }).transactions.map((t) => t.amount)).toEqual([
		-21.5, 98, 6,
	]);
	expect(parseCSV(csv, { revolutFeeMode: 'included' }).transactions.map((t) => t.amount)).toEqual([
		-20, 100, 5,
	]);
});
it('honors an explicit timezone while never interpreting zone-less times in host local time', () => {
	const result = parseCSV(statement(row({ 'Completed Date': '2026-10-02T00:03:12+02:00' })));
	expect(result.transactions[0].date.toISOString()).toBe('2026-10-01T22:03:12.000Z');
});
it('rejects missing source currency instead of adopting an unrelated account currency', () => {
	const result = parseCSV(statement(row({ Currency: '' })));
	expect(result.validRows).toBe(0);
	expect(result.errors[0]).toContain('Currency');
});
