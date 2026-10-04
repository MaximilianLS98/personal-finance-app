import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { saveDetectedSubscriptions } from '@/lib/detected-subscription';
import { currencyCode } from '@/lib/money';
import type { SubscriptionCandidate, SubscriptionMatch } from '@/lib/subscription-pattern-engine';
import type { CreateSubscriptionRequest } from '@/lib/subscription-service';

interface ConfirmSubscriptionsRequest {
	candidates?: Array<{
		candidate: SubscriptionCandidate;
		overrides?: Partial<CreateSubscriptionRequest>;
	}>;
	matches?: SubscriptionMatch[];
}
/** Candidates and existing matches are committed together, so a failed retry cannot duplicate earlier successes. */
export async function POST(request: NextRequest) {
	try {
		const { candidates = [], matches = [] } = (await request.json()) as ConfirmSubscriptionsRequest;
		if (
			!Array.isArray(candidates) ||
			!Array.isArray(matches) ||
			(!candidates.length && !matches.length) ||
			candidates.length > 200 ||
			matches.length > 10000
		)
			throw new Error('Select valid candidates or matches to confirm');
		const db = await financeDb();
		const results = db.transaction(() => {
			const created = candidates.length
				? saveDetectedSubscriptions(
						db,
						candidates.map(({ candidate, overrides = {} }) => ({
							name: overrides.name || candidate.name,
							description: overrides.description,
							amount: overrides.amount ?? candidate.amount,
							currency: overrides.currency ?? candidate.currency,
							billingFrequency: overrides.billingFrequency ?? candidate.billingFrequency,
							customFrequencyDays: overrides.customFrequencyDays,
							categoryId: overrides.categoryId || candidate.categoryId,
							transactionIds: candidate.matchingTransactions.map((transaction) => transaction.id),
							isActive: overrides.isActive,
							startDate: overrides.startDate,
							nextPaymentDate: overrides.nextPaymentDate,
							website: overrides.website,
							cancellationUrl: overrides.cancellationUrl,
							notes: overrides.notes,
							patterns: candidate.detectedPatterns,
						})),
					)
				: [];
			const flagged = matches.map((match) => {
				const subscription = db
					.query('SELECT id,name,currency FROM subscriptions WHERE id=?')
					.get(match.subscription?.id) as { id: string; name: string; currency: string } | null;
				const transaction = db
					.query('SELECT id,amount,type,currency,subscription_id FROM transactions WHERE id=?')
					.get(match.transaction?.id) as {
					id: string;
					amount: number;
					type: string;
					currency: string | null;
					subscription_id: string | null;
				} | null;
				if (!subscription || !transaction)
					throw new Error('A selected subscription or transaction no longer exists');
				if (
					transaction.type !== 'expense' ||
					transaction.amount >= 0 ||
					currencyCode(subscription.currency) !== currencyCode(transaction.currency)
				)
					throw new Error('Existing matches must be expense payments in the subscription currency');
				if (transaction.subscription_id && transaction.subscription_id !== subscription.id)
					throw new Error('A selected payment is already linked to another subscription');
				db.query(
					'UPDATE transactions SET subscription_id=?,is_subscription=1,updated_at=? WHERE id=?',
				).run(subscription.id, new Date().toISOString(), transaction.id);
				if (!transaction.subscription_id && match.pattern?.id)
					db.query(
						'UPDATE subscription_patterns SET confidence_score=MIN(1,confidence_score+0.1*(1-confidence_score)),updated_at=? WHERE id=? AND subscription_id=?',
					).run(new Date().toISOString(), match.pattern.id, subscription.id);
				return {
					transactionId: transaction.id,
					subscriptionId: subscription.id,
					subscriptionName: subscription.name,
					confidence: match.confidence,
				};
			});
			return {
				createdSubscriptions: created.map((item) => item.subscription),
				flaggedTransactions: flagged,
				errors: [],
				summary: {
					subscriptionsCreated: created.length,
					transactionsFlagged: flagged.length,
					errorsCount: 0,
				},
			};
		})();
		return NextResponse.json({ success: true, data: results });
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
