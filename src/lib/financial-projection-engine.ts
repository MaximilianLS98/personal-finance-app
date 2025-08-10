/**
 * Financial Projection Engine for Subscription Tracker
 *
 * Provides investment calculations, compound interest projections,
 * and subscription cost analysis for long-term financial planning.
 */

import { Subscription } from './types';

/**
 * Configuration for investment projections
 */
export interface InvestmentConfig {
	/** Annual return rate as decimal (e.g., 0.07 for 7%) */
	annualReturnRate: number;
	/** Whether to compound monthly (true) or annually (false) */
	monthlyCompounding: boolean;
	/** Inflation rate for cost adjustments */
	inflationRate: number;
}

/**
 * Default investment configuration
 */
export const DEFAULT_INVESTMENT_CONFIG: InvestmentConfig = {
	annualReturnRate: 0.07, // 7% annual return
	monthlyCompounding: true,
	inflationRate: 0.025, // 2.5% annual inflation
};

/**
 * Time horizon options for projections
 */
export const TIME_HORIZONS = [1, 5, 10, 20] as const;
export type TimeHorizon = (typeof TIME_HORIZONS)[number];

/**
 * Result of investment projection calculations
 */
export interface ProjectionResult {
	/** Original subscription cost over time periods */
	subscriptionCost: Record<TimeHorizon, number>;
	/** Potential investment value over time periods */
	investmentValue: Record<TimeHorizon, number>;
	/** Opportunity cost (investment value - subscription cost) */
	potentialSavings: Record<TimeHorizon, number>;
	/** Monthly amount that would be invested */
	monthlyInvestmentAmount: number;
	/** Configuration used for calculations */
	config: InvestmentConfig;
}

/**
 * Comparison result between subscription and investment
 */
export interface ComparisonResult extends ProjectionResult {
	/** Subscription being analyzed */
	subscription: Subscription;
	/** Break-even point in years (when investment > subscription cost) */
	breakEvenYears: number;
	/** Recommended action based on analysis */
	recommendation: 'keep' | 'consider_cancelling' | 'cancel_immediately';
	/** Reasoning for the recommendation */
	recommendationReason: string;
}

/**
 * Financial Projection Engine class
 */
export class FinancialProjectionEngine {
	private config: InvestmentConfig;

	constructor(config: InvestmentConfig = DEFAULT_INVESTMENT_CONFIG) {
		this.config = config;
	}

	/**
	 * Calculate compound interest returns for a given monthly investment
	 *
	 * @param monthlyAmount - Amount invested monthly
	 * @param years - Number of years to project
	 * @param config - Optional configuration override
	 * @returns Total investment value after compound growth
	 */
	calculateCompoundReturns(
		monthlyAmount: number,
		years: number,
		config?: Partial<InvestmentConfig>,
	): number {
		const effectiveConfig = { ...this.config, ...config };
		const { annualReturnRate, monthlyCompounding } = effectiveConfig;

		if (monthlyCompounding) {
			// Monthly compounding formula: FV = PMT * [((1 + r)^n - 1) / r]
			// Where r = monthly rate, n = total months, PMT = monthly payment
			const monthlyRate = annualReturnRate / 12;
			const totalMonths = years * 12;

			if (monthlyRate === 0) {
				// Handle edge case where return rate is 0
				return monthlyAmount * totalMonths;
			}

			const futureValue =
				(monthlyAmount * (Math.pow(1 + monthlyRate, totalMonths) - 1)) / monthlyRate;

			return futureValue;
		} else {
			// Annual compounding with monthly contributions
			let totalValue = 0;
			const annualContribution = monthlyAmount * 12;

			for (let year = 1; year <= years; year++) {
				totalValue = (totalValue + annualContribution) * (1 + annualReturnRate);
			}

			return totalValue;
		}
	}

