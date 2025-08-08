import { NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { ErrorResponse } from '@/lib/types';

/**
 * GET /api/transactions - Retrieve all transactions
 */
export async function GET() {
	const repository = createTransactionRepository();
	
	try {
		await repository.initialize();
		const transactions = await repository.findAll();

		return NextResponse.json(
			{
				success: true,
				data: transactions,
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