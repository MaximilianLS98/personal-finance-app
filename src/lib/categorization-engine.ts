/**
 * Intelligent categorization engine that learns from user behavior
 */

import type { Category, CategoryRule, CategorySuggestion } from './types';
import { createTransactionRepository } from './database';

export class CategoryLearningEngine {
	private repository = createTransactionRepository();

	/**
	 * Find the best category suggestion for a transaction description
	 */
	async suggestCategory(description: string): Promise<CategorySuggestion | null> {
		if (!description) return null;

		try {
			await this.repository.initialize();
			
			// Get all active category rules ordered by confidence
			const rules = await this.getCategoryRules();
			const categories = await this.getCategories();
			const categoryMap = new Map(categories.map(cat => [cat.id, cat]));

			// Find matching rules
			const matches = rules
				.filter(rule => this.matchesPattern(description, rule))
				.sort((a, b) => b.confidenceScore - a.confidenceScore); // Highest confidence first

			if (matches.length === 0) {
				return null;
			}

			const bestMatch = matches[0];
			const category = categoryMap.get(bestMatch.categoryId);

			if (!category) {
				return null;
			}

			return {
				category,
				confidence: bestMatch.confidenceScore,
				rule: bestMatch,
				reason: this.generateReason(bestMatch, description),
			};
		} finally {
			await this.repository.close();
		}
	}

	/**
	 * Learn from user categorization action
	 */
	async learnFromUserAction(
		description: string, 
		categoryId: string, 
		wasCorrectSuggestion: boolean = false
	): Promise<void> {
		if (!description || !categoryId) return;

		try {
			await this.repository.initialize();

			if (wasCorrectSuggestion) {
				// User accepted our suggestion - boost confidence
				await this.boostMatchingRuleConfidence(description, categoryId);
			} else {
				// User chose different category - learn new pattern and potentially reduce old confidence
				await this.createOrUpdateUserRule(description, categoryId);
				await this.reduceConflictingRuleConfidence(description, categoryId);
			}
		} finally {
			await this.repository.close();
		}
	}

	/**
	 * Extract patterns from a transaction description
	 */
	private extractPatterns(description: string): Array<{pattern: string, type: CategoryRule['patternType']}> {
		const patterns = [];
		const cleanDesc = description.trim().toUpperCase();

		// Exact match
		patterns.push({ pattern: cleanDesc, type: 'exact' as const });

		// Contains patterns - extract meaningful words
		const words = cleanDesc.split(/\s+/).filter(word => 
			word.length > 2 && 
			!/^\d+$/.test(word) && // Not just numbers
			!['THE', 'AND', 'FOR', 'WITH', 'FROM'].includes(word) // Not common words
		);

		for (const word of words) {
			patterns.push({ pattern: word, type: 'contains' as const });
		}

		// Starts with pattern (first meaningful word)
		if (words.length > 0) {
			patterns.push({ pattern: words[0], type: 'starts_with' as const });
		}

		return patterns;
	}

	/**
	 * Check if description matches a rule pattern
	 */
	private matchesPattern(description: string, rule: CategoryRule): boolean {
		const cleanDesc = description.trim().toUpperCase();
		const pattern = rule.pattern.toUpperCase();

		switch (rule.patternType) {
			case 'exact':
				return cleanDesc === pattern;
			case 'contains':
				return cleanDesc.includes(pattern);
			case 'starts_with':
				return cleanDesc.startsWith(pattern);
			case 'regex':
				try {
					const regex = new RegExp(rule.pattern, 'i');
					return regex.test(description);
				} catch {
					return false; // Invalid regex
				}
			default:
				return false;
		}
	}

	/**
	 * Generate human-readable reason for suggestion
	 */
	private generateReason(rule: CategoryRule, description: string): string {
		const confidence = Math.round(rule.confidenceScore * 100);
		
		switch (rule.patternType) {
			case 'exact':
				return `Exact match (${confidence}% confidence)`;
			case 'contains':
				return `Contains "${rule.pattern}" (${confidence}% confidence)`;
			case 'starts_with':
				return `Starts with "${rule.pattern}" (${confidence}% confidence)`;
			case 'regex':
				return `Pattern match (${confidence}% confidence)`;
			default:
				return `Pattern match (${confidence}% confidence)`;
		}
	}

	/**
	 * Create or update user rule for a description-category pair
	 */
	private async createOrUpdateUserRule(description: string, categoryId: string): Promise<void> {
		const patterns = this.extractPatterns(description);
		
		// Find the most specific pattern (prefer exact > starts_with > contains)
		const priorityOrder = ['exact', 'starts_with', 'contains'];
		const bestPattern = patterns.sort((a, b) => 
			priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type)
		)[0];

		if (!bestPattern) return;

		// Check if rule already exists
		const existingRules = await this.getCategoryRules();
		const existingRule = existingRules.find(rule => 
			rule.pattern.toUpperCase() === bestPattern.pattern.toUpperCase() &&
			rule.patternType === bestPattern.type &&
			rule.categoryId === categoryId
		);

		if (existingRule) {
			// Update existing rule
			await this.updateRuleUsage(existingRule.id, true);
		} else {
			// Create new rule
			await this.createCategoryRule({
				categoryId,
				pattern: bestPattern.pattern,
				patternType: bestPattern.type,
				confidenceScore: 0.8, // Start with good confidence for user rules
				createdBy: 'user',
			});
		}
	}

	/**
	 * Boost confidence of matching rule
	 */
	private async boostMatchingRuleConfidence(description: string, categoryId: string): Promise<void> {
		const rules = await this.getCategoryRules();
		const matchingRule = rules.find(rule => 
			rule.categoryId === categoryId && 
			this.matchesPattern(description, rule)
		);

		if (matchingRule) {
			await this.updateRuleUsage(matchingRule.id, true);
		}
	}

	/**
	 * Reduce confidence of conflicting rules
	 */
	private async reduceConflictingRuleConfidence(description: string, correctCategoryId: string): Promise<void> {
		const rules = await this.getCategoryRules();
		const conflictingRules = rules.filter(rule => 
			rule.categoryId !== correctCategoryId && 
			this.matchesPattern(description, rule)
		);

		for (const rule of conflictingRules) {
			await this.updateRuleUsage(rule.id, false);
		}
	}

	/**
	 * Database methods delegated to repository
	 */
	private async getCategories(): Promise<Category[]> {
		return await this.repository.getCategories();
	}

	private async getCategoryRules(): Promise<CategoryRule[]> {
		return await this.repository.getCategoryRules();
	}

	private async createCategoryRule(rule: {
		categoryId: string;
		pattern: string;
		patternType: CategoryRule['patternType'];
		confidenceScore: number;
		createdBy: 'user' | 'system';
	}): Promise<CategoryRule> {
		return await this.repository.createCategoryRule(rule);
	}

	private async updateRuleUsage(ruleId: string, wasCorrect: boolean): Promise<void> {
		await this.repository.updateRuleUsage(ruleId, wasCorrect);
	}
}

/**
 * Singleton instance for application-wide use
 */
let categoryEngine: CategoryLearningEngine | null = null;

export function getCategoryEngine(): CategoryLearningEngine {
	if (!categoryEngine) {
		categoryEngine = new CategoryLearningEngine();
	}
	return categoryEngine;
}