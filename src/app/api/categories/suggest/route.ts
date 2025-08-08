/**
 * Category suggestion API endpoint
 * Provides intelligent category suggestions for transaction descriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCategoryEngine } from '@/lib/categorization-engine';
import type { CategorySuggestion, ErrorResponse } from '@/lib/types';

/**
 * POST /api/categories/suggest - Get category suggestion for a description
 * Body: { description: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse<CategorySuggestion | null | ErrorResponse>> {
	try {
		const body = await request.json();
		const { description } = body;

		if (!description || typeof description !== 'string') {
			return NextResponse.json(
				{
					error: 'INVALID_INPUT',
					message: 'Description is required and must be a string',
				} as ErrorResponse,
				{ status: 400 }
			);
		}

		const engine = getCategoryEngine();
		const suggestion = await engine.suggestCategory(description);

		return NextResponse.json(suggestion);
	} catch (error) {
		console.error('Failed to get category suggestion:', error);
		return NextResponse.json(
			{
				error: 'SUGGESTION_FAILED',
				message: 'Failed to generate category suggestion',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}