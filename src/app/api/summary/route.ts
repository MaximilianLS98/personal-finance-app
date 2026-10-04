import { createTransactionRepository } from '@/lib/database';
import { ErrorResponse } from '@/lib/types';
import { NextResponse } from 'next/server';

// Runtime-safe JSON response helper that works in Jest without web Request globals
/**
 * GET /api/summary - Retrieve financial summary
 */
export async function GET() {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const summary = await repository.calculateSummary();

		// Include an empty-state message for a new database.
		const hasData = summary.transactionCount > 0;
		return NextResponse.json(
			hasData
				? {
						success: true,
						data: summary,
					}
				: {
						success: true,
						data: summary,
						message: 'No transaction data available',
					},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Summary API error:', error);

		if (error instanceof Error && error.message.includes('Repository not initialized')) {
			return NextResponse.json(
				{
					error: 'DATABASE_CONNECTION_ERROR',
					message: 'Failed to connect to database',
					details: error.message,
				} as ErrorResponse,
				{ status: 503 },
			);
		}

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while calculating financial summary',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
