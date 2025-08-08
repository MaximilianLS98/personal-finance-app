import { NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { ErrorResponse } from '@/lib/types';

/**
 * GET /api/summary - Retrieve financial summary from database using repository
 */
export async function GET() {
	const repository = createTransactionRepository();
	
	try {
		await repository.initialize();

		// Calculate financial summary using repository method with efficient SQL aggregation
		const summary = await repository.calculateSummary();

		// Return successful response with summary data
		return NextResponse.json(
			{
				success: true,
				data: summary,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Summary API error:', error);

		// Handle database-specific errors
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
