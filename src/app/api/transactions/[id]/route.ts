import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { getCategoryEngine } from '@/lib/categorization-engine';
import { ErrorResponse } from '@/lib/types';

/**
 * PUT /api/transactions/[id] - Update a transaction
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
	const repository = createTransactionRepository();
	
	try {
		const { id } = await context.params;
		const body = await request.json();
		
		await repository.initialize();

		// Get the original transaction before updating to check for category changes
		const originalTransaction = await repository.findById(id);
		if (!originalTransaction) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Transaction not found',
				} as ErrorResponse,
				{ status: 404 },
			);
		}

		// Parse the date if provided
		const updates = {
			...body,
			...(body.date && { date: new Date(body.date) }),
		};

		const updatedTransaction = await repository.update(id, updates);

		// Check if category was updated and learn from it
		if (updates.categoryId !== undefined && updates.categoryId !== originalTransaction.categoryId && updatedTransaction) {
			try {
				const engine = getCategoryEngine();
				
				// If user assigned a category (not removing it)
				if (updates.categoryId) {
					// Check if this was accepting a suggestion or manual assignment
					const currentSuggestion = await engine.suggestCategory(originalTransaction.description);
					const wasCorrectSuggestion = currentSuggestion?.category.id === updates.categoryId;
					
					// Learn from the user's choice
					await engine.learnFromUserAction(
						originalTransaction.description,
						updates.categoryId,
						wasCorrectSuggestion
					);
				}
			} catch (learningError) {
				// Don't fail the update if learning fails, just log it
				console.warn('Failed to learn from category assignment:', learningError);
			}
		}

		if (!updatedTransaction) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Transaction not found',
				} as ErrorResponse,
				{ status: 404 },
			);
		}

		return NextResponse.json(
			{
				success: true,
				data: updatedTransaction,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Update transaction API error:', error);

		// Handle constraint violations (duplicates)
		if (error instanceof Error && error.message.includes('duplicate')) {
			return NextResponse.json(
				{
					error: 'DUPLICATE_TRANSACTION',
					message: 'This update would create a duplicate transaction',
					details: error.message,
				} as ErrorResponse,
				{ status: 409 },
			);
		}

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while updating transaction',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}

/**
 * DELETE /api/transactions/[id] - Delete a transaction
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
	const repository = createTransactionRepository();
	
	try {
		const { id } = await context.params;
		
		await repository.initialize();
		const deleted = await repository.delete(id);

		if (!deleted) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Transaction not found',
				} as ErrorResponse,
				{ status: 404 },
			);
		}

		return NextResponse.json(
			{
				success: true,
				message: 'Transaction deleted successfully',
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Delete transaction API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while deleting transaction',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}