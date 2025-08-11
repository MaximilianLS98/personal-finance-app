/**
 * High-level subscription service that integrates pattern detection with repository operations
 * Provides business logic for subscription management and detection
 */

import type {
	Transaction,
	Subscription,
	SubscriptionPattern,
	TransactionWithSubscription,
} from './types';
import type { TransactionRepository } from './database/repository';
import {
	SubscriptionPatternEngine,
	type SubscriptionCandidate,
	type SubscriptionMatch,
} from './subscription-pattern-engine';

/**
 * Subscription creation request
 */
export interface CreateSubscriptionRequest {
	name: string;
	description?: string;
	amount: number;
	currency: string;
	billingFrequency: 'monthly' | 'quarterly' | 'annually' | 'custom';
	customFrequencyDays?: number;
	nextPaymentDate: Date;
	categoryId: string;
	startDate: Date;
	notes?: string;
	website?: string;
	cancellationUrl?: string;
	/** Transaction IDs to flag as part of this subscription */
	transactionIds?: string[];
}

/**
 * Subscription detection result
 */
export interface SubscriptionDetectionResult {
	/** Detected subscription candidates */
	candidates: SubscriptionCandidate[];
	/** Existing subscription matches */
	matches: SubscriptionMatch[];
	/** Total transactions analyzed */
	totalTransactions: number;
	/** Transactions already flagged as subscriptions */
	alreadyFlagged: number;
}

/**
 * Subscription confirmation request
 */
export interface ConfirmSubscriptionRequest {
	/** Subscription candidate to confirm */
	candidate: SubscriptionCandidate;
	/** Optional overrides for the subscription */
	overrides?: Partial<CreateSubscriptionRequest>;
}

/**
 * High-level subscription service
 */
export class SubscriptionService {
	private patternEngine: SubscriptionPatternEngine;

	constructor(private repository: TransactionRepository) {
		this.patternEngine = new SubscriptionPatternEngine(repository);
	}

	// ===== SUBSCRIPTION CRUD OPERATIONS =====

