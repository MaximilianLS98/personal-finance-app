/**
 * Subscription pattern detection and management engine
 * Integrates with existing categorization system for subscription detection
 */

import type {
	Transaction,
	Subscription,
	SubscriptionPattern,
	TransactionWithSubscription,
} from './types';
import type { TransactionRepository } from './database/repository';

/**
 * Candidate subscription detected from transaction patterns
 */
export interface SubscriptionCandidate {
	/** Suggested subscription name */
	name: string;
	/** Estimated amount per billing cycle */
	amount: number;
	/** Currency code */
	currency: string;
	/** Detected billing frequency */
	billingFrequency: 'monthly' | 'quarterly' | 'annually';
	/** Suggested category ID based on existing categorization */
	categoryId?: string;
	/** Confidence score for this detection (0.0-1.0) */
	confidence: number;
	/** Transactions that match this pattern */
	matchingTransactions: Transaction[];
	/** Detected patterns for this subscription */
	detectedPatterns: Array<{
		pattern: string;
		patternType: 'exact' | 'contains' | 'starts_with';
		confidence: number;
	}>;
	/** Reason for detection */
	reason: string;
}

/**
 * Recurring pattern analysis result
 */
export interface RecurringPattern {
	/** Base description pattern */
	description: string;
	/** Normalized amount */
	amount: number;
	/** Currency */
	currency: string;
	/** Detected frequency in days */
	frequencyDays: number;
	/** Billing frequency classification */
	billingFrequency: 'monthly' | 'quarterly' | 'annually';
	/** Transactions matching this pattern */
	transactions: Transaction[];
	/** Confidence score */
	confidence: number;
	/** Most common category ID from transactions */
	suggestedCategoryId?: string;
}

/**
 * Pattern matching result for existing subscriptions
 */
export interface SubscriptionMatch {
	/** Subscription that matches */
	subscription: Subscription;
	/** Transaction that matches */
	transaction: Transaction;
	/** Matching pattern */
	pattern: SubscriptionPattern;
	/** Confidence score for this match */
	confidence: number;
}

/**
 * Subscription pattern detection engine
 */
export class SubscriptionPatternEngine {
	constructor(private repository: TransactionRepository) {}

	/**
	 * Detect potential subscriptions from a set of transactions
	 */
	async detectSubscriptions(transactions: Transaction[]): Promise<SubscriptionCandidate[]> {
		// Analyze for recurring patterns from all transactions
		const recurringPatterns = await this.analyzeRecurringPatterns(transactions);

		// Convert patterns to subscription candidates
		const candidates: SubscriptionCandidate[] = [];

		for (const pattern of recurringPatterns) {
			if (pattern.confidence >= 0.6) {
				// Only suggest high-confidence patterns
				const candidate: SubscriptionCandidate = {
					name: this.generateSubscriptionName(pattern.description),
					amount: Math.abs(pattern.amount),
					currency: pattern.currency,
					billingFrequency: pattern.billingFrequency,
					categoryId: pattern.suggestedCategoryId,
					confidence: pattern.confidence,
					matchingTransactions: pattern.transactions,
					detectedPatterns: this.generatePatterns(pattern.description),
					reason: `Detected ${pattern.billingFrequency} recurring payment of ${pattern.amount.toFixed(2)} ${pattern.currency}`,
				};

				candidates.push(candidate);
			}
		}

		// Filter out candidates that match existing active subscriptions
		const filteredCandidates = await this.filterExistingSubscriptions(candidates);

		// Filter out monthly candidates that haven't been paid in the last 4 months (likely canceled)
		const recentCandidates = this.filterStaleMonthlyCandidates(filteredCandidates);

		return recentCandidates.sort((a, b) => b.confidence - a.confidence);
	}