	/**
	 * Calculate subscription costs over time with inflation
	 *
	 * @param subscription - Subscription to analyze
	 * @param years - Number of years to project
	 * @param config - Optional configuration override
	 * @returns Total subscription cost over the period
	 */
	calculateSubscriptionCost(
		subscription: Subscription,
		years: number,
		config?: Partial<InvestmentConfig>,
	): number {
		const effectiveConfig = { ...this.config, ...config };
		const { inflationRate } = effectiveConfig;

		// Convert subscription amount to monthly equivalent
		const monthlyAmount = this.getMonthlyAmount(subscription);

		// Calculate total cost with inflation
		let totalCost = 0;
		const monthsPerYear = 12;

		for (let year = 1; year <= years; year++) {
			// Apply inflation to the monthly amount for this year
			const inflatedMonthlyAmount = monthlyAmount * Math.pow(1 + inflationRate, year - 1);
			totalCost += inflatedMonthlyAmount * monthsPerYear;
		}

		return totalCost;
	}

	/**
	 * Generate comprehensive projection for multiple time horizons
	 *
	 * @param monthlyAmount - Monthly amount to invest
	 * @param config - Optional configuration override
	 * @returns Projection results for all time horizons
	 */
	generateProjections(
		monthlyAmount: number,
		config?: Partial<InvestmentConfig>,
	): Pick<ProjectionResult, 'investmentValue' | 'monthlyInvestmentAmount' | 'config'> {
		const effectiveConfig = { ...this.config, ...config };

		const investmentValue = {} as Record<TimeHorizon, number>;

		for (const years of TIME_HORIZONS) {
			investmentValue[years] = this.calculateCompoundReturns(
				monthlyAmount,
				years,
				effectiveConfig,
			);
		}

		return {
			investmentValue,
			monthlyInvestmentAmount: monthlyAmount,
			config: effectiveConfig,
		};
	}

	/**
	 * Compare subscription costs vs investment returns
	 *
	 * @param subscription - Subscription to analyze
	 * @param config - Optional configuration override
	 * @returns Complete comparison analysis
	 */
	compareSubscriptionVsInvestment(
		subscription: Subscription,
		config?: Partial<InvestmentConfig>,
	): ComparisonResult {
		const effectiveConfig = { ...this.config, ...config };
		const monthlyAmount = this.getMonthlyAmount(subscription);

		// Calculate costs and investment values for all time horizons
		const subscriptionCost = {} as Record<TimeHorizon, number>;
		const investmentValue = {} as Record<TimeHorizon, number>;
		const potentialSavings = {} as Record<TimeHorizon, number>;

		for (const years of TIME_HORIZONS) {
			subscriptionCost[years] = this.calculateSubscriptionCost(
				subscription,
				years,
				effectiveConfig,
			);
			investmentValue[years] = this.calculateCompoundReturns(
				monthlyAmount,
				years,
				effectiveConfig,
			);
			potentialSavings[years] = investmentValue[years] - subscriptionCost[years];
		}

		// Calculate break-even point
		const breakEvenYears = this.calculateBreakEvenPoint(subscription, effectiveConfig);

		// Generate recommendation
		const { recommendation, recommendationReason } = this.generateRecommendation(
			subscription,
			potentialSavings,
			breakEvenYears,
		);

		return {
			subscription,
			subscriptionCost,
			investmentValue,
			potentialSavings,
			monthlyInvestmentAmount: monthlyAmount,
			config: effectiveConfig,
			breakEvenYears,
			recommendation,
			recommendationReason,
		};
	}

	/**
	 * Convert subscription amount to monthly equivalent
	 *
	 * @param subscription - Subscription to convert
	 * @returns Monthly amount
	 */
	private getMonthlyAmount(subscription: Subscription): number {
		const { amount, billingFrequency, customFrequencyDays } = subscription;

		switch (billingFrequency) {
			case 'monthly':
				return amount;
			case 'quarterly':
				return amount / 3;
			case 'annually':
				return amount / 12;
			case 'custom':
				if (!customFrequencyDays) {
					throw new Error('Custom frequency requires customFrequencyDays');
				}
				// Convert custom frequency to monthly
				const monthsPerCustomPeriod = customFrequencyDays / 30.44; // Average days per month
				return amount / monthsPerCustomPeriod;
			default:
				throw new Error(`Unsupported billing frequency: ${billingFrequency}`);
		}
	}

