import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { ErrorResponse } from '@/lib/types';
import type { PaginationOptions } from '@/lib/database/types';

/**
 * GET /api/transactions - Retrieve transactions with optional pagination and filtering
 * Query params: page, limit, sortBy, sortOrder, from, to, type, search
 */
export async function GET(request: NextRequest) {
	const repository = createTransactionRepository();
	
	try {
		await repository.initialize();

		const url = new URL(request.url);
		const searchParams = url.searchParams;

		// Check if pagination is requested
		const page = searchParams.get('page');
		const limit = searchParams.get('limit');
		
		// If no pagination params, return all transactions (legacy support)
		if (!page && !limit) {
			const transactions = await repository.findAll();
			return NextResponse.json(
				{
					success: true,
					data: transactions,
				},
				{ status: 200 },
			);
		}

		// Parse pagination and filtering options
		const options: PaginationOptions = {
			page: parseInt(page || '1', 10),
			limit: parseInt(limit || '25', 10),
			sortBy: searchParams.get('sortBy') || 'date',
			sortOrder: (searchParams.get('sortOrder') as 'ASC' | 'DESC') || 'DESC',
			transactionType: (searchParams.get('type') as 'all' | 'income' | 'expense' | 'transfer') || 'all',
			searchTerm: searchParams.get('search') || undefined,
		};

		// Parse date range
		const fromParam = searchParams.get('from');
		const toParam = searchParams.get('to');
		if (fromParam || toParam) {
			options.dateRange = {
				from: fromParam ? new Date(fromParam) : undefined,
				to: toParam ? new Date(toParam) : undefined,
			};
		}

		const result = await repository.findWithPagination(options);

		return NextResponse.json(
			{
				success: true,
				...result,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Transactions API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while fetching transactions',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}