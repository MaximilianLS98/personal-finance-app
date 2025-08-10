/**
 * Budget Scenario Management API Endpoints
 * GET /api/budget-scenarios/[id] - Get specific scenario
 * PUT /api/budget-scenarios/[id] - Update scenario
 * DELETE /api/budget-scenarios/[id] - Delete/archive scenario
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database/repository';
import { BudgetService } from '@/lib/budget-service';

/**
 * GET /api/budget-scenarios/[id]
 * Get a specific budget scenario by ID
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;

		// Initialize repository
		const repository = createTransactionRepository();
		await repository.initialize();

		// Get scenario
		const scenario = await repository.findBudgetScenarioById(id);

		await repository.close();

		if (!scenario) {
			return NextResponse.json(
				{
					success: false,
					error: 'Scenario not found',
				},
				{ status: 404 },
			);
		}

		return NextResponse.json({
			success: true,
			data: scenario,
		});
	} catch (error) {
		console.error('Error fetching budget scenario:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to fetch budget scenario',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 },
		);
	}
}

/**
 * PUT /api/budget-scenarios/[id]
 * Update a budget scenario
 * Body: { name?, description? }
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const body = await request.json();

		// Initialize repository
		const repository = createTransactionRepository();
		await repository.initialize();

		// Update scenario
		const scenario = await repository.updateBudgetScenario(id, body);

		await repository.close();

		if (!scenario) {
			return NextResponse.json(
				{
					success: false,
					error: 'Scenario not found',
				},
				{ status: 404 },
			);
		}

		return NextResponse.json({
			success: true,
			data: scenario,
		});
	} catch (error) {
		console.error('Error updating budget scenario:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to update budget scenario',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 },
		);
	}
}

/**
 * DELETE /api/budget-scenarios/[id]
 * Delete a budget scenario (cannot delete active scenario)
 */
export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const { id } = await params;

		// Initialize repository
		const repository = createTransactionRepository();
		await repository.initialize();

		// Check if scenario is active
		const scenario = await repository.findBudgetScenarioById(id);
		if (scenario?.isActive) {
			await repository.close();
			return NextResponse.json(
				{
					success: false,
					error: 'Cannot delete active scenario',
					message: 'Please activate another scenario before deleting this one',
				},
				{ status: 400 },
			);
		}

		// Delete scenario
		const success = await repository.deleteBudgetScenario(id);

		await repository.close();

		if (!success) {
			return NextResponse.json(
				{
					success: false,
					error: 'Scenario not found',
				},
				{ status: 404 },
			);
		}

		return NextResponse.json({
			success: true,
			message: 'Scenario deleted successfully',
		});
	} catch (error) {
		console.error('Error deleting budget scenario:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to delete budget scenario',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 },
		);
	}
}
