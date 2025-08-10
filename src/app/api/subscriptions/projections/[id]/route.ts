import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import {
	FinancialProjectionEngine,
	LongTermCostAnalyzer,
	DEFAULT_INVESTMENT_CONFIG,
} from '@/lib/financial-projection-engine';
import { ErrorResponse } from '@/lib/types';

/**
 * Calculate risk level based on projection results
 */
function calculateRiskLevel(comparison: any): 'low' | 'medium' | 'high' {
	const fiveYearSavings = comparison.potentialSavings[5];
	const breakEvenYears = comparison.breakEvenYears;

	if (breakEvenYears < 3 && fiveYearSavings > comparison.monthlyInvestmentAmount * 24) {
		return 'low'; // Quick break-even with good savings
	} else if (breakEvenYears < 7 && fiveYearSavings > 0) {
		return 'medium'; // Moderate break-even with positive savings
	} else {
		return 'high'; // Long break-even or negative savings
	}
}

/**
 * Calculate value score (1-10) based on cost and potential savings
 */
function calculateValueScore(subscription: any, comparison: any): number {
	const monthlyAmount = comparison.monthlyInvestmentAmount;
	const fiveYearSavings = comparison.potentialSavings[5];
	const breakEvenYears = comparison.breakEvenYears;

	// Base score starts at 5 (neutral)
	let score = 5;

	// Adjust for break-even time
	if (breakEvenYears < 2) score += 3;
	else if (breakEvenYears < 5) score += 1;
	else if (breakEvenYears > 10) score -= 2;

	// Adjust for savings potential
	const savingsRatio = fiveYearSavings / (monthlyAmount * 60); // 5 years of payments
	if (savingsRatio > 0.5) score += 2;
	else if (savingsRatio > 0.2) score += 1;
	else if (savingsRatio < -0.2) score -= 2;

	// Adjust for subscription cost (higher cost = more scrutiny)
	if (monthlyAmount > 100) score -= 1;
	else if (monthlyAmount < 20) score += 1;

	// Clamp to 1-10 range
	return Math.max(1, Math.min(10, Math.round(score)));
}

/**
 * GET /api/subscriptions/projections/[id] - Get financial projections for a subscription
 * Query params: returnRate, inflationRate, monthlyCompounding
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
	const repository = createTransactionRepository();

	try {
		const { id } = await context.params;

		await repository.initialize();

		// Get the subscription
		const subscription = await repository.findSubscriptionById(id);
		if (!subscription) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Subscription not found',
				} as ErrorResponse,
				{ status: 404 },
			);
		}

		// Parse query parameters for custom investment configuration
		const url = new URL(request.url);
		const searchParams = url.searchParams;

		const customConfig = {
			...DEFAULT_INVESTMENT_CONFIG,
			...(searchParams.get('returnRate') && {
				annualReturnRate: parseFloat(searchParams.get('returnRate')!) / 100, // Convert percentage to decimal
			}),
			...(searchParams.get('inflationRate') && {
				inflationRate: parseFloat(searchParams.get('inflationRate')!) / 100,
			}),
			...(searchParams.get('monthlyCompounding') && {
				monthlyCompounding: searchParams.get('monthlyCompounding') === 'true',
			}),
		};

		// Validate custom parameters
		if (customConfig.annualReturnRate < -0.5 || customConfig.annualReturnRate > 1.0) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'Return rate must be between -50% and 100%',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		if (customConfig.inflationRate < -0.1 || customConfig.inflationRate > 0.5) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'Inflation rate must be between -10% and 50%',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Create projection engine with custom config
		const projectionEngine = new FinancialProjectionEngine(customConfig);
		const costAnalyzer = new LongTermCostAnalyzer(projectionEngine);

		// Generate comprehensive analysis
		const comparison = projectionEngine.compareSubscriptionVsInvestment(
			subscription,
			customConfig,
		);
		const chartData = costAnalyzer.generateChartData(subscription, customConfig);
		const tableData = costAnalyzer.generateTableData(subscription, customConfig);

		// Get related subscription transactions for additional context
		const subscriptionTransactions = await repository.findSubscriptionTransactions(
			subscription.id,
		);

		// Calculate actual spending history if available
		const actualSpendingHistory =
			subscriptionTransactions.length > 0
				? {
						totalSpent: subscriptionTransactions.reduce(
							(sum, t) => sum + Math.abs(t.amount),
							0,
						),
						transactionCount: subscriptionTransactions.length,
						firstTransaction:
							subscriptionTransactions[subscriptionTransactions.length - 1]?.date,
						lastTransaction: subscriptionTransactions[0]?.date,
						averageAmount:
							subscriptionTransactions.reduce(
								(sum, t) => sum + Math.abs(t.amount),
								0,
							) / subscriptionTransactions.length,
					}
				: null;

		return NextResponse.json(
			{
				success: true,
				data: {
					subscription: {
						id: subscription.id,
						name: subscription.name,
						amount: subscription.amount,
						currency: subscription.currency,
						billingFrequency: subscription.billingFrequency,
						nextPaymentDate: subscription.nextPaymentDate,
					},
					projections: {
						comparison,
						chartData,
						tableData,
						config: customConfig,
					},
					actualHistory: actualSpendingHistory,
					analysis: {
						monthlyEquivalent: comparison.monthlyInvestmentAmount,
						breakEvenPoint: comparison.breakEvenYears,
						recommendation: comparison.recommendation,
						recommendationReason: comparison.recommendationReason,
						riskLevel: calculateRiskLevel(comparison),
						valueScore: calculateValueScore(subscription, comparison),
					},
					disclaimers: [
						'Investment projections are estimates based on historical market performance and should not be considered guaranteed returns.',
						'All investments carry risk, including potential loss of principal. Past performance does not guarantee future results.',
						'This analysis is for informational purposes only and should not replace professional financial advice.',
					],
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscription projections API error:', error);

		// Handle validation errors
		if (error instanceof Error && error.message.includes('frequency')) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'Invalid subscription billing frequency',
					details: error.message,
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while calculating projections',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
