/**
 * Transaction repository implementation with SQLite database operations
 */

import type { Transaction, FinancialSummary, Category, CategoryRule } from '../types';
import type { CreateManyResult, DuplicateInfo } from './types';
import { DatabaseErrorType } from './types';
import { DatabaseConnectionError, getConnectionManager } from './connection';

/**
 * Repository interface for transaction database operations
 */
export interface TransactionRepository {
	// Core CRUD operations
	create(transaction: Omit<Transaction, 'id'>): Promise<Transaction>;
	createMany(transactions: Omit<Transaction, 'id'>[]): Promise<CreateManyResult>;
	findAll(): Promise<Transaction[]>;
	findById(id: string): Promise<Transaction | null>;
	findByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]>;
	update(id: string, transaction: Partial<Omit<Transaction, 'id'>>): Promise<Transaction | null>;
	delete(id: string): Promise<boolean>;

	// Business logic operations
	calculateSummary(startDate?: Date, endDate?: Date): Promise<FinancialSummary>;
	checkDuplicates(transactions: Omit<Transaction, 'id'>[]): Promise<DuplicateInfo[]>;

	// Category operations
	getCategories(): Promise<Category[]>;
	getCategoryById(id: string): Promise<Category | null>;
	createCategory(category: {
		name: string;
		description?: string;
		color: string;
		icon: string;
		parentId?: string;
	}): Promise<Category>;
	updateCategory(id: string, updates: {
		name?: string;
		description?: string;
		color?: string;
		icon?: string;
		parentId?: string;
		isActive?: boolean;
	}): Promise<Category | null>;
	deleteCategory(id: string): Promise<boolean>;
	getCategoryRules(): Promise<CategoryRule[]>;
	createCategoryRule(rule: {
		categoryId: string;
		pattern: string;
		patternType: CategoryRule['patternType'];
		confidenceScore: number;
		createdBy: 'user' | 'system';
	}): Promise<CategoryRule>;
	updateRuleUsage(ruleId: string, wasCorrect: boolean): Promise<void>;
	deleteCategoryRule(ruleId: string): Promise<boolean>;

	// Database management
	initialize(): Promise<void>;
	close(): Promise<void>;
}

/**
 * SQLite implementation of TransactionRepository
 */
export class SQLiteTransactionRepository implements TransactionRepository {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private db: any | null = null;

	constructor() {
		// Connection will be established during initialization
	}

	/**
	 * Ensure database connection is available
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private ensureConnection(): any {
		if (!this.db) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.CONNECTION_FAILED,
				'Repository not initialized. Call initialize() first.',
			);
		}
		return this.db;
	}

	/**
	 * Initialize the repository and ensure database is ready
	 */
	async initialize(): Promise<void> {
		const manager = getConnectionManager();
		if (!manager.isReady()) {
			await manager.initialize();
			await manager.runMigrations();
		}
		this.db = manager.getConnection();
	}

