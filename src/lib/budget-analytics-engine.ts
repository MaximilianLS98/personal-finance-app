/**
 * Budget Analytics Engine
 * Provides advanced analytics and insights for budget data including
 * historical spending analysis, budget performance calculations, and intelligent suggestions
 */

import type {
	Budget,
	BudgetProgress,
	BudgetSuggestion,
	BudgetAmount,
	SpendingAnalysis,
	VarianceAnalysis,
	MonthlyVariance,
	Transaction,
	TransactionRepository,
	BudgetPeriod,
} from './types';

export class BudgetAnalyticsEngine {
	constructor(private repository: TransactionRepository) {}

	/**
	 * Generate intelligent budget suggestions for a category based on historical data
	 * Uses multiple data points including transactions, subscriptions, and spending patterns
	 */
	async generateBudgetSuggestions(
		categoryId: string,
		period: BudgetPeriod,
	): Promise<BudgetSuggestion> {
		// Test implementation - should be tested for production use
		try {
			// Get category information
			const category = await this.repository.getCategoryById(categoryId);
			if (!category) {
				throw new Error(`Category not found: ${categoryId}`);
			}

			// Analyze spending for different time periods to get comprehensive data
			const [threeMonthAnalysis, sixMonthAnalysis, twelveMonthAnalysis] = 
				await Promise.all([
					this.repository.analyzeHistoricalSpending(categoryId, 3),
					this.repository.analyzeHistoricalSpending(categoryId, 6),
					this.repository.analyzeHistoricalSpending(categoryId, 12),
				]);

			// Use the analysis with the highest confidence, or combine them intelligently
			const primaryAnalysis = [threeMonthAnalysis, sixMonthAnalysis, twelveMonthAnalysis]
				.sort((a, b) => b.confidence - a.confidence)[0];

			// Calculate subscription costs for this category
			const subscriptionCosts = {
				fixedAmount: primaryAnalysis.subscriptionCosts,
				subscriptionCount: await this.getSubscriptionCount(categoryId),
			};

			// Generate three tiers of budget suggestions
			const suggestions = this.calculateBudgetTiers(primaryAnalysis, period.type);

			return {
				categoryId,
				categoryName: category.name,
				period,
				suggestions,
				historicalData: {
					averageSpending: primaryAnalysis.averageMonthly,
					minSpending: primaryAnalysis.minMonthly,
					maxSpending: primaryAnalysis.maxMonthly,
					standardDeviation: primaryAnalysis.standardDeviation,
					monthsAnalyzed: primaryAnalysis.periodMonths,
				},
				subscriptionCosts,
				confidence: primaryAnalysis.confidence,
			};
		} catch (error) {
			throw new Error(`Failed to generate budget suggestions: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`);
		}
	}

