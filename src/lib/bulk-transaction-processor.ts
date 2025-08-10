/**
 * Bulk Transaction Processing Utilities
 * Optimized processing for large transaction operations with budget integration
 */

import type { Transaction, TransactionRepository } from './types';
import {
	BudgetTransactionIntegrationService,
	type TransactionChange,
} from './budget-transaction-integration';

export interface BulkProcessingOptions {
	batchSize?: number;
	enableBudgetUpdates?: boolean;
	enableProgressReporting?: boolean;
}

export interface BulkProcessingResult {
	totalProcessed: number;
	successful: number;
	failed: number;
	budgetUpdatesCompleted: boolean;
	errors: Array<{ index: number; error: string }>;
}

export interface BulkUpdateOperation {
	transactionId: string;
	updates: Partial<Omit<Transaction, 'id'>>;
}

export class BulkTransactionProcessor {
	private budgetIntegration: BudgetTransactionIntegrationService;

	constructor(private repository: TransactionRepository) {
		this.budgetIntegration = new BudgetTransactionIntegrationService(repository);
	}

	/**
	 * Process bulk transaction updates with optimized budget recalculation
	 */
	async processBulkUpdates(
		operations: BulkUpdateOperation[],
		options: BulkProcessingOptions = {},
	): Promise<BulkProcessingResult> {
		const {
			batchSize = 50,
			enableBudgetUpdates = true,
			enableProgressReporting = false,
		} = options;

		const result: BulkProcessingResult = {
			totalProcessed: 0,
			successful: 0,
			failed: 0,
			budgetUpdatesCompleted: false,
			errors: [],
		};

		const transactionChanges: TransactionChange[] = [];

		// Process operations in batches
		for (let i = 0; i < operations.length; i += batchSize) {
			const batch = operations.slice(i, i + batchSize);

			if (enableProgressReporting) {
				console.log(
					`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(operations.length / batchSize)}`,
				);
			}

			for (const operation of batch) {
				try {
					// Get original transaction
					const originalTransaction = await this.repository.findById(
						operation.transactionId,
					);
					if (!originalTransaction) {
						result.errors.push({
							index: result.totalProcessed,
							error: `Transaction not found: ${operation.transactionId}`,
						});
						result.failed++;
						result.totalProcessed++;
						continue;
					}

					// Update transaction
					const updatedTransaction = await this.repository.update(
						operation.transactionId,
						operation.updates,
					);

					if (updatedTransaction) {
						result.successful++;

						// Track changes for budget updates
						if (enableBudgetUpdates) {
							transactionChanges.push({
								type: 'updated',
								transactionId: operation.transactionId,
								oldTransaction: originalTransaction,
								newTransaction: updatedTransaction,
							});
						}
					} else {
						result.errors.push({
							index: result.totalProcessed,
							error: `Failed to update transaction: ${operation.transactionId}`,
						});
						result.failed++;
					}
				} catch (error) {
					result.errors.push({
						index: result.totalProcessed,
						error: error instanceof Error ? error.message : 'Unknown error',
					});
					result.failed++;
				}

				result.totalProcessed++;
			}
		}

		// Process budget updates in bulk
		if (enableBudgetUpdates && transactionChanges.length > 0) {
			try {
				await this.budgetIntegration.onBulkTransactionChanges(transactionChanges);
				result.budgetUpdatesCompleted = true;
			} catch (budgetError) {
				console.error('Error processing bulk budget updates:', budgetError);
				result.budgetUpdatesCompleted = false;
			}
		}

		return result;
	}

