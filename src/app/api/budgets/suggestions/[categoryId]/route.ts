/**
 * Budget Suggestions API Endpoint
 * GET /api/budgets/suggestions/[categoryId] - Get smart budget suggestions for a category
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database/repository';
import { BudgetService } from '@/lib/budget-service';

/**
 * GET /api/budgets/suggestions/[categoryId]
 * Get intelligent budget suggestions for a specific category
 * Query parameters:
 * - period: 'monthly' or 'yearly'
 * - startDate, endDate: Budget period dates
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ categoryId: string }> }
) {
	try {
		const { categoryId } = await params;
		const { searchParams } = new URL(request.url);
		
		const period = searchParams.get('period') as 'monthly' | 'yearly' || 'monthly';
		const startDate = searchParams.get('startDate');
		const endDate = searchParams.get('endDate');

		// Validate required parameters
		if (!startDate || !endDate) {
			return NextResponse.json(
				{
					success: false,
					error: 'Missing required parameters',
					message: 'startDate and endDate are required',
				},
				{ status: 400 }
			);
		}

		// Initialize repository and service
		const repository = createTransactionRepository();
		await repository.initialize();
		const budgetService = new BudgetService(repository);

		// Create budget period
		const budgetPeriod = {
			type: period,
			startDate: new Date(startDate),
			endDate: new Date(endDate),
		};

		// Get suggestions
		const suggestions = await budgetService.getBudgetSuggestions(categoryId, budgetPeriod);

		await repository.close();

		return NextResponse.json({
			success: true,
			data: suggestions,
		});
	} catch (error) {
		console.error('Error fetching budget suggestions:', error);
		
		// Handle specific error cases
		if (error instanceof Error && error.message.includes('Category not found')) {
			return NextResponse.json(
				{
					success: false,
					error: 'Category not found',
				},
				{ status: 404 }
			);
		}

		return NextResponse.json(
			{
				success: false,
				error: 'Failed to fetch budget suggestions',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}