	/**
	 * Calculate variance analysis comparing budgeted vs actual spending
	 */
	async calculateBudgetVariance(budget: Budget): Promise<VarianceAnalysis> {
		// Test implementation - should be tested for production use
		try {
			const monthlyVariances: MonthlyVariance[] = [];
			let totalOverspend = 0;
			let totalUnderspend = 0;
			const variances: number[] = [];

			// Calculate monthly budget amount based on period
			const monthlyBudgetAmount = budget.period === 'monthly' 
				? budget.amount 
				: budget.amount / 12; // Yearly budget divided by 12

			// Get the date range for analysis
			const startDate = budget.startDate;
			const endDate = new Date(Math.min(budget.endDate.getTime(), Date.now()));

			// Iterate through each month in the budget period
			const currentDate = new Date(startDate);
			while (currentDate <= endDate) {
				const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
				const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
				
				// Don't analyze future months
				if (monthStart > new Date()) {
					break;
				}

				const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

				// Get transactions for this month and category
				const monthTransactions = await this.repository.findByDateRange(monthStart, monthEnd);
				const categoryTransactions = monthTransactions.filter(
					t => t.categoryId === budget.categoryId && t.type === 'expense'
				);

				const actualSpending = categoryTransactions.reduce(
					(sum, t) => sum + Math.abs(t.amount), 0
				);

				const variance = actualSpending - monthlyBudgetAmount;
				const variancePercentage = monthlyBudgetAmount > 0 
					? (variance / monthlyBudgetAmount) * 100 
					: 0;

				monthlyVariances.push({
					month: monthKey,
					budgeted: monthlyBudgetAmount,
					actual: actualSpending,
					variance,
					variancePercentage,
				});

				variances.push(variance);

				if (variance > 0) {
					totalOverspend += variance;
				} else {
					totalUnderspend += Math.abs(variance);
				}

				// Move to next month
				currentDate.setMonth(currentDate.getMonth() + 1);
			}

			// Calculate overall statistics
			const averageVariance = variances.length > 0 
				? variances.reduce((sum, v) => sum + v, 0) / variances.length 
				: 0;

			const varianceStdDev = variances.length > 1 
				? Math.sqrt(variances.reduce((sum, v) => sum + Math.pow(v - averageVariance, 2), 0) / (variances.length - 1))
				: 0;

			// Generate insights based on the variance analysis
			const insights = this.generateVarianceInsights(monthlyVariances, totalOverspend, totalUnderspend);

			return {
				budgetId: budget.id,
				monthlyVariances,
				overallVariance: {
					averageVariance,
					totalOverspend,
					totalUnderspend,
					varianceStdDev,
				},
				insights,
			};
		} catch (error) {
			throw new Error(`Failed to calculate budget variance: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`);
		}
	}

	/**
	 * Calculate budget tiers (conservative, moderate, aggressive) based on historical analysis
	 */
	private calculateBudgetTiers(
		analysis: SpendingAnalysis, 
		periodType: 'monthly' | 'yearly'
	): {
		conservative: BudgetAmount;
		moderate: BudgetAmount;
		aggressive: BudgetAmount;
	} {
		const baseAmount = periodType === 'monthly' 
			? analysis.averageMonthly 
			: analysis.averageMonthly * 12;

		const subscriptionFloor = periodType === 'monthly'
			? analysis.subscriptionCosts
			: analysis.subscriptionCosts * 12;

		// Conservative: Add buffer for unexpected expenses (average + 20% or subscription floor, whichever is higher)
		const conservativeAmount = Math.max(
			baseAmount * 1.2,
			subscriptionFloor * 1.1
		);

		// Moderate: Based on average with small buffer (average + 10% or subscription floor)
		const moderateAmount = Math.max(
			baseAmount * 1.1,
			subscriptionFloor
		);

		// Aggressive: Tight budget encouraging savings (average - 10% but not below subscription floor)
		const aggressiveAmount = Math.max(
			baseAmount * 0.9,
			subscriptionFloor
		);

		return {
			conservative: {
				amount: Math.round(conservativeAmount),
				reasoning: `Based on your average ${periodType} spending with a 20% buffer for unexpected expenses. This provides a comfortable cushion while encouraging mindful spending.`,
				confidence: Math.min(0.9, analysis.confidence + 0.1),
			},
			moderate: {
				amount: Math.round(moderateAmount),
				reasoning: `Based on your average ${periodType} spending with a 10% buffer. This matches your typical spending patterns with modest room for variation.`,
				confidence: analysis.confidence,
			},
			aggressive: {
				amount: Math.round(aggressiveAmount),
				reasoning: `Tight budget set 10% below your average ${periodType} spending. This encourages savings but ensures subscription commitments are covered.`,
				confidence: Math.max(0.6, analysis.confidence - 0.2),
			},
		};
	}