	/**
	 * Calculate the break-even point where investment value exceeds subscription cost
	 *
	 * @param subscription - Subscription to analyze
	 * @param config - Investment configuration
	 * @returns Years until break-even (or Infinity if never)
	 */
	private calculateBreakEvenPoint(subscription: Subscription, config: InvestmentConfig): number {
		const monthlyAmount = this.getMonthlyAmount(subscription);

		// Binary search for break-even point (up to 50 years)
		let low = 0.1;
		let high = 50;
		const tolerance = 0.01; // 1 cent tolerance

		while (high - low > 0.1) {
			const mid = (low + high) / 2;
			const investmentValue = this.calculateCompoundReturns(monthlyAmount, mid, config);
			const subscriptionCost = this.calculateSubscriptionCost(subscription, mid, config);

			if (investmentValue > subscriptionCost + tolerance) {
				high = mid;
			} else {
				low = mid;
			}
		}

		// Verify the result
		const finalYears = (low + high) / 2;
		const finalInvestmentValue = this.calculateCompoundReturns(
			monthlyAmount,
			finalYears,
			config,
		);
		const finalSubscriptionCost = this.calculateSubscriptionCost(
			subscription,
			finalYears,
			config,
		);

		return finalInvestmentValue > finalSubscriptionCost ? finalYears : Infinity;
	}

	/**
	 * Generate recommendation based on analysis results
	 *
	 * @param subscription - Subscription being analyzed
	 * @param potentialSavings - Savings for each time horizon
	 * @param breakEvenYears - Years until break-even
	 * @returns Recommendation and reasoning
	 */
	private generateRecommendation(
		subscription: Subscription,
		potentialSavings: Record<TimeHorizon, number>,
		breakEvenYears: number,
	): { recommendation: ComparisonResult['recommendation']; recommendationReason: string } {
		const monthlyAmount = this.getMonthlyAmount(subscription);
		const fiveYearSavings = potentialSavings[5];
		const tenYearSavings = potentialSavings[10];

		// High-cost subscriptions (>$50/month equivalent) get stricter analysis
		const isHighCost = monthlyAmount > 50;

		// Very quick break-even (< 2 years) suggests immediate cancellation
		if (breakEvenYears < 2) {
			return {
				recommendation: 'cancel_immediately',
				recommendationReason: `Investment breaks even in ${breakEvenYears.toFixed(1)} years. Consider cancelling and investing the money instead.`,
			};
		}

		// Good break-even (< 5 years) with significant 10-year savings
		if (breakEvenYears < 5 && tenYearSavings > monthlyAmount * 12) {
			return {
				recommendation: 'consider_cancelling',
				recommendationReason: `Investment breaks even in ${breakEvenYears.toFixed(1)} years with potential 10-year savings of $${tenYearSavings.toFixed(0)}.`,
			};
		}

		// High-cost subscription with moderate break-even
		if (isHighCost && breakEvenYears < 7 && fiveYearSavings > 0) {
			return {
				recommendation: 'consider_cancelling',
				recommendationReason: `High-cost subscription ($${monthlyAmount.toFixed(0)}/month) with ${breakEvenYears.toFixed(1)}-year break-even. Review if value justifies cost.`,
			};
		}

		// Long break-even or negative savings suggest keeping
		if (breakEvenYears > 10 || fiveYearSavings < 0) {
			return {
				recommendation: 'keep',
				recommendationReason:
					breakEvenYears === Infinity
						? "Investment returns don't exceed subscription costs in reasonable timeframe."
						: `Investment break-even takes ${breakEvenYears.toFixed(1)} years. Subscription may provide better value.`,
			};
		}

		// Default to keep for moderate scenarios
		return {
			recommendation: 'keep',
			recommendationReason: `Moderate investment potential. Consider personal value and usage when deciding.`,
		};
	}