	/**
	 * Create a single transaction with enhanced duplicate detection
	 */
	async create(transaction: Omit<Transaction, 'id'>): Promise<Transaction> {
		try {
			const db = this.ensureConnection();
			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			const stmt = db.prepare(`
				INSERT INTO transactions (id, date, description, amount, type, category_id, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`);

			stmt.run(
				id,
				transaction.date.toISOString(),
				transaction.description,
				transaction.amount,
				transaction.type,
				transaction.categoryId || null,
				now,
				now,
			);

			return {
				id,
				...transaction,
			};
		} catch (error) {
			// Handle constraint violations with detailed error information
			if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
				const identifier = `${transaction.date.toLocaleDateString()}: ${
					transaction.description
				} (${transaction.type === 'income' ? '+' : ''}${transaction.amount.toFixed(2)})`;

				throw new DatabaseConnectionError(
					DatabaseErrorType.CONSTRAINT_VIOLATION,
					`Duplicate transaction detected: ${identifier}`,
					'INSERT INTO transactions',
					[transaction.date, transaction.description, transaction.amount],
				);
			}
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to create transaction: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'INSERT INTO transactions',
			);
		}
	}

	/**
	 * Create multiple transactions in a batch operation with duplicate detection
	 */
	async createMany(transactions: Omit<Transaction, 'id'>[]): Promise<CreateManyResult> {
		if (transactions.length === 0) {
			return {
				created: [],
				duplicates: [],
				totalProcessed: 0,
			};
		}

		try {
			// First, check for existing duplicates to provide better user feedback
			const existingDuplicates = await this.checkDuplicates(transactions);
			const duplicateSet = new Set(
				existingDuplicates.map(
					(dup) => `${dup.date.toISOString()}-${dup.description}-${dup.amount}`,
				),
			);

			const db = this.ensureConnection();

			// Use database transaction for atomicity
			const result = db.transaction(() => {
				const stmt = db.prepare(`
					INSERT INTO transactions (id, date, description, amount, type, category_id, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				`);

				const now = new Date().toISOString();
				const createdTransactions: Transaction[] = [];
				const duplicates: DuplicateInfo[] = [];

				for (const transaction of transactions) {
					const transactionKey = `${transaction.date.toISOString()}-${
						transaction.description
					}-${transaction.amount}`;

					// Check if this transaction is a known duplicate
					if (duplicateSet.has(transactionKey)) {
						const identifier = `${transaction.date.toLocaleDateString()}: ${
							transaction.description
						} (${transaction.type === 'income' ? '+' : ''}${transaction.amount.toFixed(
							2,
						)})`;

						duplicates.push({
							date: transaction.date,
							description: transaction.description,
							amount: transaction.amount,
							type: transaction.type,
							identifier,
						});
						continue;
					}

					try {
						const id = crypto.randomUUID();
						stmt.run(
							id,
							transaction.date.toISOString(),
							transaction.description,
							transaction.amount,
							transaction.type,
							transaction.categoryId || null,
							now,
							now,
						);

						createdTransactions.push({
							id,
							...transaction,
						});
					} catch (error) {
						// Handle constraint violations (duplicates detected at database level)
						if (
							error instanceof Error &&
							error.message.includes('UNIQUE constraint failed')
						) {
							const identifier = `${transaction.date.toLocaleDateString()}: ${
								transaction.description
							} (${
								transaction.type === 'income' ? '+' : ''
							}${transaction.amount.toFixed(2)})`;

							duplicates.push({
								date: transaction.date,
								description: transaction.description,
								amount: transaction.amount,
								type: transaction.type,
								identifier,
							});
							continue;
						}
						throw error;
					}
				}

				return { created: createdTransactions, duplicates };
			})();

			return {
				created: result.created,
				duplicates: result.duplicates,
				totalProcessed: transactions.length,
			};
		} catch (error) {
			// Handle database transaction failures
			if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
				throw new DatabaseConnectionError(
					DatabaseErrorType.CONSTRAINT_VIOLATION,
					'Duplicate transaction detected during batch insert',
					'INSERT INTO transactions (batch)',
				);
			}

			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to create transactions: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'INSERT INTO transactions (batch)',
			);
		}
	}

	/**
	 * Find all transactions with category information
	 */
	async findAll(): Promise<Transaction[]> {
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT t.id, t.date, t.description, t.amount, t.type, t.category_id
				FROM transactions t
				ORDER BY t.date DESC, t.created_at DESC
			`);

			const rows = stmt.all() as Array<{
				id: string;
				date: string;
				description: string;
				amount: number;
				type: 'income' | 'expense' | 'transfer';
				category_id: string | null;
			}>;

			return rows.map((row) => ({
				id: row.id,
				date: new Date(row.date),
				description: row.description,
				amount: row.amount,
				type: row.type,
				categoryId: row.category_id || undefined,
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch transactions: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM transactions',
			);
		}
	}

	/**
	 * Find transaction by ID with category information
	 */
	async findById(id: string): Promise<Transaction | null> {
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT t.id, t.date, t.description, t.amount, t.type, t.category_id
				FROM transactions t
				WHERE t.id = ?
			`);

			const row = stmt.get(id) as {
				id: string;
				date: string;
				description: string;
				amount: number;
				type: 'income' | 'expense' | 'transfer';
				category_id: string | null;
			} | null;

			if (!row) {
				return null;
			}

			return {
				id: row.id,
				date: new Date(row.date),
				description: row.description,
				amount: row.amount,
				type: row.type,
				categoryId: row.category_id || undefined,
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch transaction by ID: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM transactions WHERE id = ?',
				[id],
			);
		}
	}

	/**
	 * Find transactions within a date range with category information
	 */
	async findByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT t.id, t.date, t.description, t.amount, t.type, t.category_id
				FROM transactions t
				WHERE t.date >= ? AND t.date <= ?
				ORDER BY t.date DESC, t.created_at DESC
			`);

			const rows = stmt.all(startDate.toISOString(), endDate.toISOString()) as Array<{
				id: string;
				date: string;
				description: string;
				amount: number;
				type: 'income' | 'expense' | 'transfer';
				category_id: string | null;
			}>;

			return rows.map((row) => ({
				id: row.id,
				date: new Date(row.date),
				description: row.description,
				amount: row.amount,
				type: row.type,
				categoryId: row.category_id || undefined,
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch transactions by date range: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM transactions WHERE date BETWEEN ? AND ?',
				[startDate, endDate],
			);
		}
	}

	/**
	 * Calculate financial summary from all transactions or within a date range
	 * Uses efficient SQL aggregation with proper indexing for optimal performance
	 */
	async calculateSummary(startDate?: Date, endDate?: Date): Promise<FinancialSummary> {
		try {
			const db = this.ensureConnection();

			// Validate date range if provided
			if (startDate && endDate && startDate > endDate) {
				throw new DatabaseConnectionError(
					DatabaseErrorType.TRANSACTION_FAILED,
					'Invalid date range: start date must be before or equal to end date',
					'calculateSummary validation',
					[startDate, endDate],
				);
			}

			let query: string;
			let params: string[] = [];

			if (startDate && endDate) {
				// Date range query - uses idx_transactions_date index for optimal performance
				query = `
					SELECT 
						COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as totalIncome,
						COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as totalExpenses,
						COUNT(*) as transactionCount
					FROM transactions
					WHERE date >= ? AND date <= ?
				`;
				params = [startDate.toISOString(), endDate.toISOString()];
			} else if (startDate) {
				// From start date onwards - uses idx_transactions_date index
				query = `
					SELECT 
						COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as totalIncome,
						COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as totalExpenses,
						COUNT(*) as transactionCount
					FROM transactions
					WHERE date >= ?
				`;
				params = [startDate.toISOString()];
			} else if (endDate) {
				// Up to end date - uses idx_transactions_date index
				query = `
					SELECT 
						COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as totalIncome,
						COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as totalExpenses,
						COUNT(*) as transactionCount
					FROM transactions
					WHERE date <= ?
				`;
				params = [endDate.toISOString()];
			} else {
				// All transactions - full table scan but optimized with aggregation
				query = `
					SELECT 
						COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as totalIncome,
						COALESCE(SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END), 0) as totalExpenses,
						COUNT(*) as transactionCount
					FROM transactions
				`;
			}

			const stmt = db.prepare(query);
			const result = stmt.get(...params) as {
				totalIncome: number;
				totalExpenses: number;
				transactionCount: number;
			};

			// Handle edge case of empty database or no matching transactions
			if (result.transactionCount === 0) {
				return {
					totalIncome: 0,
					totalExpenses: 0,
					netAmount: 0,
					transactionCount: 0,
				};
			}

			return {
				totalIncome: result.totalIncome,
				totalExpenses: result.totalExpenses,
				netAmount: result.totalIncome - result.totalExpenses,
				transactionCount: result.transactionCount,
			};
		} catch (error) {
			// Re-throw our custom errors
			if (error instanceof DatabaseConnectionError) {
				throw error;
			}

			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to calculate summary: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT summary FROM transactions',
				startDate || endDate ? [startDate, endDate] : undefined,
			);
		}
	}

	/**
	 * Check for duplicate transactions and return detailed information
	 */
	async checkDuplicates(transactions: Omit<Transaction, 'id'>[]): Promise<DuplicateInfo[]> {
		if (transactions.length === 0) {
			return [];
		}

		try {
			const db = this.ensureConnection();
			const duplicates: DuplicateInfo[] = [];
			const stmt = db.prepare(`
				SELECT id FROM transactions
				WHERE date = ? AND description = ? AND amount = ?
				LIMIT 1
			`);

			for (const transaction of transactions) {
				const existing = stmt.get(
					transaction.date.toISOString(),
					transaction.description,
					transaction.amount,
				);

				if (existing) {
					const identifier = `${transaction.date.toLocaleDateString()}: ${
						transaction.description
					} (${transaction.type === 'income' ? '+' : ''}${transaction.amount.toFixed(
						2,
					)})`;

					duplicates.push({
						date: transaction.date,
						description: transaction.description,
						amount: transaction.amount,
						type: transaction.type,
						identifier,
					});
				}
			}

			return duplicates;
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to check duplicates: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM transactions (duplicate check)',
			);
		}
	}

	/**
	 * Update an existing transaction
	 */
	async update(id: string, updates: Partial<Omit<Transaction, 'id'>>): Promise<Transaction | null> {
		try {
			const db = this.ensureConnection();

			// First check if transaction exists
			const existing = await this.findById(id);
			if (!existing) {
				return null;
			}

			// Build dynamic update query based on provided fields
			const updateFields = [];
			const params = [];

			if (updates.date !== undefined) {
				updateFields.push('date = ?');
				params.push(updates.date.toISOString());
			}
			if (updates.description !== undefined) {
				updateFields.push('description = ?');
				params.push(updates.description);
			}
			if (updates.amount !== undefined) {
				updateFields.push('amount = ?');
				params.push(updates.amount);
			}
			if (updates.type !== undefined) {
				updateFields.push('type = ?');
				params.push(updates.type);
			}
			if (updates.categoryId !== undefined) {
				updateFields.push('category_id = ?');
				params.push(updates.categoryId);
			}

			// Always update the updated_at timestamp
			updateFields.push('updated_at = ?');
			params.push(new Date().toISOString());

			// Add ID parameter for WHERE clause
			params.push(id);

			const stmt = db.prepare(`
				UPDATE transactions 
				SET ${updateFields.join(', ')}
				WHERE id = ?
			`);

			stmt.run(...params);

			// Return the updated transaction
			return await this.findById(id);
		} catch (error) {
			// Handle constraint violations (duplicate detection)
			if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
				throw new DatabaseConnectionError(
					DatabaseErrorType.CONSTRAINT_VIOLATION,
					'Update would create duplicate transaction',
					'UPDATE transactions',
					[id, updates],
				);
			}

			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to update transaction: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'UPDATE transactions',
				[id, updates],
			);
		}
	}

	/**
	 * Delete a transaction by ID
	 */
	async delete(id: string): Promise<boolean> {
		try {
			const db = this.ensureConnection();

			const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
			const result = stmt.run(id);

			// Check if any rows were affected
			return result.changes > 0;
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to delete transaction: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'DELETE FROM transactions',
				[id],
			);
		}
	}

	/**
	 * Get all categories
	 */
	async getCategories(): Promise<Category[]> {
		try {
			const db = this.ensureConnection();
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
				`Failed to fetch categories: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM categories',
			);
		}
	}

	/**
	 * Get category by ID
	 */
	async getCategoryById(id: string): Promise<Category | null> {
		try {
			const db = this.ensureConnection();
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
			const db = this.ensureConnection();
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
			const db = this.ensureConnection();
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
			const db = this.ensureConnection();
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
				`Failed to create category: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'INSERT INTO categories',
				[category],
			);
		}
	}

	/**
	 * Update an existing category
	 */
	async updateCategory(id: string, updates: {
		name?: string;
		description?: string;
		color?: string;
		icon?: string;
		parentId?: string;
		isActive?: boolean;
	}): Promise<Category | null> {
		try {
			const db = this.ensureConnection();

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
				`Failed to update category: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
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
			const db = this.ensureConnection();

			const stmt = db.prepare('UPDATE categories SET is_active = 0, updated_at = ? WHERE id = ?');
			const result = stmt.run(new Date().toISOString(), id);

			// Check if any rows were affected
			return result.changes > 0;
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to delete category: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
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
			const db = this.ensureConnection();

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
			const db = this.ensureConnection();

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
				`Failed to update rule usage: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'UPDATE category_rules',
				[ruleId, wasCorrect],
			);
		}
	}

	/**
	 * Close the repository and database connection
	 */
	async close(): Promise<void> {
		const manager = getConnectionManager();
		await manager.close();
	}
}

/**
 * Create a new repository instance
 */
export function createTransactionRepository(): TransactionRepository {
	return new SQLiteTransactionRepository();
}