	/**
	 * Filter out candidates that match existing active subscriptions by name and amount
	 */
	private async filterExistingSubscriptions(
		candidates: SubscriptionCandidate[],
	): Promise<SubscriptionCandidate[]> {
		const activeSubscriptions = await this.repository.findActiveSubscriptions();

		if (activeSubscriptions.length === 0) {
			return candidates; // No active subscriptions, return all candidates
		}

		// Filter out candidates that match existing subscriptions
		return candidates.filter((candidate) => {
			// Check if any existing subscription matches this candidate by name similarity and amount
			const existingMatch = activeSubscriptions.some((existing) => {
				const nameSimilarity = this.calculateStringSimilarity(
					candidate.name.toLowerCase(),
					existing.name.toLowerCase(),
				);
				const amountMatch = Math.abs(existing.amount - candidate.amount) <= 1.0; // 1 unit tolerance

				// If name is similar (>60%) and amount matches closely, consider it a duplicate
				// Lower threshold because subscription names can have small variations
				return nameSimilarity > 0.6 && amountMatch;
			});

			return !existingMatch; // Keep only candidates that don't match existing subscriptions
		});
	}

	/**
	 * Filter out monthly subscription candidates that appear to have been canceled
	 * (no payments in the last 4 months relative to today)
	 */
	private filterStaleMonthlyCandidates(candidates: SubscriptionCandidate[]): SubscriptionCandidate[] {
		const now = new Date();
		const fourMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 4, now.getDate());