	/**
	 * Update the engine's default configuration
	 *
	 * @param newConfig - New configuration to merge
	 */
	updateConfig(newConfig: Partial<InvestmentConfig>): void {
		this.config = { ...this.config, ...newConfig };
	}

	/**
	 * Get current configuration
	 *
	 * @returns Current investment configuration
	 */
	getConfig(): InvestmentConfig {
		return { ...this.config };
	}
}

/**
 * Utility function to format currency values for display
 *
 * @param amount - Amount to format
 * @param currency - Currency code (default: 'NOK')
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string = 'NOK'): string {
	return new Intl.NumberFormat('nb-NO', {
		style: 'currency',
		currency: currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

/**
 * Utility function to format percentage values
 *
 * @param rate - Rate as decimal (e.g., 0.07 for 7%)
 * @returns Formatted percentage string
 */
export function formatPercentage(rate: number): string {
	return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Data structure for chart visualization
 */
export interface ChartDataPoint {
	/** Time period label (e.g., "Year 1", "Year 5") */
	period: string;
	/** Subscription cost for this period */
	subscriptionCost: number;
	/** Investment value for this period */
	investmentValue: number;
	/** Potential savings (investment - subscription) */
	potentialSavings: number;
	/** Cumulative subscription cost up to this period */
	cumulativeSubscriptionCost: number;
	/** Cumulative investment value up to this period */
	cumulativeInvestmentValue: number;
}

/**
 * Formatted data for table display
 */
export interface TableData {
	/** Time horizons and their corresponding values */
	rows: Array<{
		period: string;
		subscriptionCost: string;
		investmentValue: string;
		potentialSavings: string;
		savingsPercentage: string;
	}>;
	/** Summary statistics */
	summary: {
		totalSubscriptionCost: string;
		totalInvestmentValue: string;
		totalPotentialSavings: string;
		averageAnnualReturn: string;
		breakEvenYears: string;
	};
}

/**
 * Investment risk disclaimers
 */
export const INVESTMENT_DISCLAIMERS = {
	general:
		'Investment projections are estimates based on historical market performance and should not be considered guaranteed returns.',
	marketRisk:
		'All investments carry risk, including potential loss of principal. Past performance does not guarantee future results.',
	inflation:
		'Inflation rates and subscription price increases are estimates and may vary significantly from projections.',
	personalFinance:
		'This analysis is for informational purposes only and should not replace professional financial advice.',
	assumptions:
		'Calculations assume consistent monthly investments and compound growth, which may not reflect real-world conditions.',
} as const;

/**
 * Long-term cost analysis utilities
 */
export class LongTermCostAnalyzer {
	private engine: FinancialProjectionEngine;

	constructor(engine: FinancialProjectionEngine = new FinancialProjectionEngine()) {
		this.engine = engine;
	}

	/**
	 * Generate chart data for visualization
	 *
	 * @param subscription - Subscription to analyze
	 * @param config - Optional investment configuration
	 * @returns Chart data points for all time horizons
	 */
	generateChartData(
		subscription: Subscription,
		config?: Partial<InvestmentConfig>,
	): ChartDataPoint[] {
		const comparison = this.engine.compareSubscriptionVsInvestment(subscription, config);

		return TIME_HORIZONS.map((years) => {
			const subscriptionCost = comparison.subscriptionCost[years];
			const investmentValue = comparison.investmentValue[years];
			const potentialSavings = comparison.potentialSavings[years];

			return {
				period: `Year ${years}`,
				subscriptionCost,
				investmentValue,
				potentialSavings,
				cumulativeSubscriptionCost: subscriptionCost,
				cumulativeInvestmentValue: investmentValue,
			};
		});
	}

	/**
	 * Generate formatted table data
	 *
	 * @param subscription - Subscription to analyze
	 * @param config - Optional investment configuration
	 * @returns Formatted table data with currency formatting
	 */
	generateTableData(subscription: Subscription, config?: Partial<InvestmentConfig>): TableData {
		const comparison = this.engine.compareSubscriptionVsInvestment(subscription, config);
		const currency = subscription.currency;

		const rows = TIME_HORIZONS.map((years) => {
			const subscriptionCost = comparison.subscriptionCost[years];
			const investmentValue = comparison.investmentValue[years];
			const potentialSavings = comparison.potentialSavings[years];
			const savingsPercentage =
				subscriptionCost > 0 ? (potentialSavings / subscriptionCost) * 100 : 0;

			return {
				period: `${years} Year${years > 1 ? 's' : ''}`,
				subscriptionCost: formatCurrency(subscriptionCost, currency),
				investmentValue: formatCurrency(investmentValue, currency),
				potentialSavings: formatCurrency(potentialSavings, currency),
				savingsPercentage: `${savingsPercentage >= 0 ? '+' : ''}${savingsPercentage.toFixed(1)}%`,
			};
		});

		// Calculate totals for the longest time horizon
		const longestHorizon = Math.max(...TIME_HORIZONS);
		const totalSubscriptionCost = comparison.subscriptionCost[longestHorizon];
		const totalInvestmentValue = comparison.investmentValue[longestHorizon];
		const totalPotentialSavings = comparison.potentialSavings[longestHorizon];

		return {
			rows,
			summary: {
				totalSubscriptionCost: formatCurrency(totalSubscriptionCost, currency),
				totalInvestmentValue: formatCurrency(totalInvestmentValue, currency),
				totalPotentialSavings: formatCurrency(totalPotentialSavings, currency),
				averageAnnualReturn: formatPercentage(comparison.config.annualReturnRate),
				breakEvenYears:
					comparison.breakEvenYears === Infinity
						? 'Never'
						: `${comparison.breakEvenYears.toFixed(1)} years`,
			},
		};
	}

	/**
	 * Calculate potential savings from cancelling multiple subscriptions
	 *
	 * @param subscriptions - Array of subscriptions to analyze
	 * @param config - Optional investment configuration
	 * @returns Combined savings analysis
	 */
	calculateBulkSavings(
		subscriptions: Subscription[],
		config?: Partial<InvestmentConfig>,
	): {
		totalMonthlySavings: number;
		projections: Record<
			TimeHorizon,
			{
				totalSubscriptionCost: number;
				totalInvestmentValue: number;
				totalPotentialSavings: number;
			}
		>;
		formattedSummary: {
			monthlyAmount: string;
			projections: Record<TimeHorizon, string>;
			currency: string;
		};
	} {
		const effectiveConfig = { ...DEFAULT_INVESTMENT_CONFIG, ...config };

		// Calculate total monthly amount from all subscriptions
		const totalMonthlyAmount = subscriptions.reduce((total, subscription) => {
			return total + this.getMonthlyAmount(subscription);
		}, 0);

		// Generate projections for the combined amount
		const projections = {} as Record<
			TimeHorizon,
			{
				totalSubscriptionCost: number;
				totalInvestmentValue: number;
				totalPotentialSavings: number;
			}
		>;

		const formattedProjections = {} as Record<TimeHorizon, string>;
		const currency = subscriptions[0]?.currency || 'NOK';

		for (const years of TIME_HORIZONS) {
			const subscriptionCost = subscriptions.reduce((total, subscription) => {
				return (
					total +
					this.engine.calculateSubscriptionCost(subscription, years, effectiveConfig)
				);
			}, 0);

			const investmentValue = this.engine.calculateCompoundReturns(
				totalMonthlyAmount,
				years,
				effectiveConfig,
			);

			const potentialSavings = investmentValue - subscriptionCost;

			projections[years] = {
				totalSubscriptionCost: subscriptionCost,
				totalInvestmentValue: investmentValue,
				totalPotentialSavings: potentialSavings,
			};

			formattedProjections[years] = formatCurrency(potentialSavings, currency);
		}

		return {
			totalMonthlySavings: totalMonthlyAmount,
			projections,
			formattedSummary: {
				monthlyAmount: formatCurrency(totalMonthlyAmount, currency),
				projections: formattedProjections,
				currency,
			},
		};
	}

	/**
	 * Generate cost breakdown by category
	 *
	 * @param subscriptions - Array of subscriptions with categories
	 * @returns Cost breakdown by category
	 */
	generateCategoryBreakdown(
		subscriptions: (Subscription & { category?: { name: string; color: string } })[],
	): Array<{
		categoryName: string;
		categoryColor?: string;
		monthlyTotal: number;
		annualTotal: number;
		subscriptionCount: number;
		subscriptions: Array<{
			name: string;
			monthlyAmount: number;
			annualAmount: number;
		}>;
		formattedMonthlyTotal: string;
		formattedAnnualTotal: string;
	}> {
		const categoryMap = new Map<
			string,
			{
				name: string;
				color?: string;
				subscriptions: typeof subscriptions;
				monthlyTotal: number;
			}
		>();

		// Group subscriptions by category
		subscriptions.forEach((subscription) => {
			const categoryName = subscription.category?.name || 'Uncategorized';
			const monthlyAmount = this.getMonthlyAmount(subscription);

			if (!categoryMap.has(categoryName)) {
				categoryMap.set(categoryName, {
					name: categoryName,
					color: subscription.category?.color,
					subscriptions: [],
					monthlyTotal: 0,
				});
			}

			const category = categoryMap.get(categoryName)!;
			category.subscriptions.push(subscription);
			category.monthlyTotal += monthlyAmount;
		});

		// Convert to array and format
		return Array.from(categoryMap.values())
			.map((category) => {
				const annualTotal = category.monthlyTotal * 12;
				const currency = category.subscriptions[0]?.currency || 'NOK';

				return {
					categoryName: category.name,
					categoryColor: category.color,
					monthlyTotal: category.monthlyTotal,
					annualTotal,
					subscriptionCount: category.subscriptions.length,
					subscriptions: category.subscriptions.map((sub) => ({
						name: sub.name,
						monthlyAmount: this.getMonthlyAmount(sub),
						annualAmount: this.getMonthlyAmount(sub) * 12,
					})),
					formattedMonthlyTotal: formatCurrency(category.monthlyTotal, currency),
					formattedAnnualTotal: formatCurrency(annualTotal, currency),
				};
			})
			.sort((a, b) => b.monthlyTotal - a.monthlyTotal); // Sort by cost descending
	}

	/**
	 * Get monthly amount for a subscription (helper method)
	 */
	private getMonthlyAmount(subscription: Subscription): number {
		const { amount, billingFrequency, customFrequencyDays } = subscription;

		switch (billingFrequency) {
			case 'monthly':
				return amount;
			case 'quarterly':
				return amount / 3;
			case 'annually':
				return amount / 12;
			case 'custom':
				if (!customFrequencyDays) {
					throw new Error('Custom frequency requires customFrequencyDays');
				}
				const monthsPerCustomPeriod = customFrequencyDays / 30.44;
				return amount / monthsPerCustomPeriod;
			default:
				throw new Error(`Unsupported billing frequency: ${billingFrequency}`);
		}
	}
}

/**
 * Utility function to get appropriate disclaimer text
 *
 * @param context - Context for which disclaimer is needed
 * @returns Appropriate disclaimer text
 */
export function getInvestmentDisclaimer(
	context: 'general' | 'marketRisk' | 'inflation' | 'personalFinance' | 'assumptions' = 'general',
): string {
	return INVESTMENT_DISCLAIMERS[context];
}

/**
 * Utility function to get all disclaimers as an array
 *
 * @returns Array of all disclaimer texts
 */
export function getAllInvestmentDisclaimers(): string[] {
	return Object.values(INVESTMENT_DISCLAIMERS);
}

/**
 * Create a default financial projection engine instance
 */
export const defaultProjectionEngine = new FinancialProjectionEngine();

/**
 * Create a default long-term cost analyzer instance
 */
export const defaultCostAnalyzer = new LongTermCostAnalyzer(defaultProjectionEngine);
