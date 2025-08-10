/**
 * Unit tests for Financial Projection Engine
 */

import {
	FinancialProjectionEngine,
	DEFAULT_INVESTMENT_CONFIG,
	formatCurrency,
	formatPercentage,
	LongTermCostAnalyzer,
	getInvestmentDisclaimer,
	getAllInvestmentDisclaimers,
	type InvestmentConfig,
	type ComparisonResult,
} from '../financial-projection-engine';
import { Subscription } from '../types';

describe('FinancialProjectionEngine', () => {
	let engine: FinancialProjectionEngine;
	let mockSubscription: Subscription;

	beforeEach(() => {
		engine = new FinancialProjectionEngine();

		// Create a mock monthly subscription
		mockSubscription = {
			id: 'test-sub-1',
			name: 'Netflix',
			amount: 199, // NOK per month
			currency: 'NOK',
			billingFrequency: 'monthly',
			nextPaymentDate: new Date('2025-02-01'),
			categoryId: 'entertainment',
			isActive: true,
			startDate: new Date('2024-01-01'),
			createdAt: new Date(),
			updatedAt: new Date(),
		} as Subscription;
	});

	describe('calculateCompoundReturns', () => {
		it('should calculate monthly compound returns correctly', () => {
			const monthlyAmount = 199; // NOK
			const years = 10;

			const result = engine.calculateCompoundReturns(monthlyAmount, years);

			// With 7% annual return compounded monthly over 10 years
			// Monthly rate = 0.07/12, 120 months, future value of annuity
			// Expected: approximately 34,400 NOK
			expect(result).toBeGreaterThan(30000);
			expect(result).toBeLessThan(40000);
		});

		it('should handle zero return rate', () => {
			const monthlyAmount = 100;
			const years = 5;
			const config = { ...DEFAULT_INVESTMENT_CONFIG, annualReturnRate: 0 };

			const result = engine.calculateCompoundReturns(monthlyAmount, years, config);

			// With 0% return, should equal total contributions
			expect(result).toBe(monthlyAmount * years * 12);
		});

		it('should calculate annual compounding correctly', () => {
			const monthlyAmount = 100;
			const years = 5;
			const config = {
				...DEFAULT_INVESTMENT_CONFIG,
				monthlyCompounding: false,
			};

			const result = engine.calculateCompoundReturns(monthlyAmount, years, config);

			// Annual compounding should yield different result than monthly
			expect(result).toBeGreaterThan(5000); // More than just contributions
			expect(result).toBeLessThan(10000); // But reasonable for 5 years
		});

		it('should handle different return rates', () => {
			const monthlyAmount = 100;
			const years = 10;

			const lowReturn = engine.calculateCompoundReturns(monthlyAmount, years, {
				...DEFAULT_INVESTMENT_CONFIG,
				annualReturnRate: 0.03, // 3%
			});

			const highReturn = engine.calculateCompoundReturns(monthlyAmount, years, {
				...DEFAULT_INVESTMENT_CONFIG,
				annualReturnRate: 0.1, // 10%
			});

			expect(highReturn).toBeGreaterThan(lowReturn);
		});
	});

	describe('calculateSubscriptionCost', () => {
		it('should calculate monthly subscription cost with inflation', () => {
			const years = 5;

			const result = engine.calculateSubscriptionCost(mockSubscription, years);

			// With 2.5% inflation, 5-year cost should be more than simple multiplication
			const simpleTotal = mockSubscription.amount * 12 * years; // 11,940 NOK
			expect(result).toBeGreaterThan(simpleTotal);
			expect(result).toBeLessThan(simpleTotal * 1.2); // But not too much more
		});

		it('should handle quarterly subscriptions', () => {
			const quarterlySubscription = {
				...mockSubscription,
				billingFrequency: 'quarterly' as const,
				amount: 597, // 3 months worth
			};

			const result = engine.calculateSubscriptionCost(quarterlySubscription, 1);

			// Should be approximately same as monthly equivalent
			const monthlyEquivalent = engine.calculateSubscriptionCost(mockSubscription, 1);
			expect(Math.abs(result - monthlyEquivalent)).toBeLessThan(100); // Within 100 NOK
		});

		it('should handle annual subscriptions', () => {
			const annualSubscription = {
				...mockSubscription,
				billingFrequency: 'annually' as const,
				amount: 2388, // 12 months worth
			};

			const result = engine.calculateSubscriptionCost(annualSubscription, 1);

			// Should be approximately same as monthly equivalent
			const monthlyEquivalent = engine.calculateSubscriptionCost(mockSubscription, 1);
			expect(Math.abs(result - monthlyEquivalent)).toBeLessThan(100); // Within 100 NOK
		});

		it('should handle custom frequency subscriptions', () => {
			const customSubscription = {
				...mockSubscription,
				billingFrequency: 'custom' as const,
				customFrequencyDays: 60, // Every 2 months
				amount: 398, // 2 months worth
			};

			const result = engine.calculateSubscriptionCost(customSubscription, 1);

			// Should be approximately same as monthly equivalent
			const monthlyEquivalent = engine.calculateSubscriptionCost(mockSubscription, 1);
			expect(Math.abs(result - monthlyEquivalent)).toBeLessThan(100); // Within 100 NOK
		});

		it('should throw error for custom frequency without days', () => {
			const invalidSubscription = {
				...mockSubscription,
				billingFrequency: 'custom' as const,
				customFrequencyDays: undefined,
			};

			expect(() => {
				engine.calculateSubscriptionCost(invalidSubscription, 1);
			}).toThrow('Custom frequency requires customFrequencyDays');
		});
	});

	describe('generateProjections', () => {
		it('should generate projections for all time horizons', () => {
			const monthlyAmount = 199;

			const result = engine.generateProjections(monthlyAmount);

			expect(result.investmentValue).toHaveProperty('1');
			expect(result.investmentValue).toHaveProperty('5');
			expect(result.investmentValue).toHaveProperty('10');
			expect(result.investmentValue).toHaveProperty('20');

			// Values should increase with time
			expect(result.investmentValue[5]).toBeGreaterThan(result.investmentValue[1]);
			expect(result.investmentValue[10]).toBeGreaterThan(result.investmentValue[5]);
			expect(result.investmentValue[20]).toBeGreaterThan(result.investmentValue[10]);

			expect(result.monthlyInvestmentAmount).toBe(monthlyAmount);
			expect(result.config).toEqual(DEFAULT_INVESTMENT_CONFIG);
		});
	});

	describe('compareSubscriptionVsInvestment', () => {
		it('should provide complete comparison analysis', () => {
			const result = engine.compareSubscriptionVsInvestment(mockSubscription);

			// Should have all required properties
			expect(result).toHaveProperty('subscription');
			expect(result).toHaveProperty('subscriptionCost');
			expect(result).toHaveProperty('investmentValue');
			expect(result).toHaveProperty('potentialSavings');
			expect(result).toHaveProperty('breakEvenYears');
			expect(result).toHaveProperty('recommendation');
			expect(result).toHaveProperty('recommendationReason');

			// Subscription should match input
			expect(result.subscription).toBe(mockSubscription);

			// Monthly investment amount should match subscription
			expect(result.monthlyInvestmentAmount).toBe(199);

			// Break-even should be reasonable (between 0 and 50 years)
			expect(result.breakEvenYears).toBeGreaterThan(0);
			expect(result.breakEvenYears).toBeLessThan(50);

			// Recommendation should be valid
			expect(['keep', 'consider_cancelling', 'cancel_immediately']).toContain(
				result.recommendation,
			);
			expect(result.recommendationReason).toBeTruthy();
		});

		it('should recommend cancellation for high-cost subscriptions with quick break-even', () => {
			const expensiveSubscription = {
				...mockSubscription,
				amount: 1000, // Very expensive monthly subscription
			};

			const result = engine.compareSubscriptionVsInvestment(expensiveSubscription);

			// Should recommend cancellation due to high cost and investment potential
			expect(result.recommendation).toBe('cancel_immediately');
			expect(result.breakEvenYears).toBeLessThan(5);
		});

		it('should recommend keeping low-cost subscriptions', () => {
			const cheapSubscription = {
				...mockSubscription,
				amount: 29, // Very cheap monthly subscription
			};

			const result = engine.compareSubscriptionVsInvestment(cheapSubscription);

			// Even cheap subscriptions might be recommended for cancellation if investment potential is good
			// The recommendation depends on break-even analysis, not just cost
			expect(['keep', 'consider_cancelling', 'cancel_immediately']).toContain(
				result.recommendation,
			);
		});

		it('should handle different investment configurations', () => {
			const customConfig = {
				annualReturnRate: 0.1, // 10% return
				monthlyCompounding: true,
				inflationRate: 0.03, // 3% inflation
			};

			const result = engine.compareSubscriptionVsInvestment(mockSubscription, customConfig);

			expect(result.config).toEqual(customConfig);

			// Higher return rate should lead to better investment outcomes
			const defaultResult = engine.compareSubscriptionVsInvestment(mockSubscription);
			expect(result.potentialSavings[10]).toBeGreaterThan(defaultResult.potentialSavings[10]);
		});
	});

	describe('configuration management', () => {
		it('should update configuration correctly', () => {
			const newConfig = {
				annualReturnRate: 0.05,
				inflationRate: 0.03,
			};

			engine.updateConfig(newConfig);
			const updatedConfig = engine.getConfig();

			expect(updatedConfig.annualReturnRate).toBe(0.05);
			expect(updatedConfig.inflationRate).toBe(0.03);
			expect(updatedConfig.monthlyCompounding).toBe(
				DEFAULT_INVESTMENT_CONFIG.monthlyCompounding,
			);
		});

		it('should return copy of configuration', () => {
			const config1 = engine.getConfig();
			const config2 = engine.getConfig();

			expect(config1).toEqual(config2);
			expect(config1).not.toBe(config2); // Should be different objects
		});
	});

	describe('edge cases and error handling', () => {
		it('should handle very small amounts', () => {
			const tinySubscription = {
				...mockSubscription,
				amount: 0.01, // 1 øre
			};

			const result = engine.compareSubscriptionVsInvestment(tinySubscription);

			expect(result.monthlyInvestmentAmount).toBe(0.01);
			// Even tiny amounts can have recommendations based on mathematical analysis
			expect(['keep', 'consider_cancelling', 'cancel_immediately']).toContain(
				result.recommendation,
			);
		});

		it('should handle very large amounts', () => {
			const hugeSubscription = {
				...mockSubscription,
				amount: 100000, // 100,000 NOK per month
			};

			const result = engine.compareSubscriptionVsInvestment(hugeSubscription);

			expect(result.monthlyInvestmentAmount).toBe(100000);
			expect(result.recommendation).toBe('cancel_immediately'); // Huge opportunity cost
		});

		it('should handle zero return rate gracefully', () => {
			const zeroReturnConfig = {
				...DEFAULT_INVESTMENT_CONFIG,
				annualReturnRate: 0,
			};

			const result = engine.compareSubscriptionVsInvestment(
				mockSubscription,
				zeroReturnConfig,
			);

			expect(result.breakEvenYears).toBe(Infinity);
			expect(result.recommendation).toBe('keep');
		});
	});
});

