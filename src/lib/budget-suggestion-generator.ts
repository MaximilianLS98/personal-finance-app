/**
 * Budget Suggestion Generator
 * Specialized service for generating intelligent budget amount suggestions
 * based on historical spending patterns, subscription costs, and user behavior
 */

import type {
	BudgetSuggestion,
	BudgetAmount,
	SpendingAnalysis,
	TransactionRepository,
	Transaction,
	Subscription,
	BudgetPeriod,
} from './types';

export class BudgetSuggestionGenerator {
	constructor(private repository: TransactionRepository) {}

	/**
	 * Generate comprehensive budget suggestions for a category
	 */
	async generateSuggestions(categoryId: string, period: BudgetPeriod): Promise<BudgetSuggestion> {
		// Test implementation - should be tested for production use
		try {
			// Get category details
			const category = await this.repository.getCategoryById(categoryId);
			if (!category) {
				throw new Error(`Category not found: ${categoryId}`);
			}

			// Analyze spending patterns over different time periods
			const spendingAnalysis = await this.analyzeSpendingPatterns(categoryId);

			// Get subscription information for this category
			const subscriptionInfo = await this.calculateSubscriptionAllocation(categoryId);

			// Generate the three suggestion tiers
			const suggestions = this.calculateSuggestionTiers(
				spendingAnalysis,
				subscriptionInfo,
				period.type,
			);

			// Calculate confidence based on data quality and consistency
			const confidence = this.calculateConfidenceScore(spendingAnalysis, subscriptionInfo);

			return {
				categoryId,
				categoryName: category.name,
				period,
				suggestions,
				historicalData: {
					averageSpending: spendingAnalysis.averageMonthly,
					minSpending: spendingAnalysis.minMonthly,
					maxSpending: spendingAnalysis.maxMonthly,
					standardDeviation: spendingAnalysis.standardDeviation,
					monthsAnalyzed: spendingAnalysis.periodMonths,
				},
				subscriptionCosts: {
					fixedAmount: subscriptionInfo.monthlyTotal,
					subscriptionCount: subscriptionInfo.count,
				},
				confidence,
			};
		} catch (error) {
			throw new Error(
				`Failed to generate budget suggestions: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	/**
	 * Analyze spending patterns using intelligent data processing
	 */
	async analyzeSpendingPatterns(categoryId: string): Promise<SpendingAnalysis> {
		// Test implementation - should be tested for production use
		try {
			// Get different time periods for comprehensive analysis
			const analyses = await Promise.all([
				this.repository.analyzeHistoricalSpending(categoryId, 3), // 3 months
				this.repository.analyzeHistoricalSpending(categoryId, 6), // 6 months
				this.repository.analyzeHistoricalSpending(categoryId, 12), // 12 months
			]);

			// Filter out analyses with insufficient data
			const validAnalyses = analyses.filter((a) => a.confidence > 0.3);

			if (validAnalyses.length === 0) {
				// Return default analysis with low confidence
				return {
					categoryId,
					periodMonths: 3,
					averageMonthly: 0,
					minMonthly: 0,
					maxMonthly: 0,
					standardDeviation: 0,
					trend: 0,
					subscriptionCosts: 0,
					variableSpending: 0,
					confidence: 0.1,
				};
			}

			// Use weighted average based on confidence and recency
			const weights = validAnalyses.map((analysis, index) => {
				const recencyWeight = index === 0 ? 1.5 : index === 1 ? 1.2 : 1.0; // Favor more recent data
				return analysis.confidence * recencyWeight;
			});

			const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

			// Calculate weighted averages
			const weightedAverage =
				validAnalyses.reduce(
					(sum, analysis, index) => sum + analysis.averageMonthly * weights[index],
					0,
				) / totalWeight;

			const weightedMin = Math.min(...validAnalyses.map((a) => a.minMonthly));
			const weightedMax = Math.max(...validAnalyses.map((a) => a.maxMonthly));

			const weightedStdDev =
				validAnalyses.reduce(
					(sum, analysis, index) => sum + analysis.standardDeviation * weights[index],
					0,
				) / totalWeight;

			const weightedTrend =
				validAnalyses.reduce(
					(sum, analysis, index) => sum + analysis.trend * weights[index],
					0,
				) / totalWeight;

			const weightedSubscriptions =
				validAnalyses.reduce(
					(sum, analysis, index) => sum + analysis.subscriptionCosts * weights[index],
					0,
				) / totalWeight;

			const weightedVariable = weightedAverage - weightedSubscriptions;

			// Use the highest confidence from all analyses
			const bestConfidence = Math.max(...validAnalyses.map((a) => a.confidence));

			return {
				categoryId,
				periodMonths: validAnalyses[0].periodMonths, // Use the most recent period
				averageMonthly: weightedAverage,
				minMonthly: weightedMin,
				maxMonthly: weightedMax,
				standardDeviation: weightedStdDev,
				trend: weightedTrend,
				subscriptionCosts: weightedSubscriptions,
				variableSpending: Math.max(0, weightedVariable),
				confidence: bestConfidence,
			};
		} catch (error) {
			throw new Error(
				`Failed to analyze spending patterns: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	/**
	 * Calculate subscription cost allocation for the category
	 */
	async calculateSubscriptionAllocation(categoryId: string): Promise<{
		monthlyTotal: number;
		count: number;
		subscriptions: Array<{ name: string; monthlyAmount: number }>;
	}> {
		// Test implementation - should be tested for production use
		try {
			const subscriptions = await this.repository.findSubscriptionsByCategory(categoryId);
			const activeSubscriptions = subscriptions.filter((s) => s.isActive);

			let monthlyTotal = 0;
			const subscriptionDetails = activeSubscriptions.map((subscription) => {
				let monthlyAmount = 0;

				// Convert billing frequency to monthly amount
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
						if (subscription.customFrequencyDays) {
							const monthsPerCycle = subscription.customFrequencyDays / 30.44; // Average days per month
							monthlyAmount = subscription.amount / monthsPerCycle;
						}
						break;
				}

				monthlyTotal += monthlyAmount;

				return {
					name: subscription.name,
					monthlyAmount,
				};
			});

			return {
				monthlyTotal,
				count: activeSubscriptions.length,
				subscriptions: subscriptionDetails,
			};
		} catch (error) {
			// Return empty allocation if there's an error
			return {
				monthlyTotal: 0,
				count: 0,
				subscriptions: [],
			};
		}
	}

	/**
	 * Calculate the three budget suggestion tiers
	 */
	private calculateSuggestionTiers(
		spendingAnalysis: SpendingAnalysis,
		subscriptionInfo: { monthlyTotal: number; count: number },
		periodType: 'monthly' | 'yearly',
	): {
		conservative: BudgetAmount;
		moderate: BudgetAmount;
		aggressive: BudgetAmount;
	} {
		const baseAmount =
			periodType === 'monthly'
				? spendingAnalysis.averageMonthly
				: spendingAnalysis.averageMonthly * 12;

		const subscriptionFloor =
			periodType === 'monthly'
				? subscriptionInfo.monthlyTotal
				: subscriptionInfo.monthlyTotal * 12;

		// Factor in volatility (higher standard deviation = need more buffer)
		const volatilityMultiplier =
			spendingAnalysis.standardDeviation > 0
				? Math.min(
						1.5,
						1 + spendingAnalysis.standardDeviation / spendingAnalysis.averageMonthly,
					)
				: 1.1;

		// Factor in trend (increasing trend = need more budget)
		const trendAdjustment =
			spendingAnalysis.trend > 0
				? Math.min(
						1.2,
						1 + Math.abs(spendingAnalysis.trend) / spendingAnalysis.averageMonthly,
					)
				: 1.0;

		// Conservative: Generous buffer for peace of mind
		const conservativeMultiplier = Math.min(2.0, volatilityMultiplier * trendAdjustment * 1.3);
		const conservativeAmount = Math.max(
			baseAmount * conservativeMultiplier,
			subscriptionFloor * 1.2,
		);

		// Moderate: Balanced approach with reasonable buffer
		const moderateMultiplier = Math.min(1.5, volatilityMultiplier * trendAdjustment * 1.1);
		const moderateAmount = Math.max(baseAmount * moderateMultiplier, subscriptionFloor * 1.1);

		// Aggressive: Tight budget to encourage savings
		const aggressiveMultiplier = Math.max(0.8, 1 / (volatilityMultiplier * 1.1));
		const aggressiveAmount = Math.max(
			baseAmount * aggressiveMultiplier,
			subscriptionFloor, // Never go below subscription costs
		);

		return {
			conservative: {
				amount: Math.round(conservativeAmount),
				reasoning: this.generateReasoningText(
					'conservative',
					spendingAnalysis,
					subscriptionInfo,
					periodType,
				),
				confidence: Math.min(0.95, spendingAnalysis.confidence * 1.1),
			},
			moderate: {
				amount: Math.round(moderateAmount),
				reasoning: this.generateReasoningText(
					'moderate',
					spendingAnalysis,
					subscriptionInfo,
					periodType,
				),
				confidence: spendingAnalysis.confidence,
			},
			aggressive: {
				amount: Math.round(aggressiveAmount),
				reasoning: this.generateReasoningText(
					'aggressive',
					spendingAnalysis,
					subscriptionInfo,
					periodType,
				),
				confidence: Math.max(0.5, spendingAnalysis.confidence * 0.8),
			},
		};
	}

	/**
	 * Generate explanatory text for each budget tier
	 */
	private generateReasoningText(
		tier: 'conservative' | 'moderate' | 'aggressive',
		spendingAnalysis: SpendingAnalysis,
		subscriptionInfo: { monthlyTotal: number; count: number },
		periodType: 'monthly' | 'yearly',
	): string {
		const hasSubscriptions = subscriptionInfo.count > 0;
		const isVolatile =
			spendingAnalysis.standardDeviation > spendingAnalysis.averageMonthly * 0.3;
		const hasUpwardTrend = spendingAnalysis.trend > 0;

		const baseContext = `Based on ${spendingAnalysis.periodMonths} months of spending history`;
		const subscriptionContext = hasSubscriptions
			? ` and ${subscriptionInfo.count} active subscription${subscriptionInfo.count > 1 ? 's' : ''}`
			: '';

		switch (tier) {
			case 'conservative':
				let conservativeFactors = [];
				if (isVolatile) conservativeFactors.push('spending variability');
				if (hasUpwardTrend) conservativeFactors.push('increasing trend');
				if (hasSubscriptions) conservativeFactors.push('subscription commitments');

				const conservativeExtra =
					conservativeFactors.length > 0
						? ` with extra buffer for ${conservativeFactors.join(' and ')}`
						: ' with generous buffer for unexpected expenses';

				return `${baseContext}${subscriptionContext}. Provides comfortable spending room${conservativeExtra}. Best for peace of mind and avoiding budget stress.`;

			case 'moderate':
				return `${baseContext}${subscriptionContext}. Balanced approach matching your typical spending patterns with modest buffer for variations. Recommended for most situations.`;

			case 'aggressive':
				const aggressiveNote = hasSubscriptions
					? ' while ensuring subscription commitments are fully covered'
					: '';

				return `${baseContext}${subscriptionContext}. Tight budget encouraging reduced spending and savings${aggressiveNote}. Requires discipline but maximizes financial goals.`;
		}
	}

	/**
	 * Calculate overall confidence score for suggestions
	 */
	private calculateConfidenceScore(
		spendingAnalysis: SpendingAnalysis,
		subscriptionInfo: { monthlyTotal: number; count: number },
	): number {
		const factors = [
			// Base confidence from spending analysis
			spendingAnalysis.confidence,

			// Bonus for having subscription data (more predictable spending)
			subscriptionInfo.count > 0 ? 0.15 : 0,

			// Penalty for high volatility (less predictable)
			spendingAnalysis.standardDeviation > 0
				? Math.max(
						-0.2,
						-0.1 *
							(spendingAnalysis.standardDeviation /
								Math.max(1, spendingAnalysis.averageMonthly)),
					)
				: 0,

			// Bonus for sufficient transaction volume
			spendingAnalysis.periodMonths >= 6 ? 0.1 : 0,
		];

		const totalConfidence = factors.reduce((sum, factor) => sum + factor, 0);
		return Math.max(0.1, Math.min(1.0, totalConfidence));
	}
}
