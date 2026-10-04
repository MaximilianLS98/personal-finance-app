import type { Category, CategoryRule } from '../../types';
import { DatabaseConnectionError } from '../connection';
import type { RepositoryContext } from '../repository-context';
import { DatabaseErrorType } from '../types';

export class CategoriesRepository {
	constructor(private readonly context: RepositoryContext) {}

	/**
	 * Get all categories
	 */
	async getCategories(): Promise<Category[]> {
		try {
			const db = this.context.connection();
			const stmt = db.prepare(`
				SELECT id, name, description, color, icon, parent_id, is_active, created_at, updated_at
				FROM categories
				WHERE is_active = 1
				ORDER BY name
			`);

			const rows = stmt.all() as Array<{
				id: string;
				name: string;
				description: string | null;
				color: string;
				icon: string;
				parent_id: string | null;
				is_active: number;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				color: row.color,
				icon: row.icon,
				parentId: row.parent_id || undefined,
				isActive: row.is_active === 1,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch categories: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'SELECT FROM categories',
			);
		}
	}

	/**
	 * Get category by ID
	 */
	async getCategoryById(id: string): Promise<Category | null> {
		try {
			const db = this.context.connection();
			const stmt = db.prepare(`
				SELECT id, name, description, color, icon, parent_id, is_active, created_at, updated_at
				FROM categories
				WHERE id = ? AND is_active = 1
			`);

			const row = stmt.get(id) as {
				id: string;
				name: string;
				description: string | null;
				color: string;
				icon: string;
				parent_id: string | null;
				is_active: number;
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
				color: row.color,
				icon: row.icon,
				parentId: row.parent_id || undefined,
				isActive: row.is_active === 1,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch category by ID: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM categories WHERE id = ?',
				[id],
			);
		}
	}

	/**
	 * Get all category rules ordered by confidence score
	 */
	async getCategoryRules(): Promise<CategoryRule[]> {
		try {
			const db = this.context.connection();
			const stmt = db.prepare(`
				SELECT id, category_id, pattern, pattern_type, confidence_score, usage_count,
				       last_used_at, created_by, is_active, created_at, updated_at
				FROM category_rules
				WHERE is_active = 1
				ORDER BY confidence_score DESC, usage_count DESC
			`);

			const rows = stmt.all() as Array<{
				id: string;
				category_id: string;
				pattern: string;
				pattern_type: string;
				confidence_score: number;
				usage_count: number;
				last_used_at: string | null;
				created_by: string;
				is_active: number;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				categoryId: row.category_id,
				pattern: row.pattern,
				patternType: row.pattern_type as CategoryRule['patternType'],
				confidenceScore: row.confidence_score,
				usageCount: row.usage_count,
				lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
				createdBy: row.created_by as 'user' | 'system',
				isActive: row.is_active === 1,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch category rules: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM category_rules',
			);
		}
	}

	/**
	 * Create a new category rule
	 */
	async createCategoryRule(rule: {
		categoryId: string;
		pattern: string;
		patternType: CategoryRule['patternType'];
		confidenceScore: number;
		createdBy: 'user' | 'system';
	}): Promise<CategoryRule> {
		try {
			const db = this.context.connection();
			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			const stmt = db.prepare(`
				INSERT INTO category_rules (id, category_id, pattern, pattern_type, confidence_score,
				                           usage_count, created_by, is_active, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?, ?)
			`);

			stmt.run(
				id,
				rule.categoryId,
				rule.pattern,
				rule.patternType,
				rule.confidenceScore,
				rule.createdBy,
				now,
				now,
			);

			return {
				id,
				categoryId: rule.categoryId,
				pattern: rule.pattern,
				patternType: rule.patternType,
				confidenceScore: rule.confidenceScore,
				usageCount: 0,
				createdBy: rule.createdBy,
				isActive: true,
				createdAt: new Date(now),
				updatedAt: new Date(now),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to create category rule: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'INSERT INTO category_rules',
				[rule],
			);
		}
	}

