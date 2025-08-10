import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { ErrorResponse } from '@/lib/types';

/**
 * GET /api/subscriptions/dashboard - Get subscription dashboard summary data
 */
export async function GET(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		// Get all active subscriptions
		const activeSubscriptions = await repository.findActiveSubscriptions();

		// Calculate total monthly and annual costs
		const totalMonthlyCost = await repository.calculateTotalMonthlyCost();
		const totalAnnualCost = totalMonthlyCost * 12;

		// Get upcoming payments (next 30 days)
		const upcomingPayments = await repository.findUpcomingPayments(30);

		// Get potentially unused subscriptions (no usage in last 90 days)
		const unusedSubscriptions = await repository.findUnusedSubscriptions(90);

		// Calculate subscription count by category
		const categories = await repository.getCategories();
		const categoryBreakdown = await Promise.all(
			categories.map(async (category) => {
				const categorySubscriptions = await repository.findSubscriptionsByCategory(
					category.id,
				);
				const activeCount = categorySubscriptions.filter((sub) => sub.isActive).length;

				// Calculate monthly cost for this category
				const monthlyCost = categorySubscriptions
					.filter((sub) => sub.isActive)
					.reduce((total, sub) => {
						switch (sub.billingFrequency) {
							case 'monthly':
								return total + sub.amount;
							case 'quarterly':
								return total + sub.amount / 3;
							case 'annually':
								return total + sub.amount / 12;
							case 'custom':
								const monthsPerPeriod = (sub.customFrequencyDays || 30) / 30.44;
								return total + sub.amount / monthsPerPeriod;
							default:
								return total;
						}
					}, 0);

				return {
					category: {
						id: category.id,
						name: category.name,
						color: category.color,
						icon: category.icon,
					},
					subscriptionCount: activeCount,
					monthlyCost,
					annualCost: monthlyCost * 12,
				};
			}),
		);

		// Filter out categories with no subscriptions
		const nonEmptyCategories = categoryBreakdown.filter((cat) => cat.subscriptionCount > 0);

		// Calculate subscription frequency distribution
		const frequencyDistribution = activeSubscriptions.reduce(
			(acc, sub) => {
				acc[sub.billingFrequency] = (acc[sub.billingFrequency] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		// Get recent subscription activity (created in last 30 days)
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		const recentSubscriptions = activeSubscriptions.filter(
			(sub) => sub.createdAt >= thirtyDaysAgo,
		);

		// Calculate average subscription cost
		const averageMonthlyCost =
			activeSubscriptions.length > 0 ? totalMonthlyCost / activeSubscriptions.length : 0;

		// Find highest and lowest cost subscriptions
		const subscriptionCosts = activeSubscriptions.map((sub) => {
			let monthlyCost: number;
			switch (sub.billingFrequency) {
				case 'monthly':
					monthlyCost = sub.amount;
					break;
				case 'quarterly':
					monthlyCost = sub.amount / 3;
					break;
				case 'annually':
					monthlyCost = sub.amount / 12;
					break;
				case 'custom':
					const monthsPerPeriod = (sub.customFrequencyDays || 30) / 30.44;
					monthlyCost = sub.amount / monthsPerPeriod;
					break;
				default:
					monthlyCost = 0;
			}
			return { subscription: sub, monthlyCost };
		});

		subscriptionCosts.sort((a, b) => b.monthlyCost - a.monthlyCost);
		const highestCostSubscription = subscriptionCosts[0];
		const lowestCostSubscription = subscriptionCosts[subscriptionCosts.length - 1];

		return NextResponse.json(
			{
				success: true,
				data: {
					summary: {
						totalActiveSubscriptions: activeSubscriptions.length,
						totalMonthlyCost,
						totalAnnualCost,
						averageMonthlyCost,
						upcomingPaymentsCount: upcomingPayments.length,
						unusedSubscriptionsCount: unusedSubscriptions.length,
						recentSubscriptionsCount: recentSubscriptions.length,
					},
					upcomingPayments: upcomingPayments.map((sub) => ({
						id: sub.id,
						name: sub.name,
						amount: sub.amount,
						currency: sub.currency,
						nextPaymentDate: sub.nextPaymentDate,
						billingFrequency: sub.billingFrequency,
					})),
					categoryBreakdown: nonEmptyCategories,
					frequencyDistribution,
					costAnalysis: {
						highest: highestCostSubscription
							? {
									subscription: {
										id: highestCostSubscription.subscription.id,
										name: highestCostSubscription.subscription.name,
										amount: highestCostSubscription.subscription.amount,
										billingFrequency:
											highestCostSubscription.subscription.billingFrequency,
									},
									monthlyCost: highestCostSubscription.monthlyCost,
								}
							: null,
						lowest: lowestCostSubscription
							? {
									subscription: {
										id: lowestCostSubscription.subscription.id,
										name: lowestCostSubscription.subscription.name,
										amount: lowestCostSubscription.subscription.amount,
										billingFrequency:
											lowestCostSubscription.subscription.billingFrequency,
									},
									monthlyCost: lowestCostSubscription.monthlyCost,
								}
							: null,
					},
					unusedSubscriptions: unusedSubscriptions.map((sub) => ({
						id: sub.id,
						name: sub.name,
						amount: sub.amount,
						currency: sub.currency,
						billingFrequency: sub.billingFrequency,
						lastUsedDate: sub.lastUsedDate,
						daysSinceLastUse: sub.lastUsedDate
							? Math.floor(
									(Date.now() - sub.lastUsedDate.getTime()) /
										(1000 * 60 * 60 * 24),
								)
							: null,
					})),
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscription dashboard API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while fetching dashboard data',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
