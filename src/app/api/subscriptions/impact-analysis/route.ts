import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { SubscriptionBudgetIntegrationService } from '@/lib/subscription-budget-integration';
import { ErrorResponse } from '@/lib/types';

/**
 * POST /api/subscriptions/impact-analysis - Analyze subscription change impact on budgets
 * Body: { subscriptionId: string, changeType: 'created' | 'updated' | 'deleted' }
 */
export async function POST(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const body = await request.json();
		const { subscriptionId, changeType } = body;

		if (!subscriptionId || !changeType) {
			return NextResponse.json(
				{
					error: 'MISSING_PARAMETERS',
					message: 'subscriptionId and changeType are required',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		if (!['created', 'updated', 'deleted'].includes(changeType)) {
			return NextResponse.json(
				{
					error: 'INVALID_CHANGE_TYPE',
					message: 'changeType must be one of: created, updated, deleted',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Get the subscription
		const subscription = await repository.findSubscriptionById(subscriptionId);
		if (!subscription) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Subscription not found',
				} as ErrorResponse,
				{ status: 404 },
			);
		}

		const subscriptionIntegration = new SubscriptionBudgetIntegrationService(repository);
		const impactAnalysis = await subscriptionIntegration.analyzeSubscriptionImpact(
			subscription,
			changeType,
		);

		return NextResponse.json(
			{
				success: true,
				data: {
					subscription: {
						id: subscription.id,
						name: subscription.name,
						amount: subscription.amount,
						billingFrequency: subscription.billingFrequency,
						categoryId: subscription.categoryId,
					},
					changeType,
					impact: impactAnalysis,
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscription impact analysis API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while analyzing subscription impact',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