	/**
	 * Create a new category
	 */
	async createCategory(category: {
		name: string;
		description?: string;
		color: string;
		icon: string;
		parentId?: string;
	}): Promise<Category> {
		try {
			const db = this.context.connection();
			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			const stmt = db.prepare(`
				INSERT INTO categories (id, name, description, color, icon, parent_id, is_active, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
			`);

			stmt.run(
				id,
				category.name,
				category.description || null,
				category.color,
				category.icon,
				category.parentId || null,
				now,
				now,
			);

			return {
				id,
				name: category.name,
				description: category.description,
				color: category.color,
				icon: category.icon,
				parentId: category.parentId,
				isActive: true,
				createdAt: new Date(now),
				updatedAt: new Date(now),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to create category: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'INSERT INTO categories',
				[category],
			);
		}
	}

	/**
	 * Update an existing category
	 */
	async updateCategory(
		id: string,
		updates: {
			name?: string;
			description?: string;
			color?: string;
			icon?: string;
			parentId?: string;
			isActive?: boolean;
		},
	): Promise<Category | null> {
		try {
			const db = this.context.connection();

			// First check if category exists
			const existing = await this.getCategoryById(id);
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
			if (updates.color !== undefined) {
				updateFields.push('color = ?');
				params.push(updates.color);
			}
			if (updates.icon !== undefined) {
				updateFields.push('icon = ?');
				params.push(updates.icon);
			}
			if (updates.parentId !== undefined) {
				updateFields.push('parent_id = ?');
				params.push(updates.parentId);
			}
			if (updates.isActive !== undefined) {
				updateFields.push('is_active = ?');
				params.push(updates.isActive ? 1 : 0);
			}

			// Always update the updated_at timestamp
			updateFields.push('updated_at = ?');
			params.push(new Date().toISOString());

			// Add ID parameter for WHERE clause
			params.push(id);

			const stmt = db.prepare(`
				UPDATE categories
				SET ${updateFields.join(', ')}
				WHERE id = ?
			`);

			stmt.run(...params);

			// Return the updated category
			return await this.getCategoryById(id);
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to update category: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'UPDATE categories',
				[id, updates],
			);
		}
	}

	/**
	 * Delete a category (soft delete by setting is_active to false)
	 */
	async deleteCategory(id: string): Promise<boolean> {
		try {
			const db = this.context.connection();

			const stmt = db.prepare('UPDATE categories SET is_active = 0, updated_at = ? WHERE id = ?');
			const result = stmt.run(new Date().toISOString(), id);

			// Check if any rows were affected
			return result.changes > 0;
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to delete category: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'UPDATE categories SET is_active = 0',
				[id],
			);
		}
	}

	/**
	 * Delete a category rule
	 */
	async deleteCategoryRule(ruleId: string): Promise<boolean> {
		try {
			const db = this.context.connection();

			const stmt = db.prepare('DELETE FROM category_rules WHERE id = ?');
			const result = stmt.run(ruleId);

			// Check if any rows were affected
			return result.changes > 0;
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to delete category rule: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'DELETE FROM category_rules',
				[ruleId],
			);
		}
	}

	/**
	 * Update rule usage statistics and confidence
	 */
	async updateRuleUsage(ruleId: string, wasCorrect: boolean): Promise<void> {
		try {
			const db = this.context.connection();

			// Get current rule data
			const getStmt = db.prepare(`
				SELECT confidence_score, usage_count
				FROM category_rules
				WHERE id = ?
			`);

			const currentRule = getStmt.get(ruleId) as {
				confidence_score: number;
				usage_count: number;
			} | null;

			if (!currentRule) {
				return; // Rule doesn't exist
			}

			// Calculate new confidence score using a learning algorithm
			let newConfidence = currentRule.confidence_score;
			const usageCount = currentRule.usage_count + 1;

			if (wasCorrect) {
				// Boost confidence, but with diminishing returns
				const boost = 0.1 * (1 - newConfidence); // Larger boost when confidence is lower
				newConfidence = Math.min(1.0, newConfidence + boost);
			} else {
				// Reduce confidence
				const penalty = 0.15; // Slightly larger penalty than boost to prevent false positives
				newConfidence = Math.max(0.1, newConfidence - penalty); // Minimum confidence of 0.1
			}

			// Update the rule
			const updateStmt = db.prepare(`
				UPDATE category_rules
				SET confidence_score = ?, usage_count = ?, last_used_at = ?, updated_at = ?
				WHERE id = ?
			`);

			const now = new Date().toISOString();
			updateStmt.run(newConfidence, usageCount, now, now, ruleId);
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to update rule usage: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'UPDATE category_rules',
				[ruleId, wasCorrect],
			);
		}
	}
}