	/**
	 * Generate insights based on variance analysis patterns
	 */
	private generateVarianceInsights(
		monthlyVariances: MonthlyVariance[], 
		totalOverspend: number, 
		totalUnderspend: number
	): string[] {
		const insights: string[] = [];

		if (monthlyVariances.length === 0) {
			return ['No spending data available for analysis.'];
		}

		// Analyze overspending patterns
		const overspendMonths = monthlyVariances.filter(m => m.variance > 0);
		const overspendPercentage = (overspendMonths.length / monthlyVariances.length) * 100;

		if (overspendPercentage > 70) {
			insights.push('You frequently exceed your budget. Consider increasing your budget amount or identifying areas to reduce spending.');
		} else if (overspendPercentage > 30) {
			insights.push('You occasionally overspend. Review months with high variance to identify spending triggers.');
		}

		// Analyze underspending patterns
		const underspendMonths = monthlyVariances.filter(m => m.variance < -10);
		if (underspendMonths.length > monthlyVariances.length / 2) {
			insights.push('You consistently spend less than budgeted. Consider reducing your budget to allocate funds elsewhere.');
		}

		// Analyze spending consistency
		const varianceRange = Math.max(...monthlyVariances.map(m => m.variancePercentage)) - 
			Math.min(...monthlyVariances.map(m => m.variancePercentage));

		if (varianceRange > 100) {
			insights.push('Your spending varies significantly month-to-month. Consider tracking specific spending triggers or seasonal patterns.');
		} else if (varianceRange < 20) {
			insights.push('Your spending is very consistent. Your budget appears well-calibrated to your needs.');
		}

		// Trend analysis
		if (monthlyVariances.length >= 3) {
			const recentVariances = monthlyVariances.slice(-3).map(m => m.variance);
			const isIncreasingTrend = recentVariances.every((v, i, arr) => i === 0 || v > arr[i - 1]);
			const isDecreasingTrend = recentVariances.every((v, i, arr) => i === 0 || v < arr[i - 1]);

			if (isIncreasingTrend) {
				insights.push('Your spending has been trending upward recently. Monitor this closely to avoid budget overruns.');
			} else if (isDecreasingTrend) {
				insights.push('Great progress! Your spending has been trending downward, showing improved budget discipline.');
			}
		}

		return insights.length > 0 ? insights : ['Your budget performance looks normal with no significant patterns detected.'];
	}

	/**
	 * Get the number of active subscriptions for a category
	 */
	private async getSubscriptionCount(categoryId: string): Promise<number> {
		try {
			const subscriptions = await this.repository.findSubscriptionsByCategory(categoryId);
			return subscriptions.filter(s => s.isActive).length;
		} catch (error) {
			// Return 0 if there's an error getting subscriptions
			return 0;
		}
	}

	/**
	 * Project future budget performance based on current spending velocity
	 */
	async projectBudgetPerformance(budgetId: string): Promise<{
		projectedEndDate: Date;
		projectedTotalSpent: number;
		riskLevel: 'low' | 'medium' | 'high';
		daysUntilDepletion: number | null;
		recommendedDailySpend: number;
	}> {
		// Test implementation - should be tested for production use
		try {
			const progress = await this.repository.calculateBudgetProgress(budgetId);
			if (!progress) {
				throw new Error(`Budget not found: ${budgetId}`);
			}

			const { budget, currentSpent, averageDailySpend, daysRemaining } = progress;
			
			// Calculate projected spending
			const projectedTotalSpent = currentSpent + (averageDailySpend * daysRemaining);
			
			// Calculate risk level
			let riskLevel: 'low' | 'medium' | 'high' = 'low';
			const spentPercentage = (currentSpent / budget.amount) * 100;
			const projectedPercentage = (projectedTotalSpent / budget.amount) * 100;

			if (projectedPercentage > 100) {
				riskLevel = 'high';
			} else if (projectedPercentage > 85 || spentPercentage > 75) {
				riskLevel = 'medium';
			}

			// Calculate days until budget depletion at current rate
			const remainingBudget = budget.amount - currentSpent;
			const daysUntilDepletion = averageDailySpend > 0 
				? Math.floor(remainingBudget / averageDailySpend)
				: null;

			// Calculate recommended daily spend to stay within budget
			const recommendedDailySpend = daysRemaining > 0 
				? remainingBudget / daysRemaining
				: 0;

			return {
				projectedEndDate: budget.endDate,
				projectedTotalSpent: Math.round(projectedTotalSpent),
				riskLevel,
				daysUntilDepletion,
				recommendedDailySpend: Math.round(recommendedDailySpend),
			};
		} catch (error) {
			throw new Error(`Failed to project budget performance: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`);
		}
	}
}