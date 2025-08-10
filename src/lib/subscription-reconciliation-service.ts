/**
 * Service for reconciling subscriptions with actual transactions
 * Updates subscription payment dates based on matching transactions
 */

import type { Transaction, Subscription, SubscriptionPattern } from './types';
import type { TransactionRepository } from './database/repository';

export class SubscriptionReconciliationService {
	constructor(private repository: TransactionRepository) {}

	/**
	 * Reconcile all active subscriptions with their matching transactions
	 * Updates nextPaymentDate based on the most recent matching transaction
	 */
	async reconcileAllSubscriptions(): Promise<{
		updated: number;
		errors: string[];
	}> {
		const activeSubscriptions = await this.repository.findActiveSubscriptions();
		let updated = 0;
		const errors: string[] = [];

		for (const subscription of activeSubscriptions) {
			try {
				const wasUpdated = await this.reconcileSubscription(subscription);
				if (wasUpdated) updated++;
			} catch (error) {
				errors.push(`Failed to reconcile ${subscription.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		}

		return { updated, errors };
	}

	/**
	 * Reconcile a single subscription with its matching transactions
	 */
	async reconcileSubscription(subscription: Subscription): Promise<boolean> {
		// Get all patterns for this subscription
		const patterns = await this.repository.findPatternsBySubscription(subscription.id);
		
		if (patterns.length === 0) {
			// No patterns exist - create a basic pattern from the subscription name
			await this.createBasicPattern(subscription);
			return false;
		}

		// Find transactions that match any of the subscription patterns
		const matchingTransactions = await this.findMatchingTransactions(patterns);
		
		if (matchingTransactions.length === 0) {
			return false; // No matching transactions found
		}

		// Find the most recent matching transaction
		const mostRecentTransaction = matchingTransactions
			.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

		// Calculate the next payment date based on billing frequency
		const nextPaymentDate = this.calculateNextPaymentDate(
			new Date(mostRecentTransaction.date),
			subscription.billingFrequency,
			subscription.customFrequencyDays
		);

		// Update the subscription's next payment date if it's different
		if (nextPaymentDate.getTime() !== new Date(subscription.nextPaymentDate).getTime()) {
			await this.repository.updateSubscription(subscription.id, {
				nextPaymentDate: nextPaymentDate
			});

			// Flag the matching transaction as belonging to this subscription
			await this.repository.flagTransactionAsSubscription(
				mostRecentTransaction.id,
				subscription.id
			);

			return true;
		}

		return false;
	}

	/**
	 * Create a basic pattern for a subscription that doesn't have any patterns
	 */
	private async createBasicPattern(subscription: Subscription): Promise<void> {
		// Create a basic pattern based on the subscription name
		await this.repository.createSubscriptionPattern({
			subscriptionId: subscription.id,
			pattern: subscription.name.toLowerCase(),
			patternType: 'contains',
			confidenceScore: 0.8,
			createdBy: 'system',
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}

	/**
	 * Find transactions that match subscription patterns
	 */
	private async findMatchingTransactions(patterns: SubscriptionPattern[]): Promise<Transaction[]> {
		const allTransactions: Transaction[] = [];
		
		// Get recent transactions (last 6 months) to search through
		const sixMonthsAgo = new Date();
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
		const recentTransactions = await this.repository.findByDateRange(sixMonthsAgo, new Date());
		
		// Filter transactions that match any pattern
		for (const transaction of recentTransactions) {
			// Skip if not an expense
			if (transaction.type !== 'expense') continue;
			
			for (const pattern of patterns) {
				if (this.transactionMatchesPattern(transaction, pattern)) {
					allTransactions.push(transaction);
					break; // Don't add the same transaction multiple times
				}
			}
		}

		return allTransactions;
	}

	/**
	 * Check if a transaction matches a subscription pattern
	 */
	private transactionMatchesPattern(transaction: Transaction, pattern: SubscriptionPattern): boolean {
		const transactionDesc = this.normalizeString(transaction.description);
		const patternText = this.normalizeString(pattern.pattern);

		switch (pattern.patternType) {
			case 'exact':
				return transactionDesc === patternText;
			case 'contains':
				return transactionDesc.includes(patternText) || this.fuzzyContains(transactionDesc, patternText);
			case 'starts_with':
				return transactionDesc.startsWith(patternText);
			default:
				return false;
		}
	}

	/**
	 * Normalize strings for better matching
	 */
	private normalizeString(str: string): string {
		return str
			.toLowerCase()
			.replace(/[^\w]/g, '') // Remove all non-alphanumeric characters
			.trim();
	}

	/**
	 * Check if pattern fuzzy matches within transaction description
	 * Handles cases like "help.max.com" matching "help.hbomax.com"
	 */
	private fuzzyContains(transaction: string, pattern: string): boolean {
		// Split both into words and check for significant overlap
		const transactionWords = transaction.split(/\W+/).filter(w => w.length > 2);
		const patternWords = pattern.split(/\W+/).filter(w => w.length > 2);
		
		if (patternWords.length === 0) return false;
		
		// Count how many pattern words are found in transaction
		const matchedWords = patternWords.filter(patternWord => 
			transactionWords.some(transactionWord => 
				transactionWord.includes(patternWord) || 
				patternWord.includes(transactionWord) ||
				this.levenshteinDistance(transactionWord, patternWord) <= 2
			)
		);
		
		// Consider it a match if more than 60% of pattern words match
		return (matchedWords.length / patternWords.length) > 0.6;
	}

	/**
	 * Calculate Levenshtein distance between two strings
	 */
	private levenshteinDistance(str1: string, str2: string): number {
		const matrix = [];
		
		for (let i = 0; i <= str2.length; i++) {
			matrix[i] = [i];
		}
		
		for (let j = 0; j <= str1.length; j++) {
			matrix[0][j] = j;
		}
		
		for (let i = 1; i <= str2.length; i++) {
			for (let j = 1; j <= str1.length; j++) {
				if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
					matrix[i][j] = matrix[i - 1][j - 1];
				} else {
					matrix[i][j] = Math.min(
						matrix[i - 1][j - 1] + 1,
						matrix[i][j - 1] + 1,
						matrix[i - 1][j] + 1
					);
				}
			}
		}
		
		return matrix[str2.length][str1.length];
	}

	/**
	 * Calculate the next payment date based on the last payment and billing frequency
	 */
	private calculateNextPaymentDate(
		lastPaymentDate: Date,
		billingFrequency: string,
		customFrequencyDays?: number
	): Date {
		const nextDate = new Date(lastPaymentDate);

		switch (billingFrequency) {
			case 'monthly':
				nextDate.setMonth(nextDate.getMonth() + 1);
				break;
			case 'quarterly':
				nextDate.setMonth(nextDate.getMonth() + 3);
				break;
			case 'annually':
				nextDate.setFullYear(nextDate.getFullYear() + 1);
				break;
			case 'custom':
				if (customFrequencyDays) {
					nextDate.setDate(nextDate.getDate() + customFrequencyDays);
				} else {
					// Default to monthly if custom days not specified
					nextDate.setMonth(nextDate.getMonth() + 1);
				}
				break;
			default:
				// Default to monthly
				nextDate.setMonth(nextDate.getMonth() + 1);
		}

		return nextDate;
	}

	/**
	 * Reconcile a specific subscription by name (useful for manual fixes)
	 */
	async reconcileSubscriptionByName(name: string): Promise<boolean> {
		const subscriptions = await this.repository.findAllSubscriptions();
		const subscription = subscriptions.find(sub => 
			sub.name.toLowerCase().includes(name.toLowerCase()) || 
			name.toLowerCase().includes(sub.name.toLowerCase())
		);

		if (!subscription) {
			throw new Error(`Subscription not found: ${name}`);
		}

		return this.reconcileSubscription(subscription);
	}
}

/**
 * Create a new subscription reconciliation service instance
 */
export function createSubscriptionReconciliationService(
	repository: TransactionRepository
): SubscriptionReconciliationService {
	return new SubscriptionReconciliationService(repository);
}