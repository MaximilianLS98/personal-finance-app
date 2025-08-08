/**
 * Category Rules API endpoint
 * Handles CRUD operations for category rules (AI patterns)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import type { CategoryRule, ErrorResponse } from '@/lib/types';

/**
 * GET /api/category-rules - Get all category rules
 */
export async function GET(): Promise<NextResponse<CategoryRule[] | ErrorResponse>> {
	try {
		const repository = createTransactionRepository();
		await repository.initialize();
		
		const rules = await repository.getCategoryRules();
		await repository.close();
		
		return NextResponse.json(rules);
	} catch (error) {
		console.error('Failed to fetch category rules:', error);
		return NextResponse.json(
			{
				error: 'FETCH_FAILED',
				message: 'Failed to fetch category rules',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}

/**
 * POST /api/category-rules - Create a new category rule
 */
export async function POST(request: NextRequest): Promise<NextResponse<CategoryRule | ErrorResponse>> {
	try {
		const body = await request.json();
		const { categoryId, pattern, patternType, confidenceScore = 0.8 } = body;

		// Validate required fields
		if (!categoryId || typeof categoryId !== 'string') {
			return NextResponse.json(
				{
					error: 'INVALID_INPUT',
					message: 'Category ID is required and must be a string',
				} as ErrorResponse,
				{ status: 400 }
			);
		}

		if (!pattern || typeof pattern !== 'string') {
			return NextResponse.json(
				{
					error: 'INVALID_INPUT',
					message: 'Pattern is required and must be a string',
				} as ErrorResponse,
				{ status: 400 }
			);
		}

		if (!patternType || !['exact', 'contains', 'starts_with', 'regex'].includes(patternType)) {
			return NextResponse.json(
				{
					error: 'INVALID_INPUT',
					message: 'Pattern type is required and must be one of: exact, contains, starts_with, regex',
				} as ErrorResponse,
				{ status: 400 }
			);
		}

		const repository = createTransactionRepository();
		await repository.initialize();
		
		const rule = await repository.createCategoryRule({
			categoryId,
			pattern,
			patternType,
			confidenceScore: Math.min(1.0, Math.max(0.0, confidenceScore)), // Clamp between 0-1
			createdBy: 'user',
		});
		
		await repository.close();
		
		return NextResponse.json(rule, { status: 201 });
	} catch (error) {
		console.error('Failed to create category rule:', error);
		return NextResponse.json(
			{
				error: 'CREATE_FAILED',
				message: 'Failed to create category rule',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}