/**
 * Extended budget repository methods
 * Contains the remaining budget repository methods that need to be integrated
 */

import type {
	BudgetScenario,
	BudgetAlert,
	SpendingAnalysis,
} from '../types';

// These methods should be integrated into the main SQLiteTransactionRepository class

/**
 * Analyze historical spending for a category over specified months
 */
export async function analyzeHistoricalSpending(
	db: any,
	categoryId: string,
	months: number,
): Promise<SpendingAnalysis> {
	try {
		// Calculate date range for analysis
		const endDate = new Date();
		const startDate = new Date();
		startDate.setMonth(startDate.getMonth() - months);

		// Get transaction data for the category
		const transactionStmt = db.prepare(`
			SELECT amount, date
			FROM transactions
			WHERE category_id = ? 
			  AND type = 'expense' 
			  AND date >= ? 
			  AND date <= ?
			ORDER BY date ASC
		`);

		const transactions = transactionStmt.all(
			categoryId,
			startDate.toISOString(),
			endDate.toISOString(),
		) as Array<{ amount: number; date: string }>;

		if (transactions.length === 0) {
			return {
				categoryId,
				periodMonths: months,
				averageMonthly: 0,
				minMonthly: 0,
				maxMonthly: 0,
				standardDeviation: 0,
				trend: 0,
				subscriptionCosts: 0,
				variableSpending: 0,
				confidence: 0,
			};
		}

		// Group transactions by month
		const monthlySpending = new Map<string, number>();
		
		for (const transaction of transactions) {
			const date = new Date(transaction.date);
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			const current = monthlySpending.get(monthKey) || 0;
			monthlySpending.set(monthKey, current + Math.abs(transaction.amount));
		}

		// Calculate monthly statistics
		const monthlyAmounts = Array.from(monthlySpending.values());
		const averageMonthly = monthlyAmounts.reduce((sum, amount) => sum + amount, 0) / Math.max(1, monthlyAmounts.length);
		const minMonthly = Math.min(...monthlyAmounts, 0);
		const maxMonthly = Math.max(...monthlyAmounts, 0);

		// Calculate standard deviation
		const variance = monthlyAmounts.reduce((sum, amount) => {
			return sum + Math.pow(amount - averageMonthly, 2);
		}, 0) / Math.max(1, monthlyAmounts.length);
		const standardDeviation = Math.sqrt(variance);

		// Calculate trend (simple linear regression slope)
		let trend = 0;
		if (monthlyAmounts.length >= 2) {
			const n = monthlyAmounts.length;
			const sumX = (n * (n - 1)) / 2;
			const sumY = monthlyAmounts.reduce((sum, amount) => sum + amount, 0);
			const sumXY = monthlyAmounts.reduce((sum, amount, index) => sum + (index * amount), 0);
			const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

			const numerator = (n * sumXY) - (sumX * sumY);
			const denominator = (n * sumX2) - (sumX * sumX);
			
			if (denominator !== 0) {
				trend = numerator / denominator;
			}
		}

		// Calculate subscription costs for this category
		const subscriptionStmt = db.prepare(`
			SELECT COALESCE(SUM(
				CASE 
					WHEN billing_frequency = 'monthly' THEN amount
					WHEN billing_frequency = 'quarterly' THEN amount / 3
					WHEN billing_frequency = 'annually' THEN amount / 12
					ELSE amount / (COALESCE(custom_frequency_days, 30) / 30.44)
				END
			), 0) as monthly_subscription_cost
			FROM subscriptions
			WHERE category_id = ? AND is_active = 1
		`);

		const subscriptionResult = subscriptionStmt.get(categoryId) as { monthly_subscription_cost: number };
		const subscriptionCosts = subscriptionResult.monthly_subscription_cost;
		const variableSpending = Math.max(0, averageMonthly - subscriptionCosts);

		// Calculate confidence based on data quality
		const dataQualityFactors = [
			Math.min(1, monthlyAmounts.length / 6), // More months = higher confidence (max at 6 months)
			Math.min(1, transactions.length / 20), // More transactions = higher confidence (max at 20 transactions)
			Math.max(0, 1 - (standardDeviation / averageMonthly)), // Lower volatility = higher confidence
		];
		
		const confidence = dataQualityFactors.reduce((sum, factor) => sum + factor, 0) / dataQualityFactors.length;

		return {
			categoryId,
			periodMonths: months,
			averageMonthly,
			minMonthly,
			maxMonthly,
			standardDeviation,
			trend,
			subscriptionCosts,
			variableSpending,
			confidence: Math.max(0.1, Math.min(1, confidence)), // Clamp between 0.1 and 1
		};
	} catch (error) {
		throw new Error(`Failed to analyze historical spending: ${
			error instanceof Error ? error.message : 'Unknown error'
		}`);
	}
}

/**
 * Create a new budget scenario
 */
export async function createBudgetScenario(
	db: any,
	scenario: Omit<BudgetScenario, 'id' | 'budgets' | 'totalBudgeted'>,
): Promise<BudgetScenario> {
	try {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		const stmt = db.prepare(`
			INSERT INTO budget_scenarios (id, name, description, is_active, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			id,
			scenario.name,
			scenario.description || null,
			scenario.isActive ? 1 : 0,
			now,
			now,
		);

		return {
			id,
			name: scenario.name,
			description: scenario.description,
			isActive: scenario.isActive,
			budgets: [],
			totalBudgeted: 0,
			createdAt: new Date(now),
			updatedAt: new Date(now),
		};
	} catch (error) {
		throw new Error(`Failed to create budget scenario: ${
			error instanceof Error ? error.message : 'Unknown error'
		}`);
	}
}

/**
 * Create a new budget alert
 */
export async function createBudgetAlert(
	db: any,
	alert: Omit<BudgetAlert, 'id'>,
): Promise<BudgetAlert> {
	try {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		const stmt = db.prepare(`
			INSERT INTO budget_alerts (
				id, budget_id, alert_type, threshold_percentage, message, is_read, created_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			id,
			alert.budgetId,
			alert.alertType,
			alert.thresholdPercentage || null,
			alert.message,
			alert.isRead ? 1 : 0,
			now,
		);

		return {
			id,
			budgetId: alert.budgetId,
			alertType: alert.alertType,
			thresholdPercentage: alert.thresholdPercentage,
			message: alert.message,
			isRead: alert.isRead,
			createdAt: new Date(now),
		};
	} catch (error) {
		throw new Error(`Failed to create budget alert: ${
			error instanceof Error ? error.message : 'Unknown error'
		}`);
	}
}