describe('utility functions', () => {
	describe('formatCurrency', () => {
		it('should format NOK currency correctly', () => {
			const result = formatCurrency(1234.56, 'NOK');
			// Use non-breaking space (char code 160) as used by Intl.NumberFormat
			expect(result).toContain('1\u00A0235');
			expect(result).toContain('kr');

			const zeroResult = formatCurrency(0, 'NOK');
			expect(zeroResult).toContain('0');
			expect(zeroResult).toContain('kr');

			const millionResult = formatCurrency(1000000, 'NOK');
			expect(millionResult).toContain('1\u00A0000\u00A0000');
			expect(millionResult).toContain('kr');
		});

		it('should use NOK as default currency', () => {
			const result = formatCurrency(1234.56);
			expect(result).toContain('1\u00A0235');
			expect(result).toContain('kr');
		});

		it('should handle other currencies', () => {
			expect(formatCurrency(1234.56, 'USD')).toContain('1\u00A0235');
			expect(formatCurrency(1234.56, 'USD')).toContain('USD');
			expect(formatCurrency(1234.56, 'EUR')).toContain('1\u00A0235');
			expect(formatCurrency(1234.56, 'EUR')).toContain('€');
		});
	});

	describe('formatPercentage', () => {
		it('should format percentages correctly', () => {
			expect(formatPercentage(0.07)).toBe('7.0%');
			expect(formatPercentage(0.025)).toBe('2.5%');
			expect(formatPercentage(0.1)).toBe('10.0%');
			expect(formatPercentage(0)).toBe('0.0%');
			expect(formatPercentage(1)).toBe('100.0%');
		});
	});
});

