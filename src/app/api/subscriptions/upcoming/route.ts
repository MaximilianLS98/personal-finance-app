import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { ErrorResponse } from '@/lib/types';

/**
 * GET /api/subscriptions/upcoming - Get upcoming subscription payments
 * Query params: days (default: 30), priority (all|high|medium|low)
 */
export async function GET(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const url = new URL(request.url);
		const searchParams = url.searchParams;

		// Parse query parameters
		const days = parseInt(searchParams.get('days') || '30', 10);
		const priority = searchParams.get('priority') || 'all';

		// Validate days parameter
		if (days < 1 || days > 365) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'Days parameter must be between 1 and 365',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Get upcoming payments
		const upcomingSubscriptions = await repository.findUpcomingPayments(days);

		// Enhance with additional information and calculate priority
		const enhancedPayments = upcomingSubscriptions.map((subscription) => {
			const daysUntilPayment = Math.ceil(
				(subscription.nextPaymentDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
			);

			// Calculate monthly equivalent for priority calculation
			let monthlyAmount: number;
			switch (subscription.billingFrequency) {
				case 'monthly':
					monthlyAmount = subscription.amount;
					break;
				case 'quarterly':
					monthlyAmount = subscription.amount / 3;
					break;
				case 'annually':
					monthlyAmount = subscription.amount / 12;
					break;
				case 'custom':
					const monthsPerPeriod = (subscription.customFrequencyDays || 30) / 30.44;
					monthlyAmount = subscription.amount / monthsPerPeriod;
					break;
				default:
					monthlyAmount = subscription.amount;
			}

			// Calculate priority based on cost and urgency
			let calculatedPriority: 'high' | 'medium' | 'low';
			if (daysUntilPayment <= 3 || monthlyAmount >= 100) {
				calculatedPriority = 'high';
			} else if (daysUntilPayment <= 7 || monthlyAmount >= 50) {
				calculatedPriority = 'medium';
			} else {
				calculatedPriority = 'low';
			}

			// Determine notification type
			let notificationType:
				| 'payment_due'
				| 'renewal_reminder'
				| 'price_increase'
				| 'usage_review';
			if (daysUntilPayment <= 7) {
				notificationType = 'payment_due';
			} else if (subscription.billingFrequency === 'annually' && daysUntilPayment <= 30) {
				notificationType = 'renewal_reminder';
			} else {
				notificationType = 'usage_review';
			}

			// Generate action recommendations
			const actions = [];
			if (daysUntilPayment <= 3) {
				actions.push('Ensure sufficient funds in account');
			}
			if (monthlyAmount >= 50) {
				actions.push('Review subscription value and usage');
			}
			if (subscription.billingFrequency === 'annually') {
				actions.push('Consider switching to monthly billing');
			}
			if (
				!subscription.lastUsedDate ||
				Date.now() - subscription.lastUsedDate.getTime() > 90 * 24 * 60 * 60 * 1000
			) {
				actions.push('Consider cancelling if unused');
			}

			return {
				id: subscription.id,
				name: subscription.name,
				amount: subscription.amount,
				currency: subscription.currency,
				billingFrequency: subscription.billingFrequency,
				nextPaymentDate: subscription.nextPaymentDate,
				categoryId: subscription.categoryId,
				daysUntilPayment,
				monthlyEquivalent: monthlyAmount,
				priority: calculatedPriority,
				notificationType,
				urgencyScore: Math.max(0, 10 - daysUntilPayment) + monthlyAmount / 20, // Higher score = more urgent
				actions,
				website: subscription.website,
				cancellationUrl: subscription.cancellationUrl,
				lastUsedDate: subscription.lastUsedDate,
				usageRating: subscription.usageRating,
			};
		});

		// Filter by priority if specified
		const filteredPayments =
			priority === 'all'
				? enhancedPayments
				: enhancedPayments.filter((payment) => payment.priority === priority);

		// Sort by urgency score (most urgent first)
		filteredPayments.sort((a, b) => b.urgencyScore - a.urgencyScore);

		// Group by notification type
		const groupedByType = filteredPayments.reduce(
			(acc, payment) => {
				if (!acc[payment.notificationType]) {
					acc[payment.notificationType] = [];
				}
				acc[payment.notificationType].push(payment);
				return acc;
			},
			{} as Record<string, typeof filteredPayments>,
		);

		// Calculate summary statistics
		const totalAmount = filteredPayments.reduce((sum, payment) => sum + payment.amount, 0);
		const totalMonthlyEquivalent = filteredPayments.reduce(
			(sum, payment) => sum + payment.monthlyEquivalent,
			0,
		);

		const priorityCounts = filteredPayments.reduce(
			(acc, payment) => {
				acc[payment.priority] = (acc[payment.priority] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		// Get the most urgent payment
		const mostUrgent = filteredPayments[0];

		return NextResponse.json(
			{
				success: true,
				data: {
					summary: {
						totalUpcoming: filteredPayments.length,
						totalAmount,
						totalMonthlyEquivalent,
						averageDaysUntilPayment:
							filteredPayments.length > 0
								? filteredPayments.reduce((sum, p) => sum + p.daysUntilPayment, 0) /
									filteredPayments.length
								: 0,
						priorityCounts,
						mostUrgent: mostUrgent
							? {
									name: mostUrgent.name,
									amount: mostUrgent.amount,
									daysUntilPayment: mostUrgent.daysUntilPayment,
									priority: mostUrgent.priority,
								}
							: null,
					},
					payments: filteredPayments,
					groupedByType,
					filters: {
						days,
						priority,
						appliedFilters: priority !== 'all' ? [`priority:${priority}`] : [],
					},
					recommendations: {
						immediate: filteredPayments
							.filter((p) => p.daysUntilPayment <= 3)
							.map(
								(p) =>
									`${p.name} payment due in ${p.daysUntilPayment} day${p.daysUntilPayment !== 1 ? 's' : ''}`,
							),
						review: filteredPayments
							.filter((p) => p.monthlyEquivalent >= 50)
							.map(
								(p) =>
									`Review ${p.name} (${p.monthlyEquivalent.toFixed(0)}/month equivalent)`,
							),
						optimize: filteredPayments
							.filter((p) => p.billingFrequency === 'annually' && p.amount >= 200)
							.map(
								(p) =>
									`Consider monthly billing for ${p.name} to improve cash flow`,
							),
					},
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Upcoming subscriptions API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while fetching upcoming payments',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
