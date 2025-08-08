/**
 * Bulk category suggestion API endpoint
 * Provides intelligent category suggestions for multiple transaction descriptions at once
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCategoryEngine } from '@/lib/categorization-engine';
import type { CategorySuggestion, ErrorResponse } from '@/lib/types';

interface BulkSuggestionRequest {
	transactions: Array<{
		id: string;
		description: string;
	}>;
}

interface BulkSuggestionResponse {
	suggestions: Record<string, CategorySuggestion | null>;
}

/**
 * POST /api/categories/suggest-bulk - Get category suggestions for multiple descriptions
 * Body: { transactions: [{ id: string, description: string }] }
 */
export async function POST(request: NextRequest): Promise<NextResponse<BulkSuggestionResponse | ErrorResponse>> {
	try {
		const body: BulkSuggestionRequest = await request.json();
		const { transactions } = body;

		if (!Array.isArray(transactions)) {
			return NextResponse.json(
				{
					error: 'INVALID_INPUT',
					message: 'Transactions must be an array',
				} as ErrorResponse,
				{ status: 400 }
			);
		}

		// Validate transactions array
		for (const transaction of transactions) {
			if (!transaction.id || !transaction.description || typeof transaction.description !== 'string') {
				return NextResponse.json(
					{
						error: 'INVALID_INPUT',
						message: 'Each transaction must have an id and description string',
					} as ErrorResponse,
					{ status: 400 }
				);
			}
		}

		const engine = getCategoryEngine();
		const suggestions: Record<string, CategorySuggestion | null> = {};

		// Process all transactions in parallel for better performance
		const suggestionPromises = transactions.map(async (transaction) => {
			try {
				const suggestion = await engine.suggestCategory(transaction.description);
				return { id: transaction.id, suggestion };
			} catch (error) {
				console.error(`Error getting suggestion for transaction ${transaction.id}:`, error);
				return { id: transaction.id, suggestion: null };
			}
		});

		const results = await Promise.all(suggestionPromises);
		
		// Convert results to record format
		results.forEach(({ id, suggestion }) => {
			suggestions[id] = suggestion;
		});

		return NextResponse.json({ suggestions });
	} catch (error) {
		console.error('Failed to get bulk suggestions:', error);
		return NextResponse.json(
			{
				error: 'SUGGESTION_FAILED',
				message: 'Failed to generate category suggestions',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}