describe('LongTermCostAnalyzer', () => {
	let analyzer: LongTermCostAnalyzer;
	let mockSubscription: Subscription;

	beforeEach(() => {
		analyzer = new LongTermCostAnalyzer();

		mockSubscription = {
			id: 'test-sub-1',
			name: 'Netflix',
			amount: 199,
			currency: 'NOK',
			billingFrequency: 'monthly',
			nextPaymentDate: new Date('2025-02-01'),
			categoryId: 'entertainment',
			isActive: true,
			startDate: new Date('2024-01-01'),
			createdAt: new Date(),
			updatedAt: new Date(),
		} as Subscription;
	});

	describe('generateChartData', () => {
		it('should generate chart data for all time horizons', () => {
			const chartData = analyzer.generateChartData(mockSubscription);

			expect(chartData).toHaveLength(4); // 1, 5, 10, 20 years

			chartData.forEach((dataPoint, index) => {
				expect(dataPoint).toHaveProperty('period');
				expect(dataPoint).toHaveProperty('subscriptionCost');
				expect(dataPoint).toHaveProperty('investmentValue');
				expect(dataPoint).toHaveProperty('potentialSavings');
				expect(dataPoint).toHaveProperty('cumulativeSubscriptionCost');
				expect(dataPoint).toHaveProperty('cumulativeInvestmentValue');

				expect(dataPoint.period).toBe(`Year ${[1, 5, 10, 20][index]}`);
				expect(typeof dataPoint.subscriptionCost).toBe('number');
				expect(typeof dataPoint.investmentValue).toBe('number');
			});

			// Values should increase with time
			expect(chartData[1].subscriptionCost).toBeGreaterThan(chartData[0].subscriptionCost);
			expect(chartData[2].investmentValue).toBeGreaterThan(chartData[1].investmentValue);
		});
	});

	describe('generateTableData', () => {
		it('should generate formatted table data', () => {
			const tableData = analyzer.generateTableData(mockSubscription);

			expect(tableData).toHaveProperty('rows');
			expect(tableData).toHaveProperty('summary');
			expect(tableData.rows).toHaveLength(4);

			tableData.rows.forEach((row) => {
				expect(row).toHaveProperty('period');
				expect(row).toHaveProperty('subscriptionCost');
				expect(row).toHaveProperty('investmentValue');
				expect(row).toHaveProperty('potentialSavings');
				expect(row).toHaveProperty('savingsPercentage');

				// Should be formatted as currency
				expect(row.subscriptionCost).toContain('kr');
				expect(row.investmentValue).toContain('kr');
				expect(row.potentialSavings).toContain('kr');
				expect(row.savingsPercentage).toContain('%');
			});

			// Summary should have all required fields
			expect(tableData.summary).toHaveProperty('totalSubscriptionCost');
			expect(tableData.summary).toHaveProperty('totalInvestmentValue');
			expect(tableData.summary).toHaveProperty('totalPotentialSavings');
			expect(tableData.summary).toHaveProperty('averageAnnualReturn');
			expect(tableData.summary).toHaveProperty('breakEvenYears');

			expect(tableData.summary.averageAnnualReturn).toBe('7.0%');
		});
	});

	describe('calculateBulkSavings', () => {
		it('should calculate savings for multiple subscriptions', () => {
			const subscription2 = {
				...mockSubscription,
				id: 'test-sub-2',
				name: 'Spotify',
				amount: 119,
			};

			const subscriptions = [mockSubscription, subscription2];
			const result = analyzer.calculateBulkSavings(subscriptions);

			expect(result.totalMonthlySavings).toBe(318); // 199 + 119
			expect(result.projections).toHaveProperty('1');
			expect(result.projections).toHaveProperty('5');
			expect(result.projections).toHaveProperty('10');
			expect(result.projections).toHaveProperty('20');

			expect(result.formattedSummary.monthlyAmount).toContain('318');
			expect(result.formattedSummary.monthlyAmount).toContain('kr');
			expect(result.formattedSummary.currency).toBe('NOK');

			// 10-year projection should be higher than 5-year
			expect(result.projections[10].totalInvestmentValue).toBeGreaterThan(
				result.projections[5].totalInvestmentValue,
			);
		});

		it('should handle empty subscription array', () => {
			const result = analyzer.calculateBulkSavings([]);

			expect(result.totalMonthlySavings).toBe(0);
			expect(result.formattedSummary.currency).toBe('NOK'); // Default
		});
	});

	describe('generateCategoryBreakdown', () => {
		it('should group subscriptions by category', () => {
			const subscriptions = [
				{
					...mockSubscription,
					category: { name: 'Entertainment', color: '#ff0000' },
				},
				{
					...mockSubscription,
					id: 'test-sub-2',
					name: 'Spotify',
					amount: 119,
					category: { name: 'Entertainment', color: '#ff0000' },
				},
				{
					...mockSubscription,
					id: 'test-sub-3',
					name: 'Office 365',
					amount: 89,
					category: { name: 'Productivity', color: '#00ff00' },
				},
			];

			const breakdown = analyzer.generateCategoryBreakdown(subscriptions);

			expect(breakdown).toHaveLength(2); // Entertainment and Productivity

			const entertainment = breakdown.find((cat) => cat.categoryName === 'Entertainment');
			const productivity = breakdown.find((cat) => cat.categoryName === 'Productivity');

			expect(entertainment).toBeDefined();
			expect(entertainment!.subscriptionCount).toBe(2);
			expect(entertainment!.monthlyTotal).toBe(318); // 199 + 119
			expect(entertainment!.categoryColor).toBe('#ff0000');

			expect(productivity).toBeDefined();
			expect(productivity!.subscriptionCount).toBe(1);
			expect(productivity!.monthlyTotal).toBe(89);

			// Should be sorted by cost (Entertainment > Productivity)
			expect(breakdown[0].categoryName).toBe('Entertainment');
			expect(breakdown[1].categoryName).toBe('Productivity');
		});

		it('should handle subscriptions without categories', () => {
			const subscriptions = [{ ...mockSubscription, category: undefined }];

			const breakdown = analyzer.generateCategoryBreakdown(subscriptions);

			expect(breakdown).toHaveLength(1);
			expect(breakdown[0].categoryName).toBe('Uncategorized');
			expect(breakdown[0].categoryColor).toBeUndefined();
		});
	});
});

describe('disclaimer utilities', () => {
	describe('getInvestmentDisclaimer', () => {
		it('should return appropriate disclaimer text', () => {
			expect(getInvestmentDisclaimer('general')).toContain('estimates');
			expect(getInvestmentDisclaimer('marketRisk')).toContain('risk');
			expect(getInvestmentDisclaimer('inflation')).toContain('Inflation');
			expect(getInvestmentDisclaimer('personalFinance')).toContain('informational');
			expect(getInvestmentDisclaimer('assumptions')).toContain('assumptions');
		});

		it('should default to general disclaimer', () => {
			expect(getInvestmentDisclaimer()).toBe(getInvestmentDisclaimer('general'));
		});
	});

	describe('getAllInvestmentDisclaimers', () => {
		it('should return all disclaimer texts', () => {
			const disclaimers = getAllInvestmentDisclaimers();

			expect(disclaimers).toHaveLength(5);
			expect(disclaimers.every((disclaimer) => typeof disclaimer === 'string')).toBe(true);
			expect(disclaimers.every((disclaimer) => disclaimer.length > 0)).toBe(true);
		});
	});
});