	/**
	 * Process bulk transaction deletions with budget updates
	 */
	async processBulkDeletions(
		transactionIds: string[],
		options: BulkProcessingOptions = {},
	): Promise<BulkProcessingResult> {
		const {
			batchSize = 50,
			enableBudgetUpdates = true,
			enableProgressReporting = false,
		} = options;

		const result: BulkProcessingResult = {
			totalProcessed: 0,
			successful: 0,
			failed: 0,
			budgetUpdatesCompleted: false,
			errors: [],
		};

		const transactionChanges: TransactionChange[] = [];

		// Process deletions in batches
		for (let i = 0; i < transactionIds.length; i += batchSize) {
			const batch = transactionIds.slice(i, i + batchSize);

			if (enableProgressReporting) {
				console.log(
					`Processing deletion batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(transactionIds.length / batchSize)}`,
				);
			}

			for (const transactionId of batch) {
				try {
					// Get transaction before deleting
					const transactionToDelete = await this.repository.findById(transactionId);
					if (!transactionToDelete) {
						result.errors.push({
							index: result.totalProcessed,
							error: `Transaction not found: ${transactionId}`,
						});
						result.failed++;
						result.totalProcessed++;
						continue;
					}

					// Delete transaction
					const deleted = await this.repository.delete(transactionId);

					if (deleted) {
						result.successful++;

						// Track changes for budget updates
						if (enableBudgetUpdates) {
							transactionChanges.push({
								type: 'deleted',
								transactionId,
								oldTransaction: transactionToDelete,
							});
						}
					} else {
						result.errors.push({
							index: result.totalProcessed,
							error: `Failed to delete transaction: ${transactionId}`,
						});
						result.failed++;
					}
				} catch (error) {
					result.errors.push({
						index: result.totalProcessed,
						error: error instanceof Error ? error.message : 'Unknown error',
					});
					result.failed++;
				}

				result.totalProcessed++;
			}
		}

		// Process budget updates in bulk
		if (enableBudgetUpdates && transactionChanges.length > 0) {
			try {
				await this.budgetIntegration.onBulkTransactionChanges(transactionChanges);
				result.budgetUpdatesCompleted = true;
			} catch (budgetError) {
				console.error('Error processing bulk budget updates:', budgetError);
				result.budgetUpdatesCompleted = false;
			}
		}

		return result;
	}

	/**
	 * Optimize budget calculations by grouping by category and period
	 */
	async optimizeBudgetCalculations(categoryIds?: string[]): Promise<void> {
		try {
			// Get all active budgets or filter by categories
			let budgets;
			if (categoryIds && categoryIds.length > 0) {
				budgets = [];
				for (const categoryId of categoryIds) {
					const categoryBudgets = await this.repository.findBudgetsByCategory(categoryId);
					budgets.push(...categoryBudgets.filter((b) => b.isActive));
				}
			} else {
				budgets = await this.repository.findActiveBudgets();
			}

			// Group budgets by category for efficient processing
			const budgetsByCategory = new Map<string, typeof budgets>();
			for (const budget of budgets) {
				if (!budgetsByCategory.has(budget.categoryId)) {
					budgetsByCategory.set(budget.categoryId, []);
				}
				budgetsByCategory.get(budget.categoryId)!.push(budget);
			}

			// Process each category's budgets
			for (const [categoryId, categoryBudgets] of budgetsByCategory) {
				try {
					// Recalculate progress for all budgets in this category
					await Promise.all(
						categoryBudgets.map((budget) =>
							this.repository.calculateBudgetProgress(budget.id),
						),
					);
				} catch (error) {
					console.error(
						`Error optimizing budget calculations for category ${categoryId}:`,
						error,
					);
				}
			}
		} catch (error) {
			console.error('Error optimizing budget calculations:', error);
			throw error;
		}
	}

	/**
	 * Create transaction flagging for budget impact notifications
	 */
	async flagTransactionsForBudgetImpact(
		transactions: Transaction[],
		impactThreshold: number = 0.1, // 10% of budget
	): Promise<
		Array<{ transaction: Transaction; impactedBudgets: string[]; impactPercentage: number }>
	> {
		const flaggedTransactions: Array<{
			transaction: Transaction;
			impactedBudgets: string[];
			impactPercentage: number;
		}> = [];

		for (const transaction of transactions) {
			if (transaction.type !== 'expense' || !transaction.categoryId) {
				continue;
			}

			try {
				// Find budgets for this category
				const budgets = await this.repository.findBudgetsByCategory(transaction.categoryId);
				const activeBudgets = budgets.filter((b) => b.isActive);

				const impactedBudgets: string[] = [];
				let maxImpactPercentage = 0;

				for (const budget of activeBudgets) {
					// Check if transaction is within budget period
					if (this.isTransactionInBudgetPeriod(transaction, budget)) {
						const impactPercentage = Math.abs(transaction.amount) / budget.amount;

						if (impactPercentage >= impactThreshold) {
							impactedBudgets.push(budget.id);
							maxImpactPercentage = Math.max(maxImpactPercentage, impactPercentage);
						}
					}
				}

				if (impactedBudgets.length > 0) {
					flaggedTransactions.push({
						transaction,
						impactedBudgets,
						impactPercentage: maxImpactPercentage,
					});
				}
			} catch (error) {
				console.error(
					`Error flagging transaction ${transaction.id} for budget impact:`,
					error,
				);
			}
		}

		return flaggedTransactions;
	}

	// ===== PRIVATE HELPER METHODS =====

	/**
	 * Check if transaction falls within budget period
	 */
	private isTransactionInBudgetPeriod(transaction: Transaction, budget: any): boolean {
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
}
