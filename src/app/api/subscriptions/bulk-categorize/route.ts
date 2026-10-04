import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { saveDetectedSubscriptions } from '@/lib/detected-subscription';

export async function POST(request: NextRequest) {
	try {
		const { subscriptions } = await request.json();
		const created = saveDetectedSubscriptions(await financeDb(), subscriptions);
		return NextResponse.json(
			{
				success: true,
				data: {
					created,
					errors: [],
					summary: {
						totalProcessed: created.length,
						successfullyCreated: created.length,
						errors: 0,
						totalFlaggedTransactions: created.reduce(
							(sum, item) => sum + item.flaggedTransactions,
							0,
						),
						totalCreatedPatterns: created.reduce((sum, item) => sum + item.createdPatterns, 0),
					},
				},
			},
			{ status: 201 },
		);
	} catch (error) {
		return NextResponse.json(
			{
				success: false,
				error: 'VALIDATION_ERROR',
				message: error instanceof Error ? error.message : 'Unable to confirm subscriptions',
			},
			{ status: 400 },
		);
	}
}
