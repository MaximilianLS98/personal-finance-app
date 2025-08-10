import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { ErrorResponse } from '@/lib/types';

/**
 * GET /api/subscriptions/unused - Get potentially unused or underutilized subscriptions
 * Query params: days (default: 90), minCost, sortBy (cost|usage|age)
 */
export async function GET(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const url = new URL(request.url);
		const searchParams = url.searchParams;

		// Parse query parameters
		const daysSinceLastUse = parseInt(searchParams.get('days') || '90', 10);
		const minCost = parseFloat(searchParams.get('minCost') || '0');
		const sortBy = searchParams.get('sortBy') || 'cost';

		// Validate parameters
		if (daysSinceLastUse < 1 || daysSinceLastUse > 365) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'Days parameter must be between 1 and 365',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		if (minCost < 0) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'Minimum cost must be non-negative',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Get potentially unused subscriptions
		const unusedSubscriptions = await repository.findUnusedSubscriptions(daysSinceLastUse);

		// Get all active subscriptions to analyze usage patterns
		const allActiveSubscriptions = await repository.findActiveSubscriptions();

		// Enhance with additional analysis
		const enhancedUnusedSubscriptions = unusedSubscriptions.map((subscription) => {
			// Calculate monthly equivalent cost
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

			// Calculate days since last use
			const daysSinceLastUsed = subscription.lastUsedDate
				? Math.floor(
						(Date.now() - subscription.lastUsedDate.getTime()) / (1000 * 60 * 60 * 24),
					)
				: null;

			// Calculate subscription age
			const subscriptionAge = Math.floor(
				(Date.now() - subscription.createdAt.getTime()) / (1000 * 60 * 60 * 24),
			);

			// Calculate waste score (higher = more wasteful)
			let wasteScore = 0;
			if (daysSinceLastUsed) {
				wasteScore += Math.min(daysSinceLastUsed / 30, 10); // Up to 10 points for time unused
			} else {
				wasteScore += 5; // 5 points if never tracked usage
			}
			wasteScore += Math.min(monthlyAmount / 20, 5); // Up to 5 points for cost
			if (subscription.usageRating && subscription.usageRating <= 2) {
				wasteScore += 3; // 3 points for low user rating
			}

			// Generate recommendations
			const recommendations = [];
			if (daysSinceLastUsed && daysSinceLastUsed > 60) {
				recommendations.push('Consider cancelling - unused for over 2 months');
			}
			if (monthlyAmount > 50) {
				recommendations.push('High cost - review value proposition');
			}
			if (subscription.usageRating && subscription.usageRating <= 2) {
				recommendations.push('Low user rating - consider alternatives');
			}
			if (subscription.billingFrequency === 'annually') {
				recommendations.push('Annual billing - cancel before next renewal');
			}
			if (!subscription.lastUsedDate) {
				recommendations.push('Usage not tracked - monitor for 30 days before deciding');
			}

			// Calculate potential annual savings
			const annualSavings = monthlyAmount * 12;

			return {
				id: subscription.id,
				name: subscription.name,
				amount: subscription.amount,
				currency: subscription.currency,
				billingFrequency: subscription.billingFrequency,
				monthlyEquivalent: monthlyAmount,
				annualCost: annualSavings,
				categoryId: subscription.categoryId,
				lastUsedDate: subscription.lastUsedDate,
				daysSinceLastUsed,
				subscriptionAge,
				usageRating: subscription.usageRating,
				wasteScore,
				recommendations,
				website: subscription.website,
				cancellationUrl: subscription.cancellationUrl,
				nextPaymentDate: subscription.nextPaymentDate,
				notes: subscription.notes,
			};
		});

		// Filter by minimum cost if specified
		const filteredSubscriptions = enhancedUnusedSubscriptions.filter(
			(sub) => sub.monthlyEquivalent >= minCost,
		);

		// Sort based on sortBy parameter
		filteredSubscriptions.sort((a, b) => {
			switch (sortBy) {
				case 'cost':
					return b.monthlyEquivalent - a.monthlyEquivalent;
				case 'usage':
					// Sort by days since last used (most unused first)
					const aDays = a.daysSinceLastUsed || 999;
					const bDays = b.daysSinceLastUsed || 999;
					return bDays - aDays;
				case 'age':
					return b.subscriptionAge - a.subscriptionAge;
				case 'waste':
					return b.wasteScore - a.wasteScore;
				default:
					return b.monthlyEquivalent - a.monthlyEquivalent;
			}
		});

		// Calculate summary statistics
		const totalMonthlyWaste = filteredSubscriptions.reduce(
			(sum, sub) => sum + sub.monthlyEquivalent,
			0,
		);
		const totalAnnualWaste = totalMonthlyWaste * 12;
		const averageWasteScore =
			filteredSubscriptions.length > 0
				? filteredSubscriptions.reduce((sum, sub) => sum + sub.wasteScore, 0) /
					filteredSubscriptions.length
				: 0;

		// Group by waste score ranges
		const wasteCategories = {
			critical: filteredSubscriptions.filter((sub) => sub.wasteScore >= 8), // Very wasteful
			high: filteredSubscriptions.filter((sub) => sub.wasteScore >= 6 && sub.wasteScore < 8),
			medium: filteredSubscriptions.filter(
				(sub) => sub.wasteScore >= 4 && sub.wasteScore < 6,
			),
			low: filteredSubscriptions.filter((sub) => sub.wasteScore < 4),
		};

		// Find the most wasteful subscription
		const mostWasteful = filteredSubscriptions[0];

		// Calculate potential investment returns if money was invested instead
		const potentialMonthlyInvestment = totalMonthlyWaste;
		const fiveYearInvestmentValue =
			potentialMonthlyInvestment > 0
				? potentialMonthlyInvestment * 12 * 5 * 1.4 // Rough 7% annual return calculation
				: 0;

		return NextResponse.json(
			{
				success: true,
				data: {
					summary: {
						totalUnused: filteredSubscriptions.length,
						totalMonthlyWaste,
						totalAnnualWaste,
						averageWasteScore,
						potentialMonthlyInvestment,
						fiveYearInvestmentValue,
						mostWasteful: mostWasteful
							? {
									name: mostWasteful.name,
									monthlyEquivalent: mostWasteful.monthlyEquivalent,
									daysSinceLastUsed: mostWasteful.daysSinceLastUsed,
									wasteScore: mostWasteful.wasteScore,
								}
							: null,
					},
					subscriptions: filteredSubscriptions,
					categories: {
						critical: {
							count: wasteCategories.critical.length,
							totalMonthlyCost: wasteCategories.critical.reduce(
								(sum, sub) => sum + sub.monthlyEquivalent,
								0,
							),
							subscriptions: wasteCategories.critical.slice(0, 5), // Top 5 most critical
						},
						high: {
							count: wasteCategories.high.length,
							totalMonthlyCost: wasteCategories.high.reduce(
								(sum, sub) => sum + sub.monthlyEquivalent,
								0,
							),
						},
						medium: {
							count: wasteCategories.medium.length,
							totalMonthlyCost: wasteCategories.medium.reduce(
								(sum, sub) => sum + sub.monthlyEquivalent,
								0,
							),
						},
						low: {
							count: wasteCategories.low.length,
							totalMonthlyCost: wasteCategories.low.reduce(
								(sum, sub) => sum + sub.monthlyEquivalent,
								0,
							),
						},
					},
					filters: {
						daysSinceLastUse,
						minCost,
						sortBy,
					},
					actionItems: {
						immediate: wasteCategories.critical.map((sub) => ({
							action: 'Cancel immediately',
							subscription: sub.name,
							monthlySavings: sub.monthlyEquivalent,
							reason: 'High waste score and significant cost',
						})),
						review: wasteCategories.high.map((sub) => ({
							action: 'Review usage',
							subscription: sub.name,
							monthlySavings: sub.monthlyEquivalent,
							reason: 'Potentially underutilized',
						})),
						monitor: wasteCategories.medium.slice(0, 3).map((sub) => ({
							action: 'Monitor for 30 days',
							subscription: sub.name,
							reason: 'Track usage before making decision',
						})),
					},
					insights: {
						biggestOpportunity: mostWasteful
							? {
									name: mostWasteful.name,
									annualSavings: mostWasteful.annualCost,
									recommendation:
										'Cancel this subscription to save the most money',
								}
							: null,
						quickWins: wasteCategories.critical
							.filter((sub) => sub.cancellationUrl)
							.slice(0, 3)
							.map((sub) => ({
								name: sub.name,
								monthlySavings: sub.monthlyEquivalent,
								cancellationUrl: sub.cancellationUrl,
							})),
						totalOpportunity: {
							monthly: totalMonthlyWaste,
							annual: totalAnnualWaste,
							fiveYearInvestment: fiveYearInvestmentValue,
							message:
								totalMonthlyWaste > 0
									? `Cancelling all unused subscriptions could save ${totalMonthlyWaste.toFixed(0)}/month`
									: 'No significant unused subscriptions found',
						},
					},
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Unused subscriptions API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while analyzing unused subscriptions',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
