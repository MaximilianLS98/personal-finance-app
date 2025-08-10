/**
 * Budget Scenario Activation API Endpoint
 * PUT /api/budget-scenarios/[id]/activate - Activate a budget scenario
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database/repository';
import { BudgetService } from '@/lib/budget-service';

/**
 * PUT /api/budget-scenarios/[id]/activate
 * Activate a budget scenario (deactivates all others)
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params;

		// Initialize repository and service
		const repository = createTransactionRepository();
		await repository.initialize();
		const budgetService = new BudgetService(repository);

		// Activate scenario
		await budgetService.activateBudgetScenario(id);

		await repository.close();

		return NextResponse.json({
			success: true,
			message: 'Budget scenario activated successfully',
		});
	} catch (error) {
		console.error('Error activating budget scenario:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to activate budget scenario',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}