		return candidates.filter((candidate) => {
			// Only filter monthly subscriptions
			if (candidate.billingFrequency !== 'monthly') {
				return true; // Keep quarterly, annual, etc.
			}

			// Find the most recent transaction
			const mostRecentTransaction = candidate.matchingTransactions
				.sort((a, b) => b.date.getTime() - a.date.getTime())[0];

			// If the most recent payment is within the last 4 months, keep it
			const isRecentEnough = mostRecentTransaction.date >= fourMonthsAgo;

			return isRecentEnough;
		});
	}

	/**
	 * Analyze transactions for recurring patterns
	 */
	async analyzeRecurringPatterns(transactions: Transaction[]): Promise<RecurringPattern[]> {
		// Group transactions by similar descriptions and amounts
		const groups = this.groupSimilarTransactions(transactions);
		const patterns: RecurringPattern[] = [];

		for (const group of groups) {
			if (group.transactions.length >= 2) {
				// Need at least 2 occurrences
				const pattern = this.analyzeTransactionGroup(group);
				if (pattern) {
					patterns.push(pattern);
				}
			}
		}

		return patterns;
	}

	/**
	 * Match transactions against existing subscription patterns
	 */
	async matchExistingSubscriptions(transactions: Transaction[]): Promise<SubscriptionMatch[]> {
		const matches: SubscriptionMatch[] = [];

		// Get all active subscriptions and their patterns
		const subscriptions = await this.repository.findActiveSubscriptions();

		for (const subscription of subscriptions) {
			const patterns = await this.repository.findPatternsBySubscription(subscription.id);

			for (const transaction of transactions) {
				// Skip transactions already flagged as subscriptions
				if ((transaction as TransactionWithSubscription).isSubscription) {
					continue;
				}

				for (const pattern of patterns) {
					const matchConfidence = this.calculatePatternMatch(transaction, pattern);

					if (matchConfidence >= 0.7) {
						// High confidence threshold for auto-matching
						matches.push({
							subscription,
							transaction,
							pattern,
							confidence: matchConfidence,
						});
					}
				}
			}
		}

		return matches.sort((a, b) => b.confidence - a.confidence);
	}

	/**
	 * Create patterns for a subscription based on transaction analysis
	 */
	async createPatternsForSubscription(
		subscriptionId: string,
		transactions: Transaction[],
	): Promise<SubscriptionPattern[]> {
		const patterns: SubscriptionPattern[] = [];

		// Analyze transaction descriptions to create patterns
		const descriptions = transactions.map((t) => t.description);
		const patternCandidates = this.extractPatterns(descriptions);

		for (const candidate of patternCandidates) {
			const pattern = await this.repository.createSubscriptionPattern({
				subscriptionId,
				pattern: candidate.pattern,
				patternType: candidate.patternType,
				confidenceScore: candidate.confidence,
				createdBy: 'system',
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			patterns.push(pattern);
		}

		return patterns;
	}

	/**
	 * Update pattern confidence based on user feedback
	 */
	async updatePatternConfidence(patternId: string, wasCorrect: boolean): Promise<void> {
		await this.repository.updatePatternUsage(patternId, wasCorrect);
	}

	// ===== PRIVATE HELPER METHODS =====

	/**
	 * Group transactions by similar descriptions and amounts
	 */
	private groupSimilarTransactions(transactions: Transaction[]): Array<{
		key: string;
		transactions: Transaction[];
		baseDescription: string;
		originalDescription: string;
		baseAmount: number;
	}> {
		const groups = new Map<string, Transaction[]>();

		for (const transaction of transactions) {
			// Only consider expense transactions for subscriptions
			if (transaction.type !== 'expense') continue;

			// Normalize description and amount for grouping
			const normalizedDesc = this.normalizeDescription(transaction.description);
			const normalizedAmount = Math.abs(transaction.amount);

			// Create a key for grouping (description + amount with tolerance)
			const amountKey = Math.round(normalizedAmount * 100); // Round to cents
			const key = `${normalizedDesc}:${amountKey}`;

			if (!groups.has(key)) {
				groups.set(key, []);
			}
			groups.get(key)!.push(transaction);
		}

		// Convert to array format with metadata
		return Array.from(groups.entries()).map(([key, transactions]) => {
			const [baseDescription] = key.split(':');
			const baseAmount = transactions[0].amount;
			// Use the original description from the first transaction for naming
			const originalDescription = transactions[0].description;

			return {
				key,
				transactions: transactions.sort((a, b) => a.date.getTime() - b.date.getTime()),
				baseDescription,
				originalDescription,
				baseAmount,
			};
		});
	}

	/**
	 * Analyze a group of similar transactions for recurring patterns
	 */
	private analyzeTransactionGroup(group: {
		transactions: Transaction[];
		baseDescription: string;
		originalDescription: string;
		baseAmount: number;
	}): RecurringPattern | null {
		const { transactions } = group;

		if (transactions.length < 2) return null;

		// Calculate intervals between transactions
		const intervals: number[] = [];
		for (let i = 1; i < transactions.length; i++) {
			const daysDiff = Math.round(
				(transactions[i].date.getTime() - transactions[i - 1].date.getTime()) /
					(1000 * 60 * 60 * 24),
			);
			intervals.push(daysDiff);
		}

		// Analyze frequency pattern
		const avgInterval =
			intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
		const intervalVariance = this.calculateVariance(intervals);

		// Determine billing frequency and confidence
		let billingFrequency: 'monthly' | 'quarterly' | 'annually';
		let confidence = 0;

		if (this.isNearValue(avgInterval, 30, 7)) {
			// Monthly (±7 days tolerance)
			billingFrequency = 'monthly';
			confidence = Math.max(0.5, 1 - intervalVariance / 100); // Higher variance = lower confidence
		} else if (this.isNearValue(avgInterval, 91, 14)) {
			// Quarterly (±14 days tolerance)
			billingFrequency = 'quarterly';
			confidence = Math.max(0.4, 1 - intervalVariance / 200);
		} else if (this.isNearValue(avgInterval, 365, 30)) {
			// Annually (±30 days tolerance)
			billingFrequency = 'annually';
			confidence = Math.max(0.3, 1 - intervalVariance / 500);
		} else {
			return null; // No recognizable pattern
		}

		// Boost confidence for more occurrences
		confidence *= Math.min(1, 0.5 + transactions.length * 0.1);

		// Find most common category
		const categoryIds = transactions
			.map((t) => t.categoryId)
			.filter((id) => id !== undefined) as string[];
		const suggestedCategoryId = this.getMostCommonValue(categoryIds);

		return {
			description: group.originalDescription,
			amount: Math.abs(group.baseAmount),
			currency: transactions[0].currency || 'NOK',
			frequencyDays: Math.round(avgInterval),
			billingFrequency,
			transactions,
			confidence,
			suggestedCategoryId,
		};
	}

	/**
	 * Calculate pattern match confidence between transaction and pattern
	 */
	private calculatePatternMatch(transaction: Transaction, pattern: SubscriptionPattern): number {
		const description = transaction.description.toLowerCase();
		const patternText = pattern.pattern.toLowerCase();

		let matchScore = 0;

		switch (pattern.patternType) {
			case 'exact':
				matchScore = description === patternText ? 1.0 : 0.0;
				break;
			case 'contains':
				matchScore = description.includes(patternText) ? 0.9 : 0.0;
				break;
			case 'starts_with':
				matchScore = description.startsWith(patternText) ? 0.8 : 0.0;
				break;
			case 'regex':
				try {
					const regex = new RegExp(patternText, 'i');
					matchScore = regex.test(description) ? 0.85 : 0.0;
				} catch {
					matchScore = 0.0; // Invalid regex
				}
				break;
		}

		// Apply pattern confidence score
		return matchScore * pattern.confidenceScore;
	}

	/**
	 * Generate subscription name from description
	 */
	private generateSubscriptionName(description: string): string {
		// Clean up common transaction prefixes/suffixes
		let name = description
			.replace(/^(VISA|MASTERCARD|DEBIT|CREDIT)\s*/i, '')
			.replace(/\s*(INC|LLC|LTD|AS|ASA)\.?$/i, '')
			.replace(/\s*\d{4}\s*$/, '') // Remove trailing numbers
			.trim();

		// Replace dots with spaces for better formatting
		name = name.replace(/\./g, ' ');

		// Convert to proper title case (first letter of each word capitalized, rest lowercase)
		name = name.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

		return name || 'Unknown Subscription';
	}

	/**
	 * Generate patterns from description
	 */
	private generatePatterns(description: string): Array<{
		pattern: string;
		patternType: 'exact' | 'contains' | 'starts_with';
		confidence: number;
	}> {
		const patterns = [];

		// Exact match pattern (highest confidence)
		patterns.push({
			pattern: description,
			patternType: 'exact' as const,
			confidence: 1.0,
		});

		// Contains pattern for core words
		const coreWords = this.extractCoreWords(description);
		if (coreWords.length > 0) {
			patterns.push({
				pattern: coreWords.join(' '),
				patternType: 'contains' as const,
				confidence: 0.8,
			});
		}

		// Starts with pattern for company names
		const firstWords = description.split(' ').slice(0, 2).join(' ');
		if (firstWords.length > 3) {
			patterns.push({
				pattern: firstWords,
				patternType: 'starts_with' as const,
				confidence: 0.7,
			});
		}

		return patterns;
	}

	/**
	 * Extract patterns from multiple descriptions
	 */
	private extractPatterns(descriptions: string[]): Array<{
		pattern: string;
		patternType: 'exact' | 'contains' | 'starts_with';
		confidence: number;
	}> {
		if (descriptions.length === 0) return [];

		const patterns = [];

		// If all descriptions are identical, use exact match
		if (descriptions.every((desc) => desc === descriptions[0])) {
			patterns.push({
				pattern: descriptions[0],
				patternType: 'exact' as const,
				confidence: 1.0,
			});
		} else {
			// Find common substrings
			const commonSubstring = this.findLongestCommonSubstring(descriptions);
			if (commonSubstring.length > 3) {
				patterns.push({
					pattern: commonSubstring.trim(),
					patternType: 'contains' as const,
					confidence: 0.8,
				});
			}

			// Find common prefix
			const commonPrefix = this.findCommonPrefix(descriptions);
			if (commonPrefix.length > 3) {
				patterns.push({
					pattern: commonPrefix.trim(),
					patternType: 'starts_with' as const,
					confidence: 0.7,
				});
			}
		}

		return patterns;
	}

	// ===== UTILITY METHODS =====

	/**
	 * Normalize description for comparison
	 */
	private normalizeDescription(description: string): string {
		return description
			.toLowerCase()
			.replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
			.replace(/\s+/g, ' ') // Normalize whitespace
			.trim();
	}

	/**
	 * Extract core words from description (remove common noise words)
	 */
	private extractCoreWords(description: string): string[] {
		const noiseWords = new Set([
			'the',
			'and',
			'or',
			'but',
			'in',
			'on',
			'at',
			'to',
			'for',
			'of',
			'with',
			'by',
			'visa',
			'mastercard',
			'debit',
			'credit',
			'card',
			'payment',
			'purchase',
			'inc',
			'llc',
			'ltd',
			'as',
			'asa',
			'corp',
			'company',
		]);

		return description
			.toLowerCase()
			.split(/\s+/)
			.filter((word) => word.length > 2 && !noiseWords.has(word) && !/^\d+$/.test(word));
	}

	/**
	 * Check if value is near target within tolerance
	 */
	private isNearValue(value: number, target: number, tolerance: number): boolean {
		return Math.abs(value - target) <= tolerance;
	}

	/**
	 * Calculate variance of an array of numbers
	 */
	private calculateVariance(numbers: number[]): number {
		if (numbers.length === 0) return 0;

		const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
		const squaredDiffs = numbers.map((num) => Math.pow(num - mean, 2));
		return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
	}

	/**
	 * Get most common value from array
	 */
	private getMostCommonValue<T>(values: T[]): T | undefined {
		if (values.length === 0) return undefined;

		const counts = new Map<T, number>();
		for (const value of values) {
			counts.set(value, (counts.get(value) || 0) + 1);
		}

		let maxCount = 0;
		let mostCommon: T | undefined;

		for (const [value, count] of counts) {
			if (count > maxCount) {
				maxCount = count;
				mostCommon = value;
			}
		}

		return mostCommon;
	}

	/**
	 * Find longest common substring among descriptions
	 */
	private findLongestCommonSubstring(descriptions: string[]): string {
		if (descriptions.length === 0) return '';
		if (descriptions.length === 1) return descriptions[0];

		let longest = '';
		const first = descriptions[0];

		for (let i = 0; i < first.length; i++) {
			for (let j = i + 1; j <= first.length; j++) {
				const substring = first.slice(i, j);

				if (
					substring.length > longest.length &&
					descriptions.every((desc) => desc.includes(substring))
				) {
					longest = substring;
				}
			}
		}

		return longest;
	}

	/**
	 * Find common prefix among descriptions
	 */
	private findCommonPrefix(descriptions: string[]): string {
		if (descriptions.length === 0) return '';
		if (descriptions.length === 1) return descriptions[0];

		let prefix = '';
		const first = descriptions[0];

		for (let i = 0; i < first.length; i++) {
			const char = first[i];

			if (descriptions.every((desc) => desc[i] === char)) {
				prefix += char;
			} else {
				break;
			}
		}

		return prefix;
	}

	/**
	 * Calculate string similarity using normalized comparison and word overlap
	 */
	private calculateStringSimilarity(str1: string, str2: string): number {
		// Normalize strings by removing punctuation and converting to lowercase
		const normalize = (str: string) => str
			.toLowerCase()
			.replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
			.replace(/\s+/g, ' ')      // Collapse multiple spaces
			.trim();

		const s1 = normalize(str1);
		const s2 = normalize(str2);

		// Exact match after normalization
		if (s1 === s2) return 1.0;

		// One is a substring of the other (common for subscription names)
		if (s1.includes(s2) || s2.includes(s1)) {
			const shorter = s1.length < s2.length ? s1 : s2;
			const longer = s1.length >= s2.length ? s1 : s2;
			return shorter.length / longer.length;
		}

		// Word-based similarity using Jaccard similarity
		const words1 = new Set(s1.split(/\s+/).filter(word => word.length > 0));
		const words2 = new Set(s2.split(/\s+/).filter(word => word.length > 0));

		if (words1.size === 0 && words2.size === 0) return 1.0;
		if (words1.size === 0 || words2.size === 0) return 0.0;

		// Calculate intersection and union
		const intersection = new Set([...words1].filter(word => words2.has(word)));
		const union = new Set([...words1, ...words2]);

		// Jaccard similarity = |intersection| / |union|
		return intersection.size / union.size;
	}
}

/**
 * Create a new subscription pattern engine instance
 */
export function createSubscriptionPatternEngine(
	repository: TransactionRepository,
): SubscriptionPatternEngine {
	return new SubscriptionPatternEngine(repository);
}
