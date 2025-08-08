/**
 * Category learning API endpoint
 * Allows the system to learn from user categorization choices
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCategoryEngine } from '@/lib/categorization-engine';
import type { ErrorResponse } from '@/lib/types';

interface LearnRequest {
	description: string;
	categoryId: string;
	wasCorrectSuggestion?: boolean;
}

/**
 * POST /api/categories/learn - Learn from user categorization
 * Body: { description: string, categoryId: string, wasCorrectSuggestion?: boolean }
 */
export async function POST(request: NextRequest): Promise<NextResponse<{ success: true } | ErrorResponse>> {
	try {
		const body: LearnRequest = await request.json();
		const { description, categoryId, wasCorrectSuggestion = false } = body;

		if (!description || typeof description !== 'string') {
			return NextResponse.json(
				{
					error: 'INVALID_INPUT',
					message: 'Description is required and must be a string',
				} as ErrorResponse,
				{ status: 400 }
			);
		}

		if (!categoryId || typeof categoryId !== 'string') {
			return NextResponse.json(
				{
					error: 'INVALID_INPUT',
					message: 'Category ID is required and must be a string',
				} as ErrorResponse,
				{ status: 400 }
			);
		}

		const engine = getCategoryEngine();
		await engine.learnFromUserAction(description, categoryId, wasCorrectSuggestion);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Failed to learn from user action:', error);
		return NextResponse.json(
			{
				error: 'LEARNING_FAILED',
				message: 'Failed to learn from user categorization',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}