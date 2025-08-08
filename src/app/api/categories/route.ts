/**
 * Categories API endpoint
 * Handles CRUD operations for transaction categories
 */

import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import type { Category, ErrorResponse } from '@/lib/types';

/**
 * GET /api/categories - Get all categories
 */
export async function GET(): Promise<NextResponse<Category[] | ErrorResponse>> {
	try {
		const repository = createTransactionRepository();
		await repository.initialize();
		
		const categories = await repository.getCategories();
		await repository.close();
		
		return NextResponse.json(categories);
	} catch (error) {
		console.error('Failed to fetch categories:', error);
		return NextResponse.json(
			{
				error: 'FETCH_FAILED',
				message: 'Failed to fetch categories',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}

/**
 * POST /api/categories - Create a new category
 */
export async function POST(request: NextRequest): Promise<NextResponse<Category | ErrorResponse>> {
	try {
		const body = await request.json();
		const { name, description, color, icon, parentId } = body;

		// Validate required fields
		if (!name || typeof name !== 'string') {
			return NextResponse.json(
				{
					error: 'INVALID_INPUT',
					message: 'Category name is required and must be a string',
				} as ErrorResponse,
				{ status: 400 }
			);
		}

		if (!color || typeof color !== 'string') {
			return NextResponse.json(
				{
					error: 'INVALID_INPUT',
					message: 'Category color is required and must be a string',
				} as ErrorResponse,
				{ status: 400 }
			);
		}

		if (!icon || typeof icon !== 'string') {
			return NextResponse.json(
				{
					error: 'INVALID_INPUT',
					message: 'Category icon is required and must be a string',
				} as ErrorResponse,
				{ status: 400 }
			);
		}

		const repository = createTransactionRepository();
		await repository.initialize();
		
		const category = await repository.createCategory({
			name,
			description,
			color,
			icon,
			parentId,
		});
		
		await repository.close();
		
		return NextResponse.json(category, { status: 201 });
	} catch (error) {
		console.error('Failed to create category:', error);
		return NextResponse.json(
			{
				error: 'CREATE_FAILED',
				message: 'Failed to create category',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 }
		);
	}
}