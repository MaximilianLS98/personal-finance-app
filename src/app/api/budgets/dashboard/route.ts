/**
 * Budget Dashboard API Endpoint
 * GET /api/budgets/dashboard - Get aggregated dashboard data for all active budgets
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database/repository';
import { BudgetService } from '@/lib/budget-service';

/**
 * GET /api/budgets/dashboard
 * Get comprehensive dashboard data including all active budgets, progress, and alerts
 */
export async function GET(request: NextRequest) {
	try {
		// Initialize repository and service
		const repository = createTransactionRepository();
		await repository.initialize();
		const budgetService = new BudgetService(repository);

		// Get dashboard data
		const dashboardData = await budgetService.getBudgetDashboardData();

		await repository.close();

		return NextResponse.json({
			success: true,
			data: dashboardData,
		});
	} catch (error) {
		console.error('Error fetching budget dashboard data:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to fetch budget dashboard data',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}