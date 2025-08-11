import { parseCSV, validateCSVContent } from '@/lib/csv-parser';
import { ErrorResponse } from '@/lib/types';
import { createTransactionRepository } from '@/lib/database';
import { BudgetTransactionIntegrationService } from '@/lib/budget-transaction-integration';
import { createSubscriptionService } from '@/lib/subscription-service';

function json(data: any, init?: { status?: number }) {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { NextResponse } = require('next/server');
		return NextResponse.json(data, init);
	} catch {
		return {
			json: async () => data,
			status: init?.status ?? 200,
			ok: (init?.status ?? 200) < 400,
		};
	}
}

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
export async function POST(request: any) {
	try {
		// Parse form data
		const formData = await request.formData();
		const file = formData.get('file') as File;

		// Validate file presence
		if (!file) {
			return json(
				{
					error: 'MISSING_FILE',
					message: 'No file provided in the request',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Validate file size
		if (file.size > MAX_FILE_SIZE) {
			return json(
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
			return json(
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
			return json(
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
			return json(
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
			return json(
				{
					error: 'CSV_PARSE_ERROR',
					message: 'Failed to parse CSV file',
					details: { errors: parseResult.errors },
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Store transactions in database using repository
		const repository = createTransactionRepository();
		try {
			await repository.initialize();

			// Create transactions without ID field for database insertion
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const transactionsForDb = parseResult.transactions.map(
				({ id, ...transaction }) => transaction,
			);
			const dbResult = await repository.createMany(transactionsForDb);

			// Update budgets with new transactions
			if (dbResult.created.length > 0) {
				try {
					const budgetIntegration = new BudgetTransactionIntegrationService(repository);
					await budgetIntegration.onTransactionsCreated(dbResult.created);
				} catch (budgetError) {
					console.error('Error updating budgets after transaction upload:', budgetError);
					// Don't fail the upload if budget updates fail
				}
			}

			// Detect subscriptions from uploaded transactions
			let subscriptionDetection = null;
			if (dbResult.created.length > 0) {
				try {
					const subscriptionService = createSubscriptionService(repository);

					// Get all transactions for better pattern detection (not just uploaded ones)
					const endDate = new Date();
					const startDate = new Date();
					startDate.setFullYear(endDate.getFullYear() - 2); // Last 2 years for pattern analysis
					const allTransactions = await repository.findByDateRange(startDate, endDate);

					// Detect subscriptions from all transactions
					const detectionResult =
						await subscriptionService.detectSubscriptions(allTransactions);

					// Only return detection results if we found candidates or matches
					if (
						detectionResult.candidates.length > 0 ||
						detectionResult.matches.length > 0
					) {
						subscriptionDetection = {
							candidates: detectionResult.candidates,
							matches: detectionResult.matches,
							totalAnalyzed: detectionResult.totalTransactions,
							alreadyFlagged: detectionResult.alreadyFlagged,
						};
					}
				} catch (subscriptionError) {
					console.error('Error detecting subscriptions after upload:', subscriptionError);
					// Don't fail the upload if subscription detection fails
				}
			}

			// Return successful response with database result and subscription detection
			return json(
				{
					success: true,
					data: {
						transactions: dbResult.created,
						duplicates: dbResult.duplicates,
						summary: {
							totalRows: parseResult.totalRows,
							validRows: parseResult.validRows,
							errorCount: parseResult.errors.length,
							created: dbResult.created.length,
							duplicateCount: dbResult.duplicates.length,
							totalProcessed: dbResult.totalProcessed,
						},
						errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
						subscriptionDetection,
					},
				},
				{ status: 200 },
			);
		} catch (dbError) {
			console.error('Database error during upload:', dbError);

			return json(
				{
					error: 'DATABASE_ERROR',
					message: 'Failed to store transactions in database',
					details: dbError instanceof Error ? dbError.message : 'Unknown database error',
				} as ErrorResponse,
				{ status: 500 },
			);
		} finally {
			await repository.close();
		}
	} catch (error) {
		console.error('Upload API error:', error);

		return json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while processing the file',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	}
}
