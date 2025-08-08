/**
 * CSV parsing utilities for financial transaction data
 * Supports both English and Norwegian CSV formats
 */

import { Transaction } from './types';
import { determineTransactionType } from './transaction-utils';

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
export interface ParseResult {
	transactions: Transaction[];
	errors: string[];
	totalRows: number;
	validRows: number;
}

/**
 * Configuration options for CSV parsing
 */
export interface ParseOptions {
	delimiter?: string;
	skipEmptyLines?: boolean;
	trimWhitespace?: boolean;
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
		errors: [],
		totalRows: 0,
		validRows: 0,
	};

	try {
		// Split content into lines
		const lines = csvContent
			.split('\n')
			.filter((line) => (skipEmptyLines ? line.trim().length > 0 : true));

		if (lines.length === 0) {
			result.errors.push('CSV file is empty');
			return result;
		}

		// Parse header row
		const headers = parseCSVRow(lines[0], delimiter, trimWhitespace);
		const columnIndices = mapColumns(headers);

		if (!columnIndices) {
			result.errors.push('Required columns not found. Expected: Date, Description, Amount');
			return result;
		}

		// Parse data rows
		for (let i = 1; i < lines.length; i++) {
			result.totalRows++;
			const row = parseCSVRow(lines[i], delimiter, trimWhitespace);

			if (row.length === 0) continue;

			try {
				const transaction = parseTransactionRow(row, columnIndices, i + 1);
				if (transaction) {
					result.transactions.push(transaction);
					result.validRows++;
				}
			} catch (error) {
				result.errors.push(
					`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
 * Parses a single CSV row, handling quoted values and delimiters
 */
function parseCSVRow(row: string, delimiter: string, trimWhitespace: boolean): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;
	let i = 0;

	while (i < row.length) {
		const char = row[i];
		const nextChar = row[i + 1];

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				// Escaped quote
				current += '"';
				i += 2;
			} else {
				// Toggle quote state
				inQuotes = !inQuotes;
				i++;
			}
		} else if (char === delimiter && !inQuotes) {
			// End of field
			result.push(trimWhitespace ? current.trim() : current);
			current = '';
			i++;
		} else {
			current += char;
			i++;
		}
	}

	// Add the last field
	result.push(trimWhitespace ? current.trim() : current);
	return result;
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

	// Validate required columns
	if (indices.date === -1 || indices.description === -1 || indices.amount === -1) {
		return null;
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
	rowNumber: number,
): Transaction | null {
	const dateStr = row[columnIndices.date];
	const description = row[columnIndices.description];
	const amountStr = row[columnIndices.amount];

	// Validate required fields
	if (!dateStr || !description || !amountStr) {
		throw new Error('Missing required fields (date, description, or amount)');
	}

	// Parse date (parseDate handles its own trimming)
	const date = parseDate(dateStr);
	if (!date) {
		throw new Error(`Invalid date format: ${dateStr}`);
	}

	// Parse amount (parseAmount handles its own trimming)
	const amount = parseAmount(amountStr);
	if (isNaN(amount)) {
		throw new Error(`Invalid amount format: ${amountStr}`);
	}

	// Optional currency column
	const currency =
		columnIndices.currency !== undefined && row[columnIndices.currency]
			? row[columnIndices.currency].trim()
			: undefined;

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

			const date = new Date(year, month, day);

			// Validate the date is valid
			if (
				date.getFullYear() === year &&
				date.getMonth() === month &&
				date.getDate() === day
			) {
				return date;
			}
		}
	}

	// Try native Date parsing as fallback
	const fallbackDate = new Date(cleaned);
	return isNaN(fallbackDate.getTime()) ? null : fallbackDate;
}

/**
 * Parses amount string, handling various formats and currencies
 * Supports formats: 1234.56, 1,234.56, 1 234,56, -1234.56, etc.
 */
function parseAmount(amountStr: string): number {
	// Remove currency symbols but keep spaces, commas, and dots for parsing
	let cleaned = amountStr.trim().replace(/[^\d.,\-+\s]/g, ''); // Remove currency symbols

	// Handle Norwegian format with spaces (1 234,56 -> 1234.56)
	if (cleaned.includes(' ') && cleaned.includes(',')) {
		cleaned = cleaned.replace(/\s/g, '').replace(',', '.');
	}
	// Handle format with comma as decimal separator (1234,56 -> 1234.56)
	else if (cleaned.includes(',') && !cleaned.includes('.')) {
		// Check if comma is likely decimal separator (last comma with 2 digits after)
		const lastCommaIndex = cleaned.lastIndexOf(',');
		const afterComma = cleaned.substring(lastCommaIndex + 1);
		if (afterComma.length <= 2 && /^\d+$/.test(afterComma)) {
			cleaned = cleaned.replace(',', '.');
		} else {
			// Multiple commas, treat as thousands separators
			cleaned = cleaned.replace(/,/g, '');
		}
	}
	// Handle thousands separators (1,234.56)
	else if (cleaned.includes(',') && cleaned.includes('.')) {
		// Remove commas that are thousands separators
		const parts = cleaned.split('.');
		if (parts.length === 2 && parts[1].length <= 2) {
			cleaned = parts[0].replace(/,/g, '') + '.' + parts[1];
		}
	}

	// Remove any remaining spaces
	cleaned = cleaned.replace(/\s+/g, '');

	return parseFloat(cleaned);
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
