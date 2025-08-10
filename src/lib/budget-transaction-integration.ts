/**
 * Budget Transaction Integration Service
 * Handles real-time budget updates when transactions are imported/categorized
 */

import type {
	Transaction,
	Budget,
	BudgetProgress,
	BudgetAlert,
	TransactionRepository,
} from './types';
import { BudgetService } from './budget-service';

export interface BudgetTransactionIntegration {
	/**
	 * Update budgets when transactions are created/imported
	 */
	onTransactionsCreated(transactions: Transaction[]): Promise<void>;

	/**
	 * Update budgets when a transaction is updated (e.g., categorized)
	 */
	onTransactionUpdated(
		transactionId: string,
		oldTransaction: Transaction,
		newTransaction: Transaction,
	): Promise<void>;

	/**
	 * Update budgets when a transaction is deleted
	 */
	onTransactionDeleted(transaction: Transaction): Promise<void>;

	/**
	 * Bulk update budgets for multiple transaction changes
	 */
	onBulkTransactionChanges(changes: TransactionChange[]): Promise<void>;

	/**
	 * Check if transaction impacts any budgets and create alerts if needed
	 */
	checkTransactionBudgetImpact(transaction: Transaction): Promise<BudgetImpactResult>;
}

export interface TransactionChange {
	type: 'created' | 'updated' | 'deleted';
	transactionId: string;
	oldTransaction?: Transaction;
	newTransaction?: Transaction;
}

export interface BudgetImpactResult {
	impactedBudgets: Budget[];
	alertsCreated: BudgetAlert[];
	significantImpact: boolean; // True if transaction is >10% of any budget
}

export class BudgetTransactionIntegrationService implements BudgetTransactionIntegration {
	private budgetService: BudgetService;

	constructor(private repository: TransactionRepository) {
		this.budgetService = new BudgetService(repository);
	}

	/**
	 * Update budgets when transactions are created/imported
	 */
	async onTransactionsCreated(transactions: Transaction[]): Promise<void> {
		try {
			// Group transactions by category for efficient processing
			const transactionsByCategory = this.groupTransactionsByCategory(transactions);

			// Process each category's transactions
			for (const [categoryId, categoryTransactions] of transactionsByCategory) {
				if (!categoryId) continue; // Skip uncategorized transactions

				await this.updateBudgetsForCategory(categoryId, categoryTransactions, 'created');
			}

			// Check for significant impacts and create alerts
			await this.checkBulkTransactionImpacts(transactions);
		} catch (error) {
			console.error('Error updating budgets after transaction creation:', error);
			// Don't throw - budget updates shouldn't fail transaction creation
		}
	}

	/**
	 * Update budgets when a transaction is updated (e.g., categorized)
	 */
	async onTransactionUpdated(
		transactionId: string,
		oldTransaction: Transaction,
		newTransaction: Transaction,
	): Promise<void> {
		try {
			// Handle category changes
			if (oldTransaction.categoryId !== newTransaction.categoryId) {
				// Remove impact from old category
				if (oldTransaction.categoryId) {
					await this.updateBudgetsForCategory(
						oldTransaction.categoryId,
						[oldTransaction],
						'removed',
					);
				}

				// Add impact to new category
				if (newTransaction.categoryId) {
					await this.updateBudgetsForCategory(
						newTransaction.categoryId,
						[newTransaction],
						'added',
					);
				}
			}

			// Handle amount changes
			else if (oldTransaction.amount !== newTransaction.amount) {
				if (newTransaction.categoryId) {
					await this.updateBudgetsForCategory(
						newTransaction.categoryId,
						[newTransaction],
						'updated',
					);
				}
			}

			// Check for significant impact
			await this.checkTransactionBudgetImpact(newTransaction);
		} catch (error) {
			console.error('Error updating budgets after transaction update:', error);
		}
	}

	/**
	 * Update budgets when a transaction is deleted
	 */
	async onTransactionDeleted(transaction: Transaction): Promise<void> {
		try {
			if (transaction.categoryId) {
				await this.updateBudgetsForCategory(
					transaction.categoryId,
					[transaction],
					'removed',
				);
			}
		} catch (error) {
			console.error('Error updating budgets after transaction deletion:', error);
		}
	}

