import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { SubscriptionBudgetIntegrationService } from '@/lib/subscription-budget-integration';
import { ErrorResponse } from '@/lib/types';

/**
 * GET /api/budgets/suggestions/subscription-aware - Get subscription-aware budget suggestions
 * Query params: categoryId (required), period ('monthly' | 'yearly', default: 'monthly'), historicalMonths (default: 6)
 */
export async function GET(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const url = new URL(request.url);
		const categoryId = url.searchParams.get('categoryId');
		const period = (url.searchParams.get('period') as 'monthly' | 'yearly') || 'monthly';
		const historicalMonthsParam = url.searchParams.get('historicalMonths');
		const historicalMonths = historicalMonthsParam ? parseInt(historicalMonthsParam, 10) : 6;

		if (!categoryId) {
			return NextResponse.json(
				{
					error: 'MISSING_PARAMETER',
					message: 'categoryId is required',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		if (!['monthly', 'yearly'].includes(period)) {
			return NextResponse.json(
				{
					error: 'INVALID_PERIOD',
					message: 'period must be either "monthly" or "yearly"',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		if (isNaN(historicalMonths) || historicalMonths < 1 || historicalMonths > 24) {
			return NextResponse.json(
				{
					error: 'INVALID_HISTORICAL_MONTHS',
					message: 'historicalMonths must be a number between 1 and 24',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Verify category exists
		const category = await repository.getCategoryById(categoryId);
		if (!category) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Category not found',
				} as ErrorResponse,
				{ status: 404 },
			);
		}

		// Get historical spending analysis
		const spendingAnalysis = await repository.analyzeHistoricalSpending(
			categoryId,
			historicalMonths,
		);
		const historicalSpending =
			period === 'yearly'
				? spendingAnalysis.averageMonthly * 12
				: spendingAnalysis.averageMonthly;

		// Generate subscription-aware suggestions
		const subscriptionIntegration = new SubscriptionBudgetIntegrationService(repository);
		const suggestion = await subscriptionIntegration.generateSubscriptionAwareSuggestions(
			categoryId,
			historicalSpending,
			period,
		);

		// Get subscription allocation details
		const subscriptionAllocation =
			await subscriptionIntegration.calculateSubscriptionAllocation(categoryId);

		return NextResponse.json(
			{
				success: true,
				data: {
					category: {
						id: category.id,
						name: category.name,
					},
					period,
					historicalMonths,
					historicalSpending: {
						total: historicalSpending,
						average: spendingAnalysis.averageMonthly,
						min: spendingAnalysis.minMonthly,
						max: spendingAnalysis.maxMonthly,
						standardDeviation: spendingAnalysis.standardDeviation,
					},
					subscriptionAwareSuggestion: suggestion,
					subscriptionDetails: subscriptionAllocation,
					recommendations: {
						conservative: suggestion.totalSuggestion * 0.9,
						moderate: suggestion.totalSuggestion,
						aggressive: suggestion.totalSuggestion * 1.1,
					},
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscription-aware budget suggestions API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message:
					'An unexpected error occurred while generating subscription-aware suggestions',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
