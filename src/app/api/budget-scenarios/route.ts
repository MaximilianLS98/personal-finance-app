/**
 * Budget Scenarios API Endpoints
 * GET /api/budget-scenarios - List all budget scenarios
 * POST /api/budget-scenarios - Create new budget scenario
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database/repository';
import { BudgetService } from '@/lib/budget-service';

/**
 * GET /api/budget-scenarios
 * List all budget scenarios with their budgets
 */
export async function GET(request: NextRequest) {
	try {
		// Initialize repository and service
		const repository = createTransactionRepository();
		await repository.initialize();
		const budgetService = new BudgetService(repository);

		// Get all scenarios
		const scenarios = await repository.findAllBudgetScenarios();

		await repository.close();

		return NextResponse.json({
			success: true,
			data: scenarios,
		});
	} catch (error) {
		console.error('Error fetching budget scenarios:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to fetch budget scenarios',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}

/**
 * POST /api/budget-scenarios
 * Create a new budget scenario
 * Body: { name, description?, copyFromScenarioId? }
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		
		// Validate required fields
		if (!body.name) {
			return NextResponse.json(
				{
					success: false,
					error: 'Missing required fields',
					message: 'Field "name" is required',
				},
				{ status: 400 }
			);
		}

		// Initialize repository and service
		const repository = createTransactionRepository();
		await repository.initialize();
		const budgetService = new BudgetService(repository);

		// Create scenario
		const scenario = await budgetService.createBudgetScenario(
			body.name,
			body.description,
			body.copyFromScenarioId
		);

		await repository.close();

		return NextResponse.json({
			success: true,
			data: scenario,
		});
	} catch (error) {
		console.error('Error creating budget scenario:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to create budget scenario',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}