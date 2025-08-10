import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import {
	FinancialProjectionEngine,
	LongTermCostAnalyzer,
	DEFAULT_INVESTMENT_CONFIG,
} from '@/lib/financial-projection-engine';
import { ErrorResponse } from '@/lib/types';

/**
 * GET /api/subscriptions/insights - Get comprehensive subscription insights and recommendations
 * Query params: timeframe (month|quarter|year), includeProjections (true|false)
 */
export async function GET(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const url = new URL(request.url);
		const searchParams = url.searchParams;

		// Parse query parameters
		const timeframe = searchParams.get('timeframe') || 'year';
		const includeProjections = searchParams.get('includeProjections') !== 'false';

		// Validate timeframe
		if (!['month', 'quarter', 'year'].includes(timeframe)) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'Timeframe must be one of: month, quarter, year',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Get all active subscriptions
		const activeSubscriptions = await repository.findActiveSubscriptions();
		const allCategories = await repository.getCategories();

		if (activeSubscriptions.length === 0) {
			return NextResponse.json(
				{
					success: true,
					data: {
						summary: {
							totalSubscriptions: 0,
							totalMonthlyCost: 0,
							totalAnnualCost: 0,
							message: 'No active subscriptions found',
						},
						insights: [],
						recommendations: [],
					},
				},
				{ status: 200 },
			);
		}

		// Calculate basic metrics
		const totalMonthlyCost = await repository.calculateTotalMonthlyCost();
		const totalAnnualCost = totalMonthlyCost * 12;

		// Get upcoming payments and unused subscriptions
		const upcomingPayments = await repository.findUpcomingPayments(30);
		const unusedSubscriptions = await repository.findUnusedSubscriptions(90);

		// Calculate subscription metrics
		const subscriptionMetrics = activeSubscriptions.map((subscription) => {
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

			return {
				...subscription,
				monthlyAmount,
				annualAmount: monthlyAmount * 12,
			};
		});

		// Sort by cost for analysis
		subscriptionMetrics.sort((a, b) => b.monthlyAmount - a.monthlyAmount);

		// Category analysis
		const categoryAnalysis = allCategories
			.map((category) => {
				const categorySubscriptions = subscriptionMetrics.filter(
					(sub) => sub.categoryId === category.id,
				);
				const totalMonthlyCost = categorySubscriptions.reduce(
					(sum, sub) => sum + sub.monthlyAmount,
					0,
				);

				return {
					category: {
						id: category.id,
						name: category.name,
						color: category.color,
						icon: category.icon,
					},
					subscriptionCount: categorySubscriptions.length,
					totalMonthlyCost,
					totalAnnualCost: totalMonthlyCost * 12,
					averageCost:
						categorySubscriptions.length > 0
							? totalMonthlyCost / categorySubscriptions.length
							: 0,
					subscriptions: categorySubscriptions.map((sub) => ({
						id: sub.id,
						name: sub.name,
						monthlyAmount: sub.monthlyAmount,
						usageRating: sub.usageRating,
					})),
				};
			})
			.filter((cat) => cat.subscriptionCount > 0);

		// Sort categories by cost
		categoryAnalysis.sort((a, b) => b.totalMonthlyCost - a.totalMonthlyCost);

		// Generate insights
		const insights = [];

		// Cost insights
		const highestCostSubscription = subscriptionMetrics[0];
		if (highestCostSubscription && highestCostSubscription.monthlyAmount > 50) {
			insights.push({
				type: 'cost_analysis',
				priority: 'high',
				title: 'Highest Cost Subscription',
				description: `${highestCostSubscription.name} costs ${highestCostSubscription.monthlyAmount.toFixed(0)}/month (${((highestCostSubscription.monthlyAmount / totalMonthlyCost) * 100).toFixed(1)}% of total)`,
				value: highestCostSubscription.monthlyAmount,
				actionable: true,
				actions: [
					'Review usage and value',
					'Consider alternatives',
					'Negotiate better pricing',
				],
			});
		}

		// Category insights
		const highestCostCategory = categoryAnalysis[0];
		if (highestCostCategory && highestCostCategory.totalMonthlyCost > totalMonthlyCost * 0.3) {
			insights.push({
				type: 'category_analysis',
				priority: 'medium',
				title: 'Dominant Category',
				description: `${highestCostCategory.category.name} accounts for ${((highestCostCategory.totalMonthlyCost / totalMonthlyCost) * 100).toFixed(1)}% of subscription costs`,
				value: highestCostCategory.totalMonthlyCost,
				actionable: true,
				actions: [
					'Review category necessity',
					'Consolidate similar services',
					'Look for bundle deals',
				],
			});
		}

		// Frequency insights
		const frequencyDistribution = subscriptionMetrics.reduce(
			(acc, sub) => {
				acc[sub.billingFrequency] = (acc[sub.billingFrequency] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		const annualSubscriptions = subscriptionMetrics.filter(
			(sub) => sub.billingFrequency === 'annually',
		);
		if (annualSubscriptions.length > 0) {
			const totalAnnualAmount = annualSubscriptions.reduce((sum, sub) => sum + sub.amount, 0);
			insights.push({
				type: 'billing_optimization',
				priority: 'low',
				title: 'Annual Billing Impact',
				description: `${annualSubscriptions.length} annual subscriptions require ${totalAnnualAmount.toFixed(0)} upfront payment`,
				value: totalAnnualAmount,
				actionable: true,
				actions: [
					'Consider monthly billing for cash flow',
					'Plan for renewal dates',
					'Set renewal reminders',
				],
			});
		}

		// Usage insights
		if (unusedSubscriptions.length > 0) {
			const unusedMonthlyCost = unusedSubscriptions.reduce((sum, sub) => {
				switch (sub.billingFrequency) {
					case 'monthly':
						return sum + sub.amount;
					case 'quarterly':
						return sum + sub.amount / 3;
					case 'annually':
						return sum + sub.amount / 12;
					case 'custom':
						return sum + sub.amount / ((sub.customFrequencyDays || 30) / 30.44);
					default:
						return sum;
				}
			}, 0);

			insights.push({
				type: 'usage_optimization',
				priority: 'high',
				title: 'Unused Subscriptions',
				description: `${unusedSubscriptions.length} subscriptions appear unused, costing ${unusedMonthlyCost.toFixed(0)}/month`,
				value: unusedMonthlyCost,
				actionable: true,
				actions: [
					'Cancel unused subscriptions',
					'Track usage for 30 days',
					'Set usage reminders',
				],
			});
		}

		// Upcoming payment insights
		const urgentPayments = upcomingPayments.filter((sub) => {
			const daysUntil = Math.ceil(
				(sub.nextPaymentDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
			);
			return daysUntil <= 7;
		});

		if (urgentPayments.length > 0) {
			const urgentAmount = urgentPayments.reduce((sum, sub) => sum + sub.amount, 0);
			insights.push({
				type: 'payment_alert',
				priority: 'high',
				title: 'Upcoming Payments',
				description: `${urgentPayments.length} payments due within 7 days, totaling ${urgentAmount.toFixed(0)}`,
				value: urgentAmount,
				actionable: true,
				actions: [
					'Ensure sufficient funds',
					'Review payment methods',
					'Consider cancelling before renewal',
				],
			});
		}

		// Generate recommendations
		const recommendations = [];

		// Cost optimization recommendations
		if (totalMonthlyCost > 200) {
			recommendations.push({
				type: 'cost_reduction',
				priority: 'high',
				title: 'High Subscription Spending',
				description: `Monthly subscription costs of ${totalMonthlyCost.toFixed(0)} are above average`,
				impact: 'high',
				effort: 'medium',
				actions: [
					'Audit all subscriptions for necessity',
					'Look for family/team plans to reduce per-user cost',
					'Cancel overlapping services',
					'Negotiate annual discounts',
				],
				potentialSavings: totalMonthlyCost * 0.2, // Estimate 20% savings potential
			});
		}

		// Consolidation recommendations
		const duplicateCategories = categoryAnalysis.filter((cat) => cat.subscriptionCount > 2);
		if (duplicateCategories.length > 0) {
			recommendations.push({
				type: 'consolidation',
				priority: 'medium',
				title: 'Service Consolidation',
				description: `Multiple subscriptions in ${duplicateCategories[0].category.name} category`,
				impact: 'medium',
				effort: 'low',
				actions: [
					'Compare features across similar services',
					'Choose the best value option',
					'Cancel redundant subscriptions',
				],
				potentialSavings: duplicateCategories[0].totalMonthlyCost * 0.3,
			});
		}

		// Investment opportunity recommendations
		if (includeProjections && totalMonthlyCost > 50) {
			const projectionEngine = new FinancialProjectionEngine(DEFAULT_INVESTMENT_CONFIG);
			const fiveYearInvestmentValue = projectionEngine.calculateCompoundReturns(
				totalMonthlyCost,
				5,
			);
			const fiveYearSubscriptionCost = totalMonthlyCost * 12 * 5;

			if (fiveYearInvestmentValue > fiveYearSubscriptionCost * 1.2) {
				recommendations.push({
					type: 'investment_opportunity',
					priority: 'low',
					title: 'Investment Alternative',
					description: `Investing ${totalMonthlyCost.toFixed(0)}/month could yield ${(fiveYearInvestmentValue - fiveYearSubscriptionCost).toFixed(0)} more than subscription costs over 5 years`,
					impact: 'high',
					effort: 'high',
					actions: [
						'Evaluate which subscriptions provide the least value',
						'Consider investing saved money in index funds',
						'Start with cancelling one high-cost, low-value subscription',
					],
					potentialSavings: fiveYearInvestmentValue - fiveYearSubscriptionCost,
				});
			}
		}

		// Billing optimization recommendations
		const monthlySubscriptions = subscriptionMetrics.filter(
			(sub) => sub.billingFrequency === 'monthly',
		);
		const potentialAnnualDiscounts = monthlySubscriptions.filter(
			(sub) => sub.monthlyAmount > 20,
		);

		if (potentialAnnualDiscounts.length > 0) {
			const potentialSavings = potentialAnnualDiscounts.reduce(
				(sum, sub) => sum + sub.monthlyAmount * 12 * 0.15,
				0,
			); // Assume 15% annual discount
			recommendations.push({
				type: 'billing_optimization',
				priority: 'low',
				title: 'Annual Billing Discounts',
				description: `Switch to annual billing for potential discounts on ${potentialAnnualDiscounts.length} subscriptions`,
				impact: 'low',
				effort: 'low',
				actions: [
					'Check for annual discount offers',
					'Calculate break-even point',
					'Switch high-value subscriptions to annual billing',
				],
				potentialSavings,
			});
		}

		// Sort recommendations by priority and impact
		recommendations.sort((a, b) => {
			const priorityOrder = { high: 3, medium: 2, low: 1 };
			const impactOrder = { high: 3, medium: 2, low: 1 };

			const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
			const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;

			if (aPriority !== bPriority) return bPriority - aPriority;

			const aImpact = impactOrder[a.impact as keyof typeof impactOrder] || 0;
			const bImpact = impactOrder[b.impact as keyof typeof impactOrder] || 0;

			return bImpact - aImpact;
		});

		return NextResponse.json(
			{
				success: true,
				data: {
					summary: {
						totalSubscriptions: activeSubscriptions.length,
						totalMonthlyCost,
						totalAnnualCost,
						averageMonthlyCost: totalMonthlyCost / activeSubscriptions.length,
						upcomingPayments: upcomingPayments.length,
						unusedSubscriptions: unusedSubscriptions.length,
						timeframe,
					},
					insights: insights.sort((a, b) => {
						const priorityOrder = { high: 3, medium: 2, low: 1 };
						return (
							(priorityOrder[b.priority as keyof typeof priorityOrder] || 0) -
							(priorityOrder[a.priority as keyof typeof priorityOrder] || 0)
						);
					}),
					recommendations,
					categoryAnalysis,
					costBreakdown: {
						byFrequency: Object.entries(frequencyDistribution).map(
							([frequency, count]) => ({
								frequency,
								count,
								totalCost: subscriptionMetrics
									.filter((sub) => sub.billingFrequency === frequency)
									.reduce((sum, sub) => sum + sub.monthlyAmount, 0),
							}),
						),
						topSubscriptions: subscriptionMetrics.slice(0, 5).map((sub) => ({
							id: sub.id,
							name: sub.name,
							monthlyAmount: sub.monthlyAmount,
							percentage: (sub.monthlyAmount / totalMonthlyCost) * 100,
						})),
					},
					trends: {
						// This would be enhanced with historical data in a real implementation
						message: 'Historical trend analysis requires transaction history data',
						growthRate: null,
						seasonality: null,
					},
					actionItems: {
						immediate: insights
							.filter((insight) => insight.priority === 'high' && insight.actionable)
							.slice(0, 3)
							.map((insight) => ({
								title: insight.title,
								description: insight.description,
								actions: insight.actions,
							})),
						shortTerm: recommendations
							.filter((rec) => rec.effort === 'low')
							.slice(0, 3)
							.map((rec) => ({
								title: rec.title,
								description: rec.description,
								potentialSavings: rec.potentialSavings,
							})),
						longTerm: recommendations
							.filter((rec) => rec.impact === 'high')
							.slice(0, 2)
							.map((rec) => ({
								title: rec.title,
								description: rec.description,
								potentialSavings: rec.potentialSavings,
							})),
					},
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscription insights API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while generating insights',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
