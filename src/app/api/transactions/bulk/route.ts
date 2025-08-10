import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import {
	BulkTransactionProcessor,
	type BulkUpdateOperation,
} from '@/lib/bulk-transaction-processor';
import { ErrorResponse } from '@/lib/types';

/**
 * POST /api/transactions/bulk - Handle bulk transaction operations
 * Body: { operation: 'update' | 'delete', data: BulkUpdateOperation[] | string[] }
 */
export async function POST(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const body = await request.json();
		const { operation, data, options = {} } = body;

		if (!operation || !data) {
			return NextResponse.json(
				{
					error: 'INVALID_REQUEST',
					message: 'Operation and data are required',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		const processor = new BulkTransactionProcessor(repository);
		let result;

		switch (operation) {
			case 'update':
				if (!Array.isArray(data) || data.length === 0) {
					return NextResponse.json(
						{
							error: 'INVALID_DATA',
							message: 'Data must be a non-empty array of update operations',
						} as ErrorResponse,
						{ status: 400 },
					);
				}

				// Validate update operations
				for (const op of data) {
					if (!op.transactionId || !op.updates) {
						return NextResponse.json(
							{
								error: 'INVALID_UPDATE_OPERATION',
								message:
									'Each update operation must have transactionId and updates',
							} as ErrorResponse,
							{ status: 400 },
						);
					}
				}

				result = await processor.processBulkUpdates(data as BulkUpdateOperation[], options);
				break;

			case 'delete':
				if (!Array.isArray(data) || data.length === 0) {
					return NextResponse.json(
						{
							error: 'INVALID_DATA',
							message: 'Data must be a non-empty array of transaction IDs',
						} as ErrorResponse,
						{ status: 400 },
					);
				}

				// Validate transaction IDs
				for (const id of data) {
					if (typeof id !== 'string' || !id.trim()) {
						return NextResponse.json(
							{
								error: 'INVALID_TRANSACTION_ID',
								message: 'All transaction IDs must be non-empty strings',
							} as ErrorResponse,
							{ status: 400 },
						);
					}
				}

				result = await processor.processBulkDeletions(data as string[], options);
				break;

			default:
				return NextResponse.json(
					{
						error: 'INVALID_OPERATION',
						message: 'Operation must be "update" or "delete"',
					} as ErrorResponse,
					{ status: 400 },
				);
		}

		return NextResponse.json(
			{
				success: true,
				data: result,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Bulk transactions API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while processing bulk operations',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}

/**
 * PUT /api/transactions/bulk - Optimize budget calculations
 * Body: { categoryIds?: string[] }
 */
export async function PUT(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const body = await request.json();
		const { categoryIds } = body;

		const processor = new BulkTransactionProcessor(repository);
		await processor.optimizeBudgetCalculations(categoryIds);

		return NextResponse.json(
			{
				success: true,
				message: 'Budget calculations optimized successfully',
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Budget optimization API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while optimizing budget calculations',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
