import { currencyCode } from '../../money';
import { monthlySubscriptionCost } from '../../subscription-costs';
import type { Subscription, SubscriptionPattern, TransactionWithSubscription } from '../../types';
import { DatabaseConnectionError } from '../connection';
import type { RepositoryContext } from '../repository-context';
import { DatabaseErrorType } from '../types';

export class SubscriptionsRepository {
	constructor(private readonly context: RepositoryContext) {}

	// ===== SUBSCRIPTION CRUD OPERATIONS =====

	/**
	 * Create a new subscription
	 */
	async createSubscription(
		subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>,
	): Promise<Subscription> {
		try {
			const db = this.context.connection();
			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			const stmt = db.prepare(`
				INSERT INTO subscriptions (
					id, name, description, amount, currency, billing_frequency,
					custom_frequency_days, next_payment_date, category_id, is_active,
					start_date, end_date, notes, website, cancellation_url,
					last_used_date, usage_rating, created_at, updated_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);

			stmt.run(
				id,
				subscription.name,
				subscription.description || null,
				subscription.amount,
				subscription.currency,
				subscription.billingFrequency,
				subscription.customFrequencyDays || null,
				subscription.nextPaymentDate.toISOString(),
				subscription.categoryId,
				subscription.isActive ? 1 : 0,
				subscription.startDate.toISOString(),
				subscription.endDate?.toISOString() || null,
				subscription.notes || null,
				subscription.website || null,
				subscription.cancellationUrl || null,
				subscription.lastUsedDate?.toISOString() || null,
				subscription.usageRating || null,
				now,
				now,
			);

			return {
				id,
				...subscription,
				createdAt: new Date(now),
				updatedAt: new Date(now),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to create subscription: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'INSERT INTO subscriptions',
			);
		}
	}

	/**
	 * Find all subscriptions
	 */
	async findAllSubscriptions(): Promise<Subscription[]> {
		try {
			const db = this.context.connection();
			const stmt = db.prepare(`
				SELECT id, name, description, amount, currency, billing_frequency,
				       custom_frequency_days, next_payment_date, category_id, is_active,
				       start_date, end_date, notes, website, cancellation_url,
				       last_used_date, usage_rating, created_at, updated_at
				FROM subscriptions
				ORDER BY name
			`);

			const rows = stmt.all() as Array<{
				id: string;
				name: string;
				description: string | null;
				amount: number;
				currency: string;
				billing_frequency: string;
				custom_frequency_days: number | null;
				next_payment_date: string;
				category_id: string;
				is_active: number;
				start_date: string;
				end_date: string | null;
				notes: string | null;
				website: string | null;
				cancellation_url: string | null;
				last_used_date: string | null;
				usage_rating: number | null;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				amount: row.amount,
				currency: row.currency,
				billingFrequency: row.billing_frequency as Subscription['billingFrequency'],
				customFrequencyDays: row.custom_frequency_days || undefined,
				nextPaymentDate: new Date(row.next_payment_date),
				categoryId: row.category_id,
				isActive: row.is_active === 1,
				startDate: new Date(row.start_date),
				endDate: row.end_date ? new Date(row.end_date) : undefined,
				notes: row.notes || undefined,
				website: row.website || undefined,
				cancellationUrl: row.cancellation_url || undefined,
				lastUsedDate: row.last_used_date ? new Date(row.last_used_date) : undefined,
				usageRating: row.usage_rating || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch subscriptions: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM subscriptions',
			);
		}
	}

	/**
	 * Find subscription by ID
	 */
	async findSubscriptionById(id: string): Promise<Subscription | null> {
		try {
			const db = this.context.connection();
			const stmt = db.prepare(`
				SELECT id, name, description, amount, currency, billing_frequency,
				       custom_frequency_days, next_payment_date, category_id, is_active,
				       start_date, end_date, notes, website, cancellation_url,
				       last_used_date, usage_rating, created_at, updated_at
				FROM subscriptions
				WHERE id = ?
			`);

			const row = stmt.get(id) as {
				id: string;
				name: string;
				description: string | null;
				amount: number;
				currency: string;
				billing_frequency: string;
				custom_frequency_days: number | null;
				next_payment_date: string;
				category_id: string;
				is_active: number;
				start_date: string;
				end_date: string | null;
				notes: string | null;
				website: string | null;
				cancellation_url: string | null;
				last_used_date: string | null;
				usage_rating: number | null;
				created_at: string;
				updated_at: string;
			} | null;

			if (!row) {
				return null;
			}

			return {
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				amount: row.amount,
				currency: row.currency,
				billingFrequency: row.billing_frequency as Subscription['billingFrequency'],
				customFrequencyDays: row.custom_frequency_days || undefined,
				nextPaymentDate: new Date(row.next_payment_date),
				categoryId: row.category_id,
				isActive: row.is_active === 1,
				startDate: new Date(row.start_date),
				endDate: row.end_date ? new Date(row.end_date) : undefined,
				notes: row.notes || undefined,
				website: row.website || undefined,
				cancellationUrl: row.cancellation_url || undefined,
				lastUsedDate: row.last_used_date ? new Date(row.last_used_date) : undefined,
				usageRating: row.usage_rating || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch subscription by ID: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM subscriptions WHERE id = ?',
				[id],
			);
		}
	}

	/**
	 * Find subscriptions by category
	 */
	async findSubscriptionsByCategory(categoryId: string): Promise<Subscription[]> {
		try {
			const db = this.context.connection();
			const stmt = db.prepare(`
				SELECT id, name, description, amount, currency, billing_frequency,
				       custom_frequency_days, next_payment_date, category_id, is_active,
				       start_date, end_date, notes, website, cancellation_url,
				       last_used_date, usage_rating, created_at, updated_at
				FROM subscriptions
				WHERE category_id = ?
				ORDER BY name
			`);

			const rows = stmt.all(categoryId) as Array<{
				id: string;
				name: string;
				description: string | null;
				amount: number;
				currency: string;
				billing_frequency: string;
				custom_frequency_days: number | null;
				next_payment_date: string;
				category_id: string;
				is_active: number;
				start_date: string;
				end_date: string | null;
				notes: string | null;
				website: string | null;
				cancellation_url: string | null;
				last_used_date: string | null;
				usage_rating: number | null;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				amount: row.amount,
				currency: row.currency,
				billingFrequency: row.billing_frequency as Subscription['billingFrequency'],
				customFrequencyDays: row.custom_frequency_days || undefined,
				nextPaymentDate: new Date(row.next_payment_date),
				categoryId: row.category_id,
				isActive: row.is_active === 1,
				startDate: new Date(row.start_date),
				endDate: row.end_date ? new Date(row.end_date) : undefined,
				notes: row.notes || undefined,
				website: row.website || undefined,
				cancellationUrl: row.cancellation_url || undefined,
				lastUsedDate: row.last_used_date ? new Date(row.last_used_date) : undefined,
				usageRating: row.usage_rating || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch subscriptions by category: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM subscriptions WHERE category_id = ?',
				[categoryId],
			);
		}
	}

	/**
	 * Update an existing subscription
	 */
	async updateSubscription(
		id: string,
		updates: Partial<Omit<Subscription, 'id'>>,
	): Promise<Subscription | null> {
		try {
			const db = this.context.connection();

			// First check if subscription exists
			const existing = await this.findSubscriptionById(id);
			if (!existing) {
				return null;
			}

			// Build dynamic update query
			const updateFields = [];
			const params = [];

			if (updates.name !== undefined) {
				updateFields.push('name = ?');
				params.push(updates.name);
			}
			if (updates.description !== undefined) {
				updateFields.push('description = ?');
				params.push(updates.description);
			}
			if (updates.amount !== undefined) {
				updateFields.push('amount = ?');
				params.push(updates.amount);
			}
			if (updates.currency !== undefined) {
				updateFields.push('currency = ?');
				params.push(updates.currency);
			}
			if (updates.billingFrequency !== undefined) {
				updateFields.push('billing_frequency = ?');
				params.push(updates.billingFrequency);
			}
			if (updates.customFrequencyDays !== undefined) {
				updateFields.push('custom_frequency_days = ?');
				params.push(updates.customFrequencyDays);
			}
			if (updates.nextPaymentDate !== undefined) {
				updateFields.push('next_payment_date = ?');
				params.push(updates.nextPaymentDate.toISOString());
			}
			if (updates.categoryId !== undefined) {
				updateFields.push('category_id = ?');
				params.push(updates.categoryId);
			}
			if (updates.isActive !== undefined) {
				updateFields.push('is_active = ?');
				params.push(updates.isActive ? 1 : 0);
			}
			if (updates.startDate !== undefined) {
				updateFields.push('start_date = ?');
				params.push(updates.startDate.toISOString());
			}
			if (updates.endDate !== undefined) {
				updateFields.push('end_date = ?');
				params.push(updates.endDate?.toISOString() || null);
			}
			if (updates.notes !== undefined) {
				updateFields.push('notes = ?');
				params.push(updates.notes);
			}
			if (updates.website !== undefined) {
				updateFields.push('website = ?');
				params.push(updates.website);
			}
			if (updates.cancellationUrl !== undefined) {
				updateFields.push('cancellation_url = ?');
				params.push(updates.cancellationUrl);
			}
			if (updates.lastUsedDate !== undefined) {
				updateFields.push('last_used_date = ?');
				params.push(updates.lastUsedDate?.toISOString() || null);
			}
			if (updates.usageRating !== undefined) {
				updateFields.push('usage_rating = ?');
				params.push(updates.usageRating);
			}

			// Always update the updated_at timestamp
			updateFields.push('updated_at = ?');
			params.push(new Date().toISOString());

			// Add ID parameter for WHERE clause
			params.push(id);

			const stmt = db.prepare(`
				UPDATE subscriptions
				SET ${updateFields.join(', ')}
				WHERE id = ?
			`);

			stmt.run(...params);

			// Return the updated subscription
			return await this.findSubscriptionById(id);
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to update subscription: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'UPDATE subscriptions',
				[id, updates],
			);
		}
	}

	/**
	 * Delete a subscription by ID
	 * This will cascade delete related patterns and unflag related transactions
	 */
	async deleteSubscription(id: string): Promise<boolean> {
		try {
			const db = this.context.connection();

			// Start a transaction to ensure all operations succeed or fail together
			const transaction = db.transaction(() => {
				// 1. Delete subscription patterns
				const deletePatterns = db.prepare(
					'DELETE FROM subscription_patterns WHERE subscription_id = ?',
				);
				deletePatterns.run(id);

				// 2. Unflag transactions (set subscription_id to NULL and is_subscription to 0)
				const unflagTransactions = db.prepare(`
					UPDATE transactions
					SET is_subscription = 0, subscription_id = NULL, updated_at = ?
					WHERE subscription_id = ?
				`);
				unflagTransactions.run(new Date().toISOString(), id);

				// 3. Delete the subscription itself
				const deleteSubscription = db.prepare('DELETE FROM subscriptions WHERE id = ?');
				const result = deleteSubscription.run(id);

				return result.changes > 0;
			});

			// Execute the transaction
			return transaction();
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to delete subscription: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'DELETE CASCADE subscription and related data',
				[id],
			);
		}
	}

	// ===== SUBSCRIPTION-SPECIFIC QUERIES =====

	/**
	 * Find active subscriptions
	 */
	async findActiveSubscriptions(): Promise<Subscription[]> {
		try {
			const db = this.context.connection();
			const stmt = db.prepare(`
				SELECT id, name, description, amount, currency, billing_frequency,
				       custom_frequency_days, next_payment_date, category_id, is_active,
				       start_date, end_date, notes, website, cancellation_url,
				       last_used_date, usage_rating, created_at, updated_at
				FROM subscriptions
				WHERE is_active = 1
				ORDER BY next_payment_date ASC
			`);

			const rows = stmt.all() as Array<{
				id: string;
				name: string;
				description: string | null;
				amount: number;
				currency: string;
				billing_frequency: string;
				custom_frequency_days: number | null;
				next_payment_date: string;
				category_id: string;
				is_active: number;
				start_date: string;
				end_date: string | null;
				notes: string | null;
				website: string | null;
				cancellation_url: string | null;
				last_used_date: string | null;
				usage_rating: number | null;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				amount: row.amount,
				currency: row.currency,
				billingFrequency: row.billing_frequency as Subscription['billingFrequency'],
				customFrequencyDays: row.custom_frequency_days || undefined,
				nextPaymentDate: new Date(row.next_payment_date),
				categoryId: row.category_id,
				isActive: row.is_active === 1,
				startDate: new Date(row.start_date),
				endDate: row.end_date ? new Date(row.end_date) : undefined,
				notes: row.notes || undefined,
				website: row.website || undefined,
				cancellationUrl: row.cancellation_url || undefined,
				lastUsedDate: row.last_used_date ? new Date(row.last_used_date) : undefined,
				usageRating: row.usage_rating || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch active subscriptions: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM subscriptions WHERE is_active = 1',
			);
		}
	}

	/**
	 * Find subscriptions with upcoming payments within specified days
	 */
	async findUpcomingPayments(days: number): Promise<Subscription[]> {
		try {
			const db = this.context.connection();
			const futureDate = new Date();
			futureDate.setDate(futureDate.getDate() + days);

			const stmt = db.prepare(`
				SELECT id, name, description, amount, currency, billing_frequency,
				       custom_frequency_days, next_payment_date, category_id, is_active,
				       start_date, end_date, notes, website, cancellation_url,
				       last_used_date, usage_rating, created_at, updated_at
				FROM subscriptions
				WHERE is_active = 1 AND next_payment_date <= ?
				ORDER BY next_payment_date ASC
			`);

			const rows = stmt.all(futureDate.toISOString()) as Array<{
				id: string;
				name: string;
				description: string | null;
				amount: number;
				currency: string;
				billing_frequency: string;
				custom_frequency_days: number | null;
				next_payment_date: string;
				category_id: string;
				is_active: number;
				start_date: string;
				end_date: string | null;
				notes: string | null;
				website: string | null;
				cancellation_url: string | null;
				last_used_date: string | null;
				usage_rating: number | null;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				amount: row.amount,
				currency: row.currency,
				billingFrequency: row.billing_frequency as Subscription['billingFrequency'],
				customFrequencyDays: row.custom_frequency_days || undefined,
				nextPaymentDate: new Date(row.next_payment_date),
				categoryId: row.category_id,
				isActive: row.is_active === 1,
				startDate: new Date(row.start_date),
				endDate: row.end_date ? new Date(row.end_date) : undefined,
				notes: row.notes || undefined,
				website: row.website || undefined,
				cancellationUrl: row.cancellation_url || undefined,
				lastUsedDate: row.last_used_date ? new Date(row.last_used_date) : undefined,
				usageRating: row.usage_rating || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch upcoming payments: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM subscriptions WHERE next_payment_date <= ?',
				[days],
			);
		}
	}

	/**
	 * Calculate total monthly cost of all active subscriptions
	 */
	async calculateTotalMonthlyCost(): Promise<number> {
		const subscriptions = await this.findActiveSubscriptions();
		if (new Set(subscriptions.map((s) => currencyCode(s.currency))).size > 1)
			throw new Error('Subscription totals require a single currency');
		return subscriptions.reduce(
			(total, subscription) => total + monthlySubscriptionCost(subscription),
			0,
		);
	}

	/**
	 * Find subscriptions that haven't been used recently
	 */
	async findUnusedSubscriptions(daysSinceLastUse: number): Promise<Subscription[]> {
		try {
			const db = this.context.connection();
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastUse);

			const stmt = db.prepare(`
				SELECT id, name, description, amount, currency, billing_frequency,
				       custom_frequency_days, next_payment_date, category_id, is_active,
				       start_date, end_date, notes, website, cancellation_url,
				       last_used_date, usage_rating, created_at, updated_at
				FROM subscriptions
				WHERE is_active = 1
				  AND (last_used_date IS NOT NULL AND last_used_date < ?)
				ORDER BY amount DESC
			`);

			const rows = stmt.all(cutoffDate.toISOString()) as Array<{
				id: string;
				name: string;
				description: string | null;
				amount: number;
				currency: string;
				billing_frequency: string;
				custom_frequency_days: number | null;
				next_payment_date: string;
				category_id: string;
				is_active: number;
				start_date: string;
				end_date: string | null;
				notes: string | null;
				website: string | null;
				cancellation_url: string | null;
				last_used_date: string | null;
				usage_rating: number | null;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				amount: row.amount,
				currency: row.currency,
				billingFrequency: row.billing_frequency as Subscription['billingFrequency'],
				customFrequencyDays: row.custom_frequency_days || undefined,
				nextPaymentDate: new Date(row.next_payment_date),
				categoryId: row.category_id,
				isActive: row.is_active === 1,
				startDate: new Date(row.start_date),
				endDate: row.end_date ? new Date(row.end_date) : undefined,
				notes: row.notes || undefined,
				website: row.website || undefined,
				cancellationUrl: row.cancellation_url || undefined,
				lastUsedDate: row.last_used_date ? new Date(row.last_used_date) : undefined,
				usageRating: row.usage_rating || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch unused subscriptions: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM subscriptions (unused)',
				[daysSinceLastUse],
			);
		}
	}

	// ===== SUBSCRIPTION PATTERN MANAGEMENT =====

	/**
	 * Create a new subscription pattern
	 */
	async createSubscriptionPattern(
		pattern: Omit<SubscriptionPattern, 'id'>,
	): Promise<SubscriptionPattern> {
		try {
			const db = this.context.connection();
			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			const stmt = db.prepare(`
				INSERT INTO subscription_patterns (
					id, subscription_id, pattern, pattern_type, confidence_score,
					created_by, is_active, created_at, updated_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);

			stmt.run(
				id,
				pattern.subscriptionId,
				pattern.pattern,
				pattern.patternType,
				pattern.confidenceScore,
				pattern.createdBy,
				pattern.isActive ? 1 : 0,
				now,
				now,
			);

			return {
				id,
				...pattern,
				createdAt: new Date(now),
				updatedAt: new Date(now),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to create subscription pattern: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'INSERT INTO subscription_patterns',
			);
		}
	}

	/**
	 * Find patterns by subscription ID
	 */
	async findPatternsBySubscription(subscriptionId: string): Promise<SubscriptionPattern[]> {
		try {
			const db = this.context.connection();
			const stmt = db.prepare(`
				SELECT id, subscription_id, pattern, pattern_type, confidence_score,
				       created_by, is_active, created_at, updated_at
				FROM subscription_patterns
				WHERE subscription_id = ? AND is_active = 1
				ORDER BY confidence_score DESC
			`);

			const rows = stmt.all(subscriptionId) as Array<{
				id: string;
				subscription_id: string;
				pattern: string;
				pattern_type: string;
				confidence_score: number;
				created_by: string;
				is_active: number;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				subscriptionId: row.subscription_id,
				pattern: row.pattern,
				patternType: row.pattern_type as SubscriptionPattern['patternType'],
				confidenceScore: row.confidence_score,
				createdBy: row.created_by as 'user' | 'system',
				isActive: row.is_active === 1,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch subscription patterns: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM subscription_patterns WHERE subscription_id = ?',
				[subscriptionId],
			);
		}
	}

	/**
	 * Update pattern usage statistics and confidence
	 */
	async updatePatternUsage(patternId: string, wasCorrect: boolean): Promise<void> {
		try {
			const db = this.context.connection();

			// Get current pattern data
			const getStmt = db.prepare(`
				SELECT confidence_score
				FROM subscription_patterns
				WHERE id = ?
			`);

			const currentPattern = getStmt.get(patternId) as {
				confidence_score: number;
			} | null;

			if (!currentPattern) {
				return; // Pattern doesn't exist
			}

			// Calculate new confidence score using a learning algorithm
			let newConfidence = currentPattern.confidence_score;

			if (wasCorrect) {
				// Boost confidence, but with diminishing returns
				const boost = 0.1 * (1 - newConfidence); // Larger boost when confidence is lower
				newConfidence = Math.min(1.0, newConfidence + boost);
			} else {
				// Reduce confidence
				const penalty = 0.15; // Slightly larger penalty than boost to prevent false positives
				newConfidence = Math.max(0.1, newConfidence - penalty); // Minimum confidence of 0.1
			}

			// Update the pattern
			const updateStmt = db.prepare(`
				UPDATE subscription_patterns
				SET confidence_score = ?, updated_at = ?
				WHERE id = ?
			`);

			const now = new Date().toISOString();
			updateStmt.run(newConfidence, now, patternId);
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to update pattern usage: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'UPDATE subscription_patterns',
				[patternId, wasCorrect],
			);
		}
	}

