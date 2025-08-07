import { NextResponse } from 'next/server';
import { getStoredTransactions, hasStoredTransactions } from '@/lib/storage';
import { calculateFinancialSummary } from '@/lib/financial-calculator';
import { ErrorResponse, FinancialSummary } from '@/lib/types';

/**
 * GET /api/summary - Retrieve financial summary of stored transactions
 */
export async function GET() {
	try {
		// Check if there are any stored transactions
		if (!hasStoredTransactions()) {
			// Return zero values when no transaction data exists
			const emptySummary: FinancialSummary = {
				totalIncome: 0,
				totalExpenses: 0,
				netAmount: 0,
				transactionCount: 0,
			};

			return NextResponse.json(
				{
					success: true,
					data: emptySummary,
					message: 'No transaction data available',
				},
				{ status: 200 },
			);
		}

		// Get stored transactions
		const transactions = getStoredTransactions();

		// Calculate financial summary using utility functions
		const summary = calculateFinancialSummary(transactions);

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

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while calculating financial summary',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	}
}
