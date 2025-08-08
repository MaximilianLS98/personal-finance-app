/**
 * Individual category API endpoints
 * Handles GET, PUT, DELETE operations for specific categories
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import type { Category, ErrorResponse } from '@/lib/types';

/**
 * GET /api/categories/[id] - Get a specific category
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse<Category | ErrorResponse>> {
	try {
		const { id } = await context.params;
		
		const repository = createTransactionRepository();
		await repository.initialize();
		
		const category = await repository.getCategoryById(id);
		await repository.close();
		
		if (!category) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Category not found',
				} as ErrorResponse,
				{ status: 404 }
			);
		}
		
		return NextResponse.json(category);
	} catch (error) {
		console.error('Failed to fetch category:', error);
		return NextResponse.json(
			{
				error: 'FETCH_FAILED',
				message: 'Failed to fetch category',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}

/**
 * PUT /api/categories/[id] - Update a category
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse<Category | ErrorResponse>> {
	try {
		const { id } = await context.params;
		const body = await request.json();
		const { name, description, color, icon, parentId, isActive } = body;

		const repository = createTransactionRepository();
		await repository.initialize();
		
		const updatedCategory = await repository.updateCategory(id, {
			name,
			description,
			color,
			icon,
			parentId,
			isActive,
		});
		
		await repository.close();
		
		if (!updatedCategory) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Category not found',
				} as ErrorResponse,
				{ status: 404 }
			);
		}
		
		return NextResponse.json(updatedCategory);
	} catch (error) {
		console.error('Failed to update category:', error);
		return NextResponse.json(
			{
				error: 'UPDATE_FAILED',
				message: 'Failed to update category',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/categories/[id] - Delete a category
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse<{ success: boolean } | ErrorResponse>> {
	try {
		const { id } = await context.params;
		
		const repository = createTransactionRepository();
		await repository.initialize();
		
		const deleted = await repository.deleteCategory(id);
		await repository.close();
		
		if (!deleted) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Category not found',
				} as ErrorResponse,
				{ status: 404 }
			);
		}
		
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Failed to delete category:', error);
		return NextResponse.json(
			{
				error: 'DELETE_FAILED',
				message: 'Failed to delete category',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}