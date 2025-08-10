import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { createSubscriptionPatternEngine } from '@/lib/subscription-pattern-engine';
import { ErrorResponse } from '@/lib/types';

/**
 * POST /api/subscriptions/detect - Detect potential subscriptions from transactions
 * Body: { transactionIds?: string[], dateRange?: { from: string, to: string } }
 */
export async function POST(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		interface DetectBody {
			transactionIds?: string[];
			dateRange?: { from?: string; to?: string };
		}

		let body: DetectBody = {};
		try {
			body = (await request.json()) as DetectBody;
		} catch (jsonError) {
			// Handle empty or invalid JSON body
			console.warn('Invalid JSON in request body, using empty object:', jsonError);
		}

		const { transactionIds, dateRange } = body;

		let transactions;

		if (transactionIds && Array.isArray(transactionIds)) {
			// Detect from specific transactions
			transactions = [];
			for (const id of transactionIds) {
				const transaction = await repository.findById(id);
				if (transaction) {
					transactions.push(transaction);
				}
			}
		} else if (dateRange?.from && dateRange?.to) {
			// Detect from date range
			transactions = await repository.findByDateRange(
				new Date(dateRange.from),
				new Date(dateRange.to),
			);
		} else {
			// Detect from all transactions (last 2 years by default)
			const endDate = new Date();
			const startDate = new Date();
			startDate.setFullYear(endDate.getFullYear() - 2);
			transactions = await repository.findByDateRange(startDate, endDate);
		}

		if (transactions.length === 0) {
			return NextResponse.json(
				{
					success: true,
					data: {
						candidates: [],
						matches: [],
						message: 'No transactions found for analysis',
					},
				},
				{ status: 200 },
			);
		}

		// Create detection engine and analyze transactions
		const detectionEngine = createSubscriptionPatternEngine(repository);

		// Detect new subscription candidates
		const candidates = await detectionEngine.detectSubscriptions(transactions);

		// Match against existing subscriptions
		const matches = await detectionEngine.matchExistingSubscriptions(transactions);

		return NextResponse.json(
			{
				success: true,
				data: {
					candidates,
					matches,
					analyzedTransactions: transactions.length,
					message: `Found ${candidates.length} potential subscriptions and ${matches.length} existing subscription matches`,
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscription detection API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred during subscription detection',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
