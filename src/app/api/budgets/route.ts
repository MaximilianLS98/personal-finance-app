/**
 * Budget Management API Endpoints
 * GET /api/budgets - List budgets with filtering
 * POST /api/budgets - Create new budget
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database/repository';
import { BudgetService } from '@/lib/budget-service';

/**
 * GET /api/budgets
 * List budgets with optional filtering
 * Query parameters:
 * - categoryId: Filter by category
 * - scenarioId: Filter by scenario
 * - activeOnly: Show only active budgets
 * - startDate, endDate: Filter by date range
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const categoryId = searchParams.get('categoryId') || undefined;
		const scenarioId = searchParams.get('scenarioId') || undefined;
		const activeOnly = searchParams.get('activeOnly') === 'true';
		const startDate = searchParams.get('startDate');
		const endDate = searchParams.get('endDate');

		// Initialize repository and service
		const repository = createTransactionRepository();
		await repository.initialize();
		const budgetService = new BudgetService(repository);

		// Build filter options
		const filterOptions: {
			categoryId?: string;
			scenarioId?: string;
			activeOnly?: boolean;
			dateRange?: { start: Date; end: Date };
		} = {};

		if (categoryId) filterOptions.categoryId = categoryId;
		if (scenarioId) filterOptions.scenarioId = scenarioId;
		if (activeOnly) filterOptions.activeOnly = activeOnly;
		if (startDate && endDate) {
			filterOptions.dateRange = {
				start: new Date(startDate),
				end: new Date(endDate),
			};
		}

		// Get budgets
		const budgets = await budgetService.getBudgets(filterOptions);

		await repository.close();

		return NextResponse.json({
			success: true,
			data: budgets,
		});
	} catch (error) {
		console.error('Error fetching budgets:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to fetch budgets',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}

/**
 * POST /api/budgets
 * Create a new budget
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		
		// Validate required fields
		const requiredFields = ['name', 'categoryId', 'amount', 'period', 'startDate', 'endDate'];
		for (const field of requiredFields) {
			if (!body[field]) {
				return NextResponse.json(
					{
						success: false,
						error: 'Missing required fields',
						message: `Field '${field}' is required`,
					},
					{ status: 400 }
				);
			}
		}

		// Initialize repository and service
		const repository = createTransactionRepository();
		await repository.initialize();
		const budgetService = new BudgetService(repository);

		// Create budget
		const budget = await budgetService.createBudget({
			name: body.name,
			description: body.description,
			categoryId: body.categoryId,
			amount: parseFloat(body.amount),
			currency: body.currency || 'NOK',
			period: body.period,
			startDate: new Date(body.startDate),
			endDate: new Date(body.endDate),
			alertThresholds: body.alertThresholds || [50, 75, 90, 100],
			scenarioId: body.scenarioId,
		});

		await repository.close();

		return NextResponse.json({
			success: true,
			data: budget,
		});
	} catch (error) {
		console.error('Error creating budget:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to create budget',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}