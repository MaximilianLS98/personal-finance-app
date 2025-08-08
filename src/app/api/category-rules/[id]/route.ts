/**
 * Individual category rule API endpoints
 * Handles DELETE operations for specific category rules
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import type { ErrorResponse } from '@/lib/types';

/**
 * DELETE /api/category-rules/[id] - Delete a category rule
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse<{ success: boolean } | ErrorResponse>> {
	try {
		const { id } = await context.params;
		
		const repository = createTransactionRepository();
		await repository.initialize();
		
		const deleted = await repository.deleteCategoryRule(id);
		await repository.close();
		
		if (!deleted) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Category rule not found',
				} as ErrorResponse,
				{ status: 404 }
			);
		}
		
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Failed to delete category rule:', error);
		return NextResponse.json(
			{
				error: 'DELETE_FAILED',
				message: 'Failed to delete category rule',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}