	/**
	 * Bulk update budgets for multiple transaction changes
	 */
	async onBulkTransactionChanges(changes: TransactionChange[]): Promise<void> {
		try {
			// Group changes by category for efficient processing
			const categoryChanges = new Map<string, TransactionChange[]>();

			for (const change of changes) {
				const categoryId =
					change.newTransaction?.categoryId || change.oldTransaction?.categoryId;
				if (!categoryId) continue;

				if (!categoryChanges.has(categoryId)) {
					categoryChanges.set(categoryId, []);
				}
				categoryChanges.get(categoryId)!.push(change);
			}

			// Process each category's changes
			for (const [categoryId, categoryChangeList] of categoryChanges) {
				await this.processCategoryChanges(categoryId, categoryChangeList);
			}

			// Check for significant impacts
			const allTransactions = changes
				.map((c) => c.newTransaction || c.oldTransaction)
				.filter(Boolean) as Transaction[];
			await this.checkBulkTransactionImpacts(allTransactions);
		} catch (error) {
			console.error('Error processing bulk transaction changes:', error);
		}
	}

	/**
	 * Check if transaction impacts any budgets and create alerts if needed
	 */
	async checkTransactionBudgetImpact(transaction: Transaction): Promise<BudgetImpactResult> {
		const result: BudgetImpactResult = {
			impactedBudgets: [],
			alertsCreated: [],
			significantImpact: false,
		};

		try {
			if (!transaction.categoryId || transaction.type !== 'expense') {
				return result;
			}

			// Find active budgets for this category
			const budgets = await this.repository.findBudgetsByCategory(transaction.categoryId);
			const activeBudgets = budgets.filter((b) => b.isActive);

			for (const budget of activeBudgets) {
				// Check if transaction is within budget period
				if (!this.isTransactionInBudgetPeriod(transaction, budget)) {
					continue;
				}

				result.impactedBudgets.push(budget);

				// Check if transaction is significant (>10% of budget)
				const transactionPercentage = Math.abs(transaction.amount) / budget.amount;
				if (transactionPercentage > 0.1) {
					result.significantImpact = true;

					// Create significant transaction alert
					const alert = await this.repository.createBudgetAlert({
						budgetId: budget.id,
						alertType: 'large_transaction',
						message: `Large transaction detected: ${transaction.description} (${(transactionPercentage * 100).toFixed(1)}% of budget)`,
						isRead: false,
					});
					result.alertsCreated.push(alert);
				}

				// Check if budget progress crosses any thresholds
				const progress = await this.repository.calculateBudgetProgress(budget.id);
				if (progress) {
					const thresholdAlerts = await this.checkThresholdAlerts(budget, progress);
					result.alertsCreated.push(...thresholdAlerts);
				}
			}
		} catch (error) {
			console.error('Error checking transaction budget impact:', error);
		}

		return result;
	}

	// ===== PRIVATE HELPER METHODS =====

	/**
	 * Group transactions by category ID
	 */
	private groupTransactionsByCategory(transactions: Transaction[]): Map<string, Transaction[]> {
		const grouped = new Map<string, Transaction[]>();

		for (const transaction of transactions) {
			const categoryId = transaction.categoryId || 'uncategorized';
			if (!grouped.has(categoryId)) {
				grouped.set(categoryId, []);
			}
			grouped.get(categoryId)!.push(transaction);
		}

		return grouped;
	}

	/**
	 * Update budgets for a specific category
	 */
	private async updateBudgetsForCategory(
		categoryId: string,
		transactions: Transaction[],
		changeType: 'created' | 'updated' | 'added' | 'removed',
	): Promise<void> {
		// Find active budgets for this category
		const budgets = await this.repository.findBudgetsByCategory(categoryId);
		const activeBudgets = budgets.filter((b) => b.isActive);

		if (activeBudgets.length === 0) {
			return; // No budgets to update
		}

		// Filter transactions that affect budgets (expenses within budget periods)
		const relevantTransactions = transactions.filter(
			(t) =>
				t.type === 'expense' &&
				activeBudgets.some((budget) => this.isTransactionInBudgetPeriod(t, budget)),
		);

		if (relevantTransactions.length === 0) {
			return; // No relevant transactions
		}

		// Trigger budget progress recalculation for affected budgets
		// The repository's calculateBudgetProgress method will handle the actual calculation
		for (const budget of activeBudgets) {
			try {
				await this.repository.calculateBudgetProgress(budget.id);
			} catch (error) {
				console.error(`Error recalculating progress for budget ${budget.id}:`, error);
			}
		}
	}

