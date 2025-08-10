import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { SubscriptionBudgetIntegrationService } from '@/lib/subscription-budget-integration';
import { ErrorResponse } from '@/lib/types';

/**
 * GET /api/subscriptions/renewal-notifications - Get subscription renewal notifications in budget context
 * Query params: days (default: 7)
 */
export async function GET(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const url = new URL(request.url);
		const daysParam = url.searchParams.get('days');
		const days = daysParam ? parseInt(daysParam, 10) : 7;

		if (isNaN(days) || days < 1 || days > 365) {
			return NextResponse.json(
				{
					error: 'INVALID_PARAMETER',
					message: 'Days parameter must be a number between 1 and 365',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		const subscriptionIntegration = new SubscriptionBudgetIntegrationService(repository);
		const notifications =
			await subscriptionIntegration.createSubscriptionRenewalNotifications(days);

		return NextResponse.json(
			{
				success: true,
				data: {
					notifications,
					daysAhead: days,
					count: notifications.length,
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscription renewal notifications API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while fetching renewal notifications',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}

/**
 * POST /api/subscriptions/renewal-notifications - Create/refresh subscription renewal notifications
 * Body: { days?: number }
 */
export async function POST(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const body = await request.json();
		const days = body.days || 7;

		if (isNaN(days) || days < 1 || days > 365) {
			return NextResponse.json(
				{
					error: 'INVALID_PARAMETER',
					message: 'Days parameter must be a number between 1 and 365',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		const subscriptionIntegration = new SubscriptionBudgetIntegrationService(repository);
		const notifications =
			await subscriptionIntegration.createSubscriptionRenewalNotifications(days);

		return NextResponse.json(
			{
				success: true,
				data: {
					notifications,
					daysAhead: days,
					count: notifications.length,
					message: `Created ${notifications.length} renewal notifications for the next ${days} days`,
				},
			},
			{ status: 201 },
		);
	} catch (error) {
		console.error('Create subscription renewal notifications API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while creating renewal notifications',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