	/**
	 * Create a new subscription with automatic pattern generation
	 */
	async createSubscription(request: CreateSubscriptionRequest): Promise<Subscription> {
		// Create the subscription
		const subscription = await this.repository.createSubscription({
			name: request.name,
			description: request.description,
			amount: request.amount,
			currency: request.currency,
			billingFrequency: request.billingFrequency,
			customFrequencyDays: request.customFrequencyDays,
			nextPaymentDate: request.nextPaymentDate,
			categoryId: request.categoryId,
			isActive: true,
			startDate: request.startDate,
			notes: request.notes,
			website: request.website,
			cancellationUrl: request.cancellationUrl,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		// Flag associated transactions if provided
		if (request.transactionIds && request.transactionIds.length > 0) {
			await this.flagTransactionsAsSubscription(subscription.id, request.transactionIds);

			// Generate patterns based on flagged transactions
			const transactions = await Promise.all(
				request.transactionIds.map((id) => this.repository.findById(id)),
			);
			const validTransactions = transactions.filter((t) => t !== null) as Transaction[];

			if (validTransactions.length > 0) {
				await this.patternEngine.createPatternsForSubscription(
					subscription.id,
					validTransactions,
				);
			}
		}

		return subscription;
	}

	/**
	 * Get all subscriptions
	 */
	async getAllSubscriptions(): Promise<Subscription[]> {
		return this.repository.findAllSubscriptions();
	}

	/**
	 * Get subscription by ID
	 */
	async getSubscriptionById(id: string): Promise<Subscription | null> {
		return this.repository.findSubscriptionById(id);
	}

	/**
	 * Update subscription
	 */
	async updateSubscription(
		id: string,
		updates: Partial<Omit<Subscription, 'id'>>,
	): Promise<Subscription | null> {
		return this.repository.updateSubscription(id, updates);
	}

	/**
	 * Delete subscription and unflag associated transactions
	 */
	async deleteSubscription(id: string): Promise<boolean> {
		// First unflag all associated transactions
		const transactions = await this.repository.findSubscriptionTransactions(id);
		for (const transaction of transactions) {
			await this.repository.unflagTransactionAsSubscription(transaction.id);
		}

		// Delete subscription patterns
		const patterns = await this.repository.findPatternsBySubscription(id);
		for (const pattern of patterns) {
			await this.repository.deleteSubscriptionPattern(pattern.id);
		}

		// Delete the subscription
		return this.repository.deleteSubscription(id);
	}

	// ===== SUBSCRIPTION DETECTION =====

	/**
	 * Detect subscriptions from transactions
	 */
	async detectSubscriptions(transactions: Transaction[]): Promise<SubscriptionDetectionResult> {
		// Filter out transactions already flagged as subscriptions
		const unflaggedTransactions = transactions.filter(
			(t) => !(t as TransactionWithSubscription).isSubscription,
		);

		// Detect new subscription candidates
		const candidates = await this.patternEngine.detectSubscriptions(unflaggedTransactions);

		// Match against existing subscriptions
		const matches = await this.patternEngine.matchExistingSubscriptions(unflaggedTransactions);

		return {
			candidates,
			matches,
			totalTransactions: transactions.length,
			alreadyFlagged: transactions.length - unflaggedTransactions.length,
		};
	}

	/**
	 * Confirm a subscription candidate and create the subscription
	 */
	async confirmSubscription(request: ConfirmSubscriptionRequest): Promise<Subscription> {
		const { candidate, overrides = {} } = request;

		// Calculate next payment date based on the most recent transaction
		const latestTransaction = candidate.matchingTransactions
			.map((t) => ({
				...t,
				date: t.date instanceof Date ? t.date : new Date(t.date as unknown as string),
			}))
			.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

		const nextPaymentDate = new Date(latestTransaction.date);

		// Add billing frequency to get next payment
		switch (candidate.billingFrequency) {
			case 'monthly':
				nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
				break;
			case 'quarterly':
				nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 3);
				break;
			case 'annually':
				nextPaymentDate.setFullYear(nextPaymentDate.getFullYear() + 1);
				break;
		}

		// Create subscription request
		const subscriptionRequest: CreateSubscriptionRequest = {
			name: overrides.name || candidate.name,
			description: overrides.description,
			amount: overrides.amount || candidate.amount,
			currency: overrides.currency || candidate.currency,
			billingFrequency: overrides.billingFrequency || candidate.billingFrequency,
			customFrequencyDays: overrides.customFrequencyDays,
			nextPaymentDate: overrides.nextPaymentDate || nextPaymentDate,
			categoryId:
				overrides.categoryId || candidate.categoryId || (await this.getDefaultCategoryId()),
			startDate: overrides.startDate || candidate.matchingTransactions[0].date,
			notes: overrides.notes,
			website: overrides.website,
			cancellationUrl: overrides.cancellationUrl,
			transactionIds: candidate.matchingTransactions.map((t) => t.id),
		};

		return this.createSubscription(subscriptionRequest);
	}

	/**
	 * Confirm subscription matches and flag transactions
	 */
	async confirmSubscriptionMatches(matches: SubscriptionMatch[]): Promise<void> {
		for (const match of matches) {
			await this.repository.flagTransactionAsSubscription(
				match.transaction.id,
				match.subscription.id,
			);

			// Update pattern confidence based on successful match
			await this.patternEngine.updatePatternConfidence(match.pattern.id, true);
		}
	}

	// ===== SUBSCRIPTION QUERIES =====

	/**
	 * Get active subscriptions
	 */
	async getActiveSubscriptions(): Promise<Subscription[]> {
		return this.repository.findActiveSubscriptions();
	}

	/**
	 * Get upcoming payments within specified days
	 */
	async getUpcomingPayments(days: number = 30): Promise<Subscription[]> {
		return this.repository.findUpcomingPayments(days);
	}

	/**
	 * Calculate total monthly subscription cost
	 */
	async getTotalMonthlyCost(): Promise<number> {
		return this.repository.calculateTotalMonthlyCost();
	}

	/**
	 * Get potentially unused subscriptions
	 */
	async getUnusedSubscriptions(daysSinceLastUse: number = 90): Promise<Subscription[]> {
		return this.repository.findUnusedSubscriptions(daysSinceLastUse);
	}

	/**
	 * Get subscriptions by category
	 */
	async getSubscriptionsByCategory(categoryId: string): Promise<Subscription[]> {
		return this.repository.findSubscriptionsByCategory(categoryId);
	}

	/**
	 * Get subscription transactions
	 */
	async getSubscriptionTransactions(
		subscriptionId: string,
	): Promise<TransactionWithSubscription[]> {
		return this.repository.findSubscriptionTransactions(subscriptionId);
	}

	// ===== PATTERN MANAGEMENT =====

	/**
	 * Get patterns for a subscription
	 */
	async getSubscriptionPatterns(subscriptionId: string): Promise<SubscriptionPattern[]> {
		return this.repository.findPatternsBySubscription(subscriptionId);
	}

	/**
	 * Add pattern to subscription
	 */
	async addSubscriptionPattern(
		subscriptionId: string,
		pattern: string,
		patternType: SubscriptionPattern['patternType'],
		confidence: number = 1.0,
	): Promise<SubscriptionPattern> {
		return this.repository.createSubscriptionPattern({
			subscriptionId,
			pattern,
			patternType,
			confidenceScore: confidence,
			createdBy: 'user',
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	}

	/**
	 * Delete subscription pattern
	 */
	async deleteSubscriptionPattern(patternId: string): Promise<boolean> {
		return this.repository.deleteSubscriptionPattern(patternId);
	}

	/**
	 * Update pattern confidence based on user feedback
	 */
	async updatePatternConfidence(patternId: string, wasCorrect: boolean): Promise<void> {
		await this.patternEngine.updatePatternConfidence(patternId, wasCorrect);
	}

	// ===== TRANSACTION FLAGGING =====

	/**
	 * Flag transactions as part of a subscription
	 */
	async flagTransactionsAsSubscription(
		subscriptionId: string,
		transactionIds: string[],
	): Promise<void> {
		for (const transactionId of transactionIds) {
			await this.repository.flagTransactionAsSubscription(transactionId, subscriptionId);
		}
	}

	/**
	 * Unflag transactions from subscription
	 */
	async unflagTransactionsFromSubscription(transactionIds: string[]): Promise<void> {
		for (const transactionId of transactionIds) {
			await this.repository.unflagTransactionAsSubscription(transactionId);
		}
	}

	// ===== PRIVATE HELPER METHODS =====

	/**
	 * Get default category ID for uncategorized subscriptions
	 */
	private async getDefaultCategoryId(): Promise<string> {
		const categories = await this.repository.getCategories();

		// Look for a "Subscriptions" category
		const subscriptionCategory = categories.find(
			(c) =>
				c.name.toLowerCase().includes('subscription') ||
				c.name.toLowerCase().includes('recurring'),
		);

		if (subscriptionCategory) {
			return subscriptionCategory.id;
		}

		// Look for "Other" or "Miscellaneous" category
		const otherCategory = categories.find(
			(c) => c.name.toLowerCase().includes('other') || c.name.toLowerCase().includes('misc'),
		);

		if (otherCategory) {
			return otherCategory.id;
		}

		// Return first available category
		return categories[0]?.id || '';
	}
}

/**
 * Create a new subscription service instance
 */
export function createSubscriptionService(repository: TransactionRepository): SubscriptionService {
	return new SubscriptionService(repository);
}