	/**
	 * Process category-specific transaction changes
	 */
	private async processCategoryChanges(
		categoryId: string,
		changes: TransactionChange[],
	): Promise<void> {
		// Extract all transactions from changes
		const allTransactions: Transaction[] = [];

		for (const change of changes) {
			if (change.newTransaction) {
				allTransactions.push(change.newTransaction);
			}
			if (change.oldTransaction && change.type === 'deleted') {
				allTransactions.push(change.oldTransaction);
			}
		}

		await this.updateBudgetsForCategory(categoryId, allTransactions, 'updated');
	}

	/**
	 * Check if transaction falls within budget period
	 */
	private isTransactionInBudgetPeriod(transaction: Transaction, budget: Budget): boolean {
		const transactionDate = new Date(transaction.date);
		const now = new Date();

		// Handle indefinite budgets (end date in far future)
		const isIndefinite = budget.endDate.getFullYear() >= 9999;

		if (isIndefinite) {
			if (budget.period === 'monthly') {
				// Check if transaction is in current month
				const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
				const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
				return transactionDate >= currentMonthStart && transactionDate <= currentMonthEnd;
			} else {
				// Check if transaction is in current year
				const currentYearStart = new Date(now.getFullYear(), 0, 1);
				const currentYearEnd = new Date(now.getFullYear(), 11, 31);
				return transactionDate >= currentYearStart && transactionDate <= currentYearEnd;
			}
		}

		// Regular budget with defined period
		return transactionDate >= budget.startDate && transactionDate <= budget.endDate;
	}

	/**
	 * Check for threshold alerts based on budget progress
	 */
	private async checkThresholdAlerts(
		budget: Budget,
		progress: BudgetProgress,
	): Promise<BudgetAlert[]> {
		const alerts: BudgetAlert[] = [];

		try {
			// Get existing threshold alerts for this budget
			const existingAlerts = await this.repository.findBudgetAlerts(budget.id);
			const existingThresholds = new Set(
				existingAlerts
					.filter((a) => a.alertType === 'threshold' && !a.isRead)
					.map((a) => a.thresholdPercentage)
					.filter(Boolean),
			);

			// Check each threshold
			for (const threshold of budget.alertThresholds) {
				if (progress.percentageSpent >= threshold && !existingThresholds.has(threshold)) {
					const alert = await this.repository.createBudgetAlert({
						budgetId: budget.id,
						alertType: 'threshold',
						thresholdPercentage: threshold,
						message: `Budget alert: ${threshold}% of ${budget.name} budget reached (${progress.percentageSpent.toFixed(1)}%)`,
						isRead: false,
					});
					alerts.push(alert);
				}
			}

			// Check for projection alerts (budget will be exceeded)
			if (progress.projectedSpent > budget.amount && progress.status !== 'over-budget') {
				const projectionAlerts = existingAlerts.filter(
					(a) => a.alertType === 'projection' && !a.isRead,
				);
				if (projectionAlerts.length === 0) {
					const alert = await this.repository.createBudgetAlert({
						budgetId: budget.id,
						alertType: 'projection',
						message: `Budget projection alert: ${budget.name} is projected to exceed budget by ${(progress.projectedSpent - budget.amount).toFixed(2)} ${budget.currency}`,
						isRead: false,
					});
					alerts.push(alert);
				}
			}
		} catch (error) {
			console.error('Error checking threshold alerts:', error);
		}

		return alerts;
	}

	/**
	 * Check for significant impacts across multiple transactions
	 */
	private async checkBulkTransactionImpacts(transactions: Transaction[]): Promise<void> {
		// Group by category and check cumulative impact
		const categoryTotals = new Map<string, number>();

		for (const transaction of transactions) {
			if (transaction.type === 'expense' && transaction.categoryId) {
				const current = categoryTotals.get(transaction.categoryId) || 0;
				categoryTotals.set(transaction.categoryId, current + Math.abs(transaction.amount));
			}
		}

		// Check each category's total impact
		for (const [categoryId, totalAmount] of categoryTotals) {
			const budgets = await this.repository.findBudgetsByCategory(categoryId);
			const activeBudgets = budgets.filter((b) => b.isActive);

			for (const budget of activeBudgets) {
				const impactPercentage = totalAmount / budget.amount;
				if (impactPercentage > 0.15) {
					// 15% threshold for bulk imports
					await this.repository.createBudgetAlert({
						budgetId: budget.id,
						alertType: 'bulk_import',
						message: `Bulk transaction import significantly impacted ${budget.name} budget: ${totalAmount.toFixed(2)} ${budget.currency} (${(impactPercentage * 100).toFixed(1)}%)`,
						isRead: false,
					});
				}
			}
		}
	}
}
