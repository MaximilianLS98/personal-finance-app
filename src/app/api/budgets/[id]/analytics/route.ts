/**
 * Budget Analytics API Endpoint
 * GET /api/budgets/[id]/analytics - Get detailed budget performance analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database/repository';
import { BudgetService } from '@/lib/budget-service';

/**
 * GET /api/budgets/[id]/analytics
 * Get detailed budget performance analysis including variance and projections
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params;

		// Initialize repository and service
		const repository = createTransactionRepository();
		await repository.initialize();
		const budgetService = new BudgetService(repository);

		// Get detailed analytics
		const analytics = await budgetService.analyzeBudgetPerformance(id);

		await repository.close();

		return NextResponse.json({
			success: true,
			data: analytics,
		});
	} catch (error) {
		console.error('Error fetching budget analytics:', error);
		
		// Handle specific error cases
		if (error instanceof Error && error.message.includes('Budget not found')) {
			return NextResponse.json(
				{
					success: false,
					error: 'Budget not found',
				},
				{ status: 404 }
			);
		}

		return NextResponse.json(
			{
				success: false,
				error: 'Failed to fetch budget analytics',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}