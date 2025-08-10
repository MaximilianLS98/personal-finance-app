/**
 * Individual Budget API Endpoints
 * GET /api/budgets/[id] - Get specific budget with progress
 * PUT /api/budgets/[id] - Update existing budget
 * DELETE /api/budgets/[id] - Delete budget
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database/repository';
import { BudgetService } from '@/lib/budget-service';

/**
 * GET /api/budgets/[id]
 * Get specific budget with current progress
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

		// Get budget with progress
		const result = await budgetService.getBudgetWithProgress(id);
		
		await repository.close();

		if (!result) {
			return NextResponse.json(
				{
					success: false,
					error: 'Budget not found',
				},
				{ status: 404 }
			);
		}

		return NextResponse.json({
			success: true,
			data: result,
		});
	} catch (error) {
		console.error('Error fetching budget:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to fetch budget',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}

/**
 * PUT /api/budgets/[id]
 * Update an existing budget
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params;
		const body = await request.json();

		// Initialize repository and service
		const repository = createTransactionRepository();
		await repository.initialize();
		const budgetService = new BudgetService(repository);

		// Prepare updates (convert date strings to Date objects if provided)
		const updates: any = { ...body };
		if (updates.startDate) updates.startDate = new Date(updates.startDate);
		if (updates.endDate) updates.endDate = new Date(updates.endDate);
		if (updates.amount) updates.amount = parseFloat(updates.amount);

		// Update budget
		const updatedBudget = await budgetService.updateBudget(id, updates);

		await repository.close();

		if (!updatedBudget) {
			return NextResponse.json(
				{
					success: false,
					error: 'Budget not found',
				},
				{ status: 404 }
			);
		}

		return NextResponse.json({
			success: true,
			data: updatedBudget,
		});
	} catch (error) {
		console.error('Error updating budget:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to update budget',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/budgets/[id]
 * Delete a budget
 */
export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params;

		// Initialize repository and service
		const repository = createTransactionRepository();
		await repository.initialize();
		const budgetService = new BudgetService(repository);

		// Delete budget
		const deleted = await budgetService.deleteBudget(id);

		await repository.close();

		if (!deleted) {
			return NextResponse.json(
				{
					success: false,
					error: 'Budget not found',
				},
				{ status: 404 }
			);
		}

		return NextResponse.json({
			success: true,
			message: 'Budget deleted successfully',
		});
	} catch (error) {
		console.error('Error deleting budget:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to delete budget',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}