import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { createSubscriptionService } from '@/lib/subscription-service';
import { ErrorResponse } from '@/lib/types';
import type { SubscriptionCandidate, SubscriptionMatch } from '@/lib/subscription-pattern-engine';

/**
 * Request body for confirming subscription candidates and matches
 */
interface ConfirmSubscriptionsRequest {
	/** Subscription candidates to confirm and create */
	candidates?: Array<{
		candidate: SubscriptionCandidate;
		overrides?: {
			name?: string;
			description?: string;
			amount?: number;
			currency?: string;
			billingFrequency?: 'monthly' | 'quarterly' | 'annually' | 'custom';
			customFrequencyDays?: number;
			nextPaymentDate?: string;
			categoryId?: string;
			startDate?: string;
			notes?: string;
			website?: string;
			cancellationUrl?: string;
		};
	}>;
	/** Subscription matches to confirm and flag transactions */
	matches?: SubscriptionMatch[];
}

/**
 * POST /api/subscriptions/confirm - Confirm detected subscriptions and create/flag them
 */
export async function POST(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const body = (await request.json()) as ConfirmSubscriptionsRequest;
		const { candidates = [], matches = [] } = body;

		const subscriptionService = createSubscriptionService(repository);
		const results = {
			createdSubscriptions: [] as any[],
			flaggedTransactions: [] as any[],
			errors: [] as string[],
		};

		// Process subscription candidates
		for (const { candidate, overrides } of candidates) {
			try {
				// Convert string dates to Date objects if provided
				const processedOverrides = overrides
					? {
							...overrides,
							nextPaymentDate: overrides.nextPaymentDate
								? new Date(overrides.nextPaymentDate)
								: undefined,
							startDate: overrides.startDate
								? new Date(overrides.startDate)
								: undefined,
						}
					: undefined;

				const subscription = await subscriptionService.confirmSubscription({
					candidate,
					overrides: processedOverrides,
				});

				results.createdSubscriptions.push(subscription);
			} catch (error) {
				const errorMessage = `Failed to create subscription "${candidate.name}": ${
					error instanceof Error ? error.message : 'Unknown error'
				}`;
				console.error(errorMessage, error);
				results.errors.push(errorMessage);
			}
		}

		// Process subscription matches
		if (matches.length > 0) {
			try {
				await subscriptionService.confirmSubscriptionMatches(matches);

				// Get details of flagged transactions for response
				for (const match of matches) {
					results.flaggedTransactions.push({
						transactionId: match.transaction.id,
						subscriptionId: match.subscription.id,
						subscriptionName: match.subscription.name,
						confidence: match.confidence,
					});
				}
			} catch (error) {
				const errorMessage = `Failed to confirm subscription matches: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`;
				console.error(errorMessage, error);
				results.errors.push(errorMessage);
			}
		}

		// Return results
		return NextResponse.json(
			{
				success: true,
				data: {
					...results,
					summary: {
						subscriptionsCreated: results.createdSubscriptions.length,
						transactionsFlagged: results.flaggedTransactions.length,
						errorsCount: results.errors.length,
					},
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscription confirmation API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while confirming subscriptions',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