	/**
	 * Delete a subscription pattern
	 */
	async deleteSubscriptionPattern(patternId: string): Promise<boolean> {
		try {
			const db = this.context.connection();

			const stmt = db.prepare('DELETE FROM subscription_patterns WHERE id = ?');
			const result = stmt.run(patternId);

			// Check if any rows were affected
			return result.changes > 0;
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to delete subscription pattern: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'DELETE FROM subscription_patterns',
				[patternId],
			);
		}
	}

	// ===== TRANSACTION-SUBSCRIPTION INTEGRATION =====

	/**
	 * Flag a transaction as part of a subscription
	 */
	async flagTransactionAsSubscription(
		transactionId: string,
		subscriptionId: string,
	): Promise<void> {
		try {
			const db = this.context.connection();

			const stmt = db.prepare(`
				UPDATE transactions
				SET is_subscription = 1, subscription_id = ?, updated_at = ?
				WHERE id = ?
			`);

			stmt.run(subscriptionId, new Date().toISOString(), transactionId);
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to flag transaction as subscription: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'UPDATE transactions (flag subscription)',
				[transactionId, subscriptionId],
			);
		}
	}

	/**
	 * Remove subscription flag from a transaction
	 */
	async unflagTransactionAsSubscription(transactionId: string): Promise<void> {
		try {
			const db = this.context.connection();

			const stmt = db.prepare(`
				UPDATE transactions
				SET is_subscription = 0, subscription_id = NULL, updated_at = ?
				WHERE id = ?
			`);

			stmt.run(new Date().toISOString(), transactionId);
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to unflag transaction as subscription: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'UPDATE transactions (unflag subscription)',
				[transactionId],
			);
		}
	}

	/**
	 * Find all transactions for a specific subscription
	 */
	async findSubscriptionTransactions(
		subscriptionId: string,
	): Promise<TransactionWithSubscription[]> {
		try {
			const db = this.context.connection();
			const stmt = db.prepare(`
				SELECT t.id, t.date, t.description, t.amount, t.type, t.currency, t.category_id,
				       t.is_subscription, t.subscription_id
				FROM transactions t
				WHERE t.subscription_id = ?
				ORDER BY t.date DESC, t.created_at DESC
			`);

			const rows = stmt.all(subscriptionId) as Array<{
				id: string;
				date: string;
				description: string;
				amount: number;
				currency: string | null;
				type: 'income' | 'expense' | 'transfer';
				category_id: string | null;
				is_subscription: number;
				subscription_id: string | null;
			}>;

			return rows.map((row) => ({
				id: row.id,
				date: new Date(row.date),
				description: row.description,
				amount: row.amount,
				currency: row.currency || undefined,
				type: row.type,
				categoryId: row.category_id || undefined,
				isSubscription: row.is_subscription === 1,
				subscriptionId: row.subscription_id || undefined,
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch subscription transactions: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM transactions WHERE subscription_id = ?',
				[subscriptionId],
			);
		}
	}
}
