/**
 * CSV parsing utilities for financial transaction data
 * Supports both English and Norwegian CSV formats
 */

import Papa from 'papaparse';
import { money } from './money';
import { determineTransactionType } from './transaction-utils';
import { Transaction } from './types';

/**
 * Supported CSV column mappings for different formats
 */
interface ColumnMapping {
	date: string[];
	description: string[];
	amount: string[];
	currency?: string[];
}

/**
 * Standard column mappings for English and Norwegian formats
 */
const COLUMN_MAPPINGS: ColumnMapping = {
	date: ['Date', 'Bokføringsdato', 'date', 'bokføringsdato', 'transaction date'],
	description: [
		'Description',
		'Tittel',
		'description',
		'tittel',
		'memo',
		'Navn',
		'navn',
		'merchant',
	],
	amount: ['Amount', 'Beløp', 'amount', 'beløp', 'value'],
	currency: ['Currency', 'Valuta', 'currency', 'valuta'],
};

/**
 * Result of CSV parsing operation
 */
export interface ColumnIndices {
	date: number;
	description: number;
	amount: number;
	currency?: number;
}
export interface ParseResult {
	format?: 'generic' | 'revolut';
	products?: string[];
	requiresProductSelection?: boolean;
	skippedRows?: Array<{ rowNumber: number; reason: string }>;
	sourceMetadata?: Array<{
		product: string;
		startedDate: string;
		completedDate: string;
		originalAmount: number;
		fee: number;
		type: string;
	}>;
	sourceRowNumbers: number[];
	columns?: ColumnIndices;
	transactions: Transaction[];
	errors: string[];
	totalRows: number;
	validRows: number;
}

/**
 * Configuration options for CSV parsing
 */
export interface ParseOptions {
	revolutProduct?: string;
	revolutFeeMode?: 'deduct' | 'included';
	delimiter?: string;
	skipEmptyLines?: boolean;
	trimWhitespace?: boolean;
	columns?: Partial<ColumnIndices>;
}

/**
 * Parses CSV content and returns structured transaction data
 */
