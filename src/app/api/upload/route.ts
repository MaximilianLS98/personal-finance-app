import { NextRequest, NextResponse } from 'next/server';
import { parseCSV, validateCSVContent } from '@/lib/csv-parser';
import { ErrorResponse } from '@/lib/types';
import { storeTransactions } from '@/lib/storage';

/**
 * Maximum file size for CSV uploads (5MB)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Allowed MIME types for CSV files
 */
const ALLOWED_MIME_TYPES = [
	'text/csv',
	'application/csv',
	'text/plain',
	'application/vnd.ms-excel',
];

/**
 * POST /api/upload - Handle CSV file upload and processing
 */
export async function POST(request: NextRequest) {
	try {
		// Parse form data
		const formData = await request.formData();
		const file = formData.get('file') as File;

		// Validate file presence
		if (!file) {
			return NextResponse.json(
				{
					error: 'MISSING_FILE',
					message: 'No file provided in the request',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Validate file size
		if (file.size > MAX_FILE_SIZE) {
			return NextResponse.json(
				{
					error: 'FILE_TOO_LARGE',
					message: `File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
					details: { fileSize: file.size, maxSize: MAX_FILE_SIZE },
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Validate file type
		if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.name?.toLowerCase().endsWith('.csv')) {
			return NextResponse.json(
				{
					error: 'INVALID_FILE_TYPE',
					message: 'File must be a CSV file',
					details: { fileType: file.type, fileName: file.name },
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Read file content
		let csvContent: string;
		try {
			csvContent = await file.text();
		} catch (error) {
			return NextResponse.json(
				{
					error: 'FILE_READ_ERROR',
					message: 'Failed to read file content',
					details: error instanceof Error ? error.message : 'Unknown error',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Validate CSV content
		const contentValidation = validateCSVContent(csvContent);
		if (!contentValidation.isValid) {
			return NextResponse.json(
				{
					error: 'INVALID_CSV_CONTENT',
					message: contentValidation.error || 'Invalid CSV content',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Parse CSV content
		const parseResult = parseCSV(csvContent);

		// Check if parsing was successful
		if (parseResult.errors.length > 0 && parseResult.transactions.length === 0) {
			return NextResponse.json(
				{
					error: 'CSV_PARSE_ERROR',
					message: 'Failed to parse CSV file',
					details: { errors: parseResult.errors },
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Store transactions in memory for summary endpoint
		storeTransactions(parseResult.transactions);

		// Return successful response with parsed data
		return NextResponse.json(
			{
				success: true,
				data: {
					transactions: parseResult.transactions,
					summary: {
						totalRows: parseResult.totalRows,
						validRows: parseResult.validRows,
						errorCount: parseResult.errors.length,
					},
					errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Upload API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while processing the file',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	}
}
