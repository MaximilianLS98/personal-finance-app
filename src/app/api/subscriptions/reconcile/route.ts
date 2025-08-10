import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { createSubscriptionReconciliationService } from '@/lib/subscription-reconciliation-service';
import { ErrorResponse } from '@/lib/types';

/**
 * POST /api/subscriptions/reconcile - Reconcile subscriptions with transactions
 * Body: { subscriptionName?: string } (optional - reconciles specific subscription)
 */
export async function POST(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();
		const reconciliationService = createSubscriptionReconciliationService(repository);

		let body = {};
		try {
			body = await request.json();
		} catch {
			// Empty body is fine - means reconcile all
		}

		const { subscriptionName } = body as { subscriptionName?: string };

		let result;
		if (subscriptionName) {
			// Reconcile specific subscription
			const wasUpdated =
				await reconciliationService.reconcileSubscriptionByName(subscriptionName);
			result = {
				updated: wasUpdated ? 1 : 0,
				errors: [],
				message: wasUpdated
					? `Updated payment date for ${subscriptionName}`
					: `No updates needed for ${subscriptionName}`,
			};
		} else {
			// Reconcile all subscriptions
			const allResult = await reconciliationService.reconcileAllSubscriptions();
			result = {
				...allResult,
				message: `Reconciliation complete: ${allResult.updated} subscription${allResult.updated !== 1 ? 's' : ''} updated`,
			};
		}

		return NextResponse.json(
			{
				success: true,
				data: result,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscription reconciliation error:', error);

		return NextResponse.json(
			{
				error: 'RECONCILIATION_FAILED',
				message:
					error instanceof Error ? error.message : 'Failed to reconcile subscriptions',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