export function parseCSV(csvContent: string, options: ParseOptions = {}): ParseResult {
	const { skipEmptyLines = true, trimWhitespace = true } = options;

	// Auto-detect delimiter if not provided
	const delimiter = options.delimiter || detectDelimiter(csvContent);

	const result: ParseResult = {
		transactions: [],
		sourceRowNumbers: [],
		errors: [],
		totalRows: 0,
		validRows: 0,
	};

	try {
		if (
			options.revolutFeeMode !== undefined &&
			!['deduct', 'included'].includes(options.revolutFeeMode)
		)
			throw new Error('Invalid Revolut fee handling');
		const content = csvContent.replace(/^\uFEFF/, '');
		const records: { cells: string[]; line: number; errors: string[] }[] = [];
		let line = 1,
			cursor = 0;
		Papa.parse<string[]>(content, {
			delimiter,
			skipEmptyLines: false,
			step(record) {
				records.push({
					cells: record.data.map((cell) => (trimWhitespace ? cell.trim() : cell)),
					line,
					errors: record.errors.map((error) => error.message),
				});
				line += (content.slice(cursor, record.meta.cursor).match(/\r\n|\n|\r/g) || []).length;
				cursor = record.meta.cursor;
			},
		});
		const nonempty = records.filter((record) => record.cells.some((cell) => cell.trim()));
		if (!nonempty.length) {
			result.errors.push('CSV file is empty');
			return result;
		}
		const header = nonempty[0];
		if (header.errors.length) {
			result.errors.push(`Row ${header.line}: ${header.errors.join('; ')}`);
			return result;
		}
		const headers = header.cells;
		const revolutHeaders = [
			'Type',
			'Product',
			'Started Date',
			'Completed Date',
			'Description',
			'Amount',
			'Fee',
			'Currency',
			'State',
			'Balance',
		];
		const named = Object.fromEntries(
			headers.map((name, index) => [name.toLowerCase().trim(), index]),
		);
		const revolut = revolutHeaders.every((name) => named[name.toLowerCase()] !== undefined);
		result.format = revolut ? 'revolut' : 'generic';
		result.skippedRows = [];
		result.sourceMetadata = [];
		if (revolut) {
			result.products = [
				...new Set(
					nonempty
						.slice(1)
						.map((record) => record.cells[named.product])
						.filter(Boolean),
				),
			].sort();
			result.requiresProductSelection = result.products.length > 1 && !options.revolutProduct;
			if (options.revolutProduct && !result.products.includes(options.revolutProduct)) {
				result.errors.push('Selected Revolut product is absent from this statement');
				return result;
			}
		}
		const automatic = revolut
			? {
					date: named['completed date'],
					description: named.description,
					amount: named.amount,
					currency: named.currency,
				}
			: mapColumns(headers);
		const columnIndices = {
			...automatic,
			...Object.fromEntries(
				Object.entries(revolut ? {} : options.columns || {}).filter(
					([, value]) => value !== undefined,
				),
			),
		};
		const required = ['date', 'description', 'amount'] as const;
		if (
			required.some(
				(key) =>
					!Number.isInteger(columnIndices[key]) ||
					columnIndices[key]! < 0 ||
					columnIndices[key]! >= headers.length,
			)
		) {
			result.errors.push('Required columns not found. Expected: Date, Description, Amount');
			return result;
		}
		if (
			columnIndices.currency !== undefined &&
			(!Number.isInteger(columnIndices.currency) ||
				columnIndices.currency < 0 ||
				columnIndices.currency >= headers.length)
		) {
			result.errors.push('Invalid currency column');
			return result;
		}
		result.columns = columnIndices as ColumnIndices;
		for (const record of records.slice(records.indexOf(header) + 1)) {
			if (skipEmptyLines && !record.cells.some((cell) => cell.trim())) continue;
			result.totalRows++;
			try {
				if (record.errors.length) throw new Error(record.errors.join('; '));
				if (record.cells.length !== headers.length)
					throw new Error(
						`Expected ${headers.length} columns, found ${record.cells.length}; quote fields containing delimiters`,
					);
				if (revolut) {
					const state = record.cells[named.state].toUpperCase();
					if (
						['PENDING', 'REVERTED', 'DECLINED', 'FAILED', 'CANCELLED', 'CANCELED'].includes(state)
					) {
						result.skippedRows!.push({
							rowNumber: record.line,
							reason: `${state}: not a completed account movement`,
						});
						continue;
					}
					if (state !== 'COMPLETED')
						throw new Error('Unrecognized Revolut State; expected COMPLETED');
					if (!record.cells[named.product]) throw new Error('Missing Revolut Product');
					if (options.revolutProduct && record.cells[named.product] !== options.revolutProduct) {
						result.skippedRows!.push({
							rowNumber: record.line,
							reason: `Different product: ${record.cells[named.product]}`,
						});
						continue;
					}
					if (!/^[A-Z]{3}$/.test(record.cells[named.currency].trim().toUpperCase()))
						throw new Error('Completed Revolut rows require a valid Currency');
					const completed = parseRevolutTimestamp(record.cells[named['completed date']]);
					const started = parseRevolutTimestamp(record.cells[named['started date']]);
					if (!completed || !started)
						throw new Error(
							'Completed Revolut rows require valid Started Date and Completed Date timestamps',
						);
					const originalAmount = parseAmount(record.cells[named.amount]);
					const fee = record.cells[named.fee] ? parseAmount(record.cells[named.fee]) : 0;
					if (!Number.isFinite(originalAmount) || !Number.isFinite(fee))
						throw new Error('Invalid Revolut Amount or Fee');
					if (fee !== 0 && !options.revolutFeeMode)
						throw new Error(
							'Nonzero Revolut Fee: choose whether Amount already includes the fee and preview again',
						);
					const adjusted = record.cells.slice();
					adjusted[named.amount] = String(
						money(originalAmount - (options.revolutFeeMode === 'deduct' ? fee : 0)),
					);
					adjusted[named['completed date']] = completed.toISOString();
					const transaction = parseTransactionRow(adjusted, result.columns, record.line);
					if (transaction) {
						result.transactions.push(transaction);
						result.sourceRowNumbers.push(record.line);
						result.validRows++;
						result.sourceMetadata!.push({
							product: record.cells[named.product],
							startedDate: started.toISOString(),
							completedDate: completed.toISOString(),
							originalAmount,
							fee,
							type: record.cells[named.type],
						});
					}
					continue;
				}
				const transaction = parseTransactionRow(record.cells, result.columns, record.line);
				if (transaction) {
					result.transactions.push(transaction);
					result.sourceRowNumbers.push(record.line);
					result.validRows++;
				}
			} catch (error) {
				result.errors.push(
					`Row ${record.line}: ${error instanceof Error ? error.message : 'Unknown error'}`,
				);
			}
		}

		return result;
	} catch (error) {
		result.errors.push(
			`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
		return result;
	}
}

/** Preserve the statement clock when Revolut omits a timezone; never use the machine's zone. */
function parseRevolutTimestamp(value: string): Date | null {
	const match = value
		.trim()
		.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})?$/);
	if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59)
		return null;
	const day = parseDate(match[1]);
	if (!day || day.toISOString().slice(0, 10) !== match[1]) return null;
	const parsed = new Date(
		`${match[1]}T${match[2]}:${match[3]}:${match[4]}${match[5] ?? ''}${match[6] ?? 'Z'}`,
	);
	return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * Auto-detects the delimiter used in CSV content
 */
function detectDelimiter(csvContent: string): string {
	const lines = csvContent.split('\n').filter((line) => line.trim().length > 0);
	if (lines.length === 0) return ',';

	const firstLine = lines[0];
	const delimiters = [';', ',', '\t', '|'];

	// Count occurrences of each delimiter in the first line
	const counts = delimiters.map((delimiter) => ({
		delimiter,
		count: (firstLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length,
	}));

	// Return the delimiter with the highest count
	const best = counts.reduce((max, current) => (current.count > max.count ? current : max));

	return best.count > 0 ? best.delimiter : ',';
}

/**
 * Maps CSV headers to column indices based on known column mappings
 */
function mapColumns(
	headers: string[],
): { date: number; description: number; amount: number; currency?: number } | null {
	const indices = {
		date: -1,
		description: -1,
		amount: -1,
		currency: -1,
	};

	// Find column indices
	for (let i = 0; i < headers.length; i++) {
		const header = headers[i].toLowerCase().trim();

		if (COLUMN_MAPPINGS.date.some((col) => col.toLowerCase() === header)) {
			indices.date = i;
		} else if (COLUMN_MAPPINGS.description.some((col) => col.toLowerCase() === header)) {
			indices.description = i;
		} else if (COLUMN_MAPPINGS.amount.some((col) => col.toLowerCase() === header)) {
			indices.amount = i;
		} else if (COLUMN_MAPPINGS.currency?.some((col) => col.toLowerCase() === header)) {
			indices.currency = i;
		}
	}

	return {
		date: indices.date,
		description: indices.description,
		amount: indices.amount,
		currency: indices.currency >= 0 ? indices.currency : undefined,
	};
}
/**
 * Parses a single transaction row and creates a Transaction object
 */
function parseTransactionRow(
	row: string[],
	columnIndices: { date: number; description: number; amount: number; currency?: number },
	_rowNumber: number,
): Transaction | null {
	const dateStr = row[columnIndices.date];
	const description = row[columnIndices.description];
	const amountStr = row[columnIndices.amount];

	// Validate required fields
	if (!dateStr || !description || !amountStr) {
		throw new Error('Missing required fields (date, description, or amount)');
	}

	if (/^(reservert|reserved|pending)$/i.test(dateStr.trim()))
		throw new Error('Pending transaction has no booking date; import it after it is booked');

	// Parse date (parseDate handles its own trimming)
	const date = parseDate(dateStr);
	if (!date) {
		throw new Error(`Invalid date format: ${dateStr}`);
	}

	// Parse amount (parseAmount handles its own trimming)
	const amount = parseAmount(amountStr);
	if (!Number.isFinite(amount)) {
		throw new Error(`Invalid amount format: ${amountStr}`);
	}

	// Optional currency column
	const currency =
		columnIndices.currency !== undefined && row[columnIndices.currency]
			? row[columnIndices.currency].trim().toUpperCase()
			: undefined;

	if (currency && !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency code');

	// Categorize transaction type using enhanced detection
	const type = determineTransactionType(amount, description);

	// Generate unique ID
	const id = generateTransactionId(date, description, amount);

	return {
		id,
		date,
		description,
		amount,
		currency,
		type,
	};
}

/**
 * Parses date string in various formats
 * Supports formats: DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, MM/DD/YYYY
 */
function parseDate(dateStr: string): Date | null {
	// Remove any extra whitespace
	const cleaned = dateStr.trim();

	// Try different date formats
	const formats = [
		// YYYY/MM/DD (Norwegian bank format)
		{ regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, format: 'YYYY/MM/DD' },
		// DD.MM.YYYY (Norwegian format)
		{ regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, format: 'DD.MM.YYYY' },
		// DD/MM/YYYY
		{ regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, format: 'DD/MM/YYYY' },
		// YYYY-MM-DD (ISO format)
		{ regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, format: 'YYYY-MM-DD' },
		// MM/DD/YYYY (US format)
		{ regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, format: 'MM/DD/YYYY' },
	];

	for (const format of formats) {
		const match = cleaned.match(format.regex);
		if (match) {
			let day: number, month: number, year: number;

			switch (format.format) {
				case 'YYYY/MM/DD':
				case 'YYYY-MM-DD':
					year = parseInt(match[1]);
					month = parseInt(match[2]) - 1; // JavaScript months are 0-indexed
					day = parseInt(match[3]);
					break;
				case 'MM/DD/YYYY':
					month = parseInt(match[1]) - 1;
					day = parseInt(match[2]);
					year = parseInt(match[3]);
					break;
				default: // DD.MM.YYYY or DD/MM/YYYY
					day = parseInt(match[1]);
					month = parseInt(match[2]) - 1;
					year = parseInt(match[3]);
					break;
			}

			const date = new Date(Date.UTC(year, month, day));

			// Validate the date is valid
			if (
				date.getUTCFullYear() === year &&
				date.getUTCMonth() === month &&
				date.getUTCDate() === day
			) {
				return date;
			}
		}
	}

	if (formats.some((format) => format.regex.test(cleaned))) return null;
	// Try native Date parsing as fallback
	const fallbackDate = new Date(cleaned);
	return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
}

/**
 * Parses amount string, handling various formats and currencies
 * Supports formats: 1234.56, 1,234.56, 1 234,56, -1234.56, etc.
 */
function parseAmount(amountStr: string): number {
	// Only remove recognized currency adornments. Arbitrary letters must never turn into money.
	const adornment = '(?:[$€£¥]|NOK|USD|EUR|GBP|SEK|DKK|CHF|JPY|CAD|AUD|kr)';
	let cleaned = amountStr.trim().replace(/\s/g, ' ');
	const leadingSign = cleaned.match(/^[+-]/)?.[0] ?? '';
	if (leadingSign) cleaned = cleaned.slice(1).trim();
	cleaned = cleaned
		.replace(new RegExp(`^${adornment}\\s*`, 'i'), '')
		.replace(new RegExp(`\\s*${adornment}$`, 'i'), '')
		.trim();
	cleaned = leadingSign + cleaned;
	if (/^[+-]?\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/.test(cleaned))
		cleaned = cleaned.replace(/ /g, '').replace(',', '.');
	else if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(cleaned))
		cleaned = cleaned.replace(/,/g, '');
	else if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(cleaned))
		cleaned = cleaned.replace(/\./g, '').replace(',', '.');
	else if (/^[+-]?\d+,\d{1,2}$/.test(cleaned)) cleaned = cleaned.replace(',', '.');
	if (!/^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(cleaned)) return NaN;
	const value = Number(cleaned);
	return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER / 100 ? value : NaN;
}

/**
 * Generates a unique ID for a transaction based on its properties
 */
function generateTransactionId(date: Date, description: string, amount: number): string {
	const dateStr = date.toISOString().split('T')[0];
	const hash = simpleHash(`${dateStr}-${description}-${amount}`);
	return `txn_${hash}`;
}

/**
 * Simple hash function for generating transaction IDs
 */
function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash).toString(36);
}

/**
 * Validates CSV file content before parsing
 */
export function validateCSVContent(content: string): { isValid: boolean; error?: string } {
	if (!content || content.trim().length === 0) {
		return { isValid: false, error: 'CSV content is empty' };
	}

	const lines = content.split('\n').filter((line) => line.trim().length > 0);
	if (lines.length < 2) {
		return { isValid: false, error: 'CSV must contain at least a header row and one data row' };
	}

	return { isValid: true };
}

/**
 * Utility function to convert File to string content
 */
export async function readFileContent(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			const content = event.target?.result as string;
			resolve(content);
		};
		reader.onerror = () => {
			reject(new Error('Failed to read file'));
		};
		reader.readAsText(file);
	});
}
