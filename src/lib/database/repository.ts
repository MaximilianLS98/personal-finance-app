/**
 * Transaction repository implementation with SQLite database operations
 */

import type {
	Transaction,
	FinancialSummary,
	Category,
	CategoryRule,
	Subscription,
	SubscriptionPattern,
	TransactionWithSubscription,
	Budget,
	BudgetScenario,
	BudgetAlert,
	BudgetProgress,
	CreateBudgetRequest,
	SpendingAnalysis,
} from '../types';
import type { CreateManyResult, DuplicateInfo, PaginationOptions, PaginatedResult } from './types';
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
	findWithPagination(options: PaginationOptions): Promise<PaginatedResult<Transaction>>;
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
	updateCategory(
		id: string,
		updates: {
			name?: string;
			description?: string;
			color?: string;
			icon?: string;
			parentId?: string;
			isActive?: boolean;
		},
	): Promise<Category | null>;
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

	// Subscription CRUD operations
	createSubscription(
		subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>,
	): Promise<Subscription>;
	findAllSubscriptions(): Promise<Subscription[]>;
	findSubscriptionById(id: string): Promise<Subscription | null>;
	findSubscriptionsByCategory(categoryId: string): Promise<Subscription[]>;
	updateSubscription(
		id: string,
		updates: Partial<Omit<Subscription, 'id'>>,
	): Promise<Subscription | null>;
	deleteSubscription(id: string): Promise<boolean>;

	// Subscription-specific queries
	findActiveSubscriptions(): Promise<Subscription[]>;
	findUpcomingPayments(days: number): Promise<Subscription[]>;
	calculateTotalMonthlyCost(): Promise<number>;
	findUnusedSubscriptions(daysSinceLastUse: number): Promise<Subscription[]>;

	// Subscription pattern management
	createSubscriptionPattern(
		pattern: Omit<SubscriptionPattern, 'id'>,
	): Promise<SubscriptionPattern>;
	findPatternsBySubscription(subscriptionId: string): Promise<SubscriptionPattern[]>;
	updatePatternUsage(patternId: string, wasCorrect: boolean): Promise<void>;
	deleteSubscriptionPattern(patternId: string): Promise<boolean>;

	// Transaction-subscription integration
	flagTransactionAsSubscription(transactionId: string, subscriptionId: string): Promise<void>;
	unflagTransactionAsSubscription(transactionId: string): Promise<void>;
	findSubscriptionTransactions(subscriptionId: string): Promise<TransactionWithSubscription[]>;

	// Budget CRUD operations
	createBudget(budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>): Promise<Budget>;
	findAllBudgets(): Promise<Budget[]>;
	findBudgetById(id: string): Promise<Budget | null>;
	findBudgetsByCategory(categoryId: string): Promise<Budget[]>;
	updateBudget(id: string, updates: Partial<Omit<Budget, 'id'>>): Promise<Budget | null>;
	deleteBudget(id: string): Promise<boolean>;

	// Budget-specific queries
	findActiveBudgets(): Promise<Budget[]>;
	findBudgetsByActiveScenario(): Promise<Budget[]>;
	findBudgetsByPeriod(startDate: Date, endDate: Date): Promise<Budget[]>;
	findBudgetsByScenario(scenarioId: string): Promise<Budget[]>;
	calculateBudgetProgress(budgetId: string): Promise<BudgetProgress | null>;
	analyzeHistoricalSpending(categoryId: string, months: number): Promise<SpendingAnalysis>;

	// Budget scenario management
	createBudgetScenario(
		scenario: Omit<BudgetScenario, 'id' | 'budgets' | 'totalBudgeted'>,
	): Promise<BudgetScenario>;
	findAllBudgetScenarios(): Promise<BudgetScenario[]>;
	findBudgetScenarioById(id: string): Promise<BudgetScenario | null>;
	updateBudgetScenario(
		id: string,
		updates: Partial<Omit<BudgetScenario, 'id' | 'budgets' | 'totalBudgeted'>>,
	): Promise<BudgetScenario | null>;
	deleteBudgetScenario(id: string): Promise<boolean>;
	activateBudgetScenario(id: string): Promise<void>;

	// Budget alert management
	createBudgetAlert(alert: Omit<BudgetAlert, 'id'>): Promise<BudgetAlert>;
	findBudgetAlerts(budgetId?: string): Promise<BudgetAlert[]>;
	findUnreadBudgetAlerts(): Promise<BudgetAlert[]>;
	markBudgetAlertAsRead(alertId: string): Promise<boolean>;
	deleteBudgetAlert(alertId: string): Promise<boolean>;

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
				INSERT INTO transactions (id, date, description, amount, type, currency, category_id, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);

			stmt.run(
				id,
				transaction.date.toISOString(),
				transaction.description,
				transaction.amount,
				transaction.type,
				transaction.currency || null,
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
					INSERT INTO transactions (id, date, description, amount, type, currency, category_id, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
							transaction.currency || null,
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
				SELECT t.id, t.date, t.description, t.amount, t.type, t.currency, t.category_id
				FROM transactions t
				ORDER BY t.date DESC, t.created_at DESC
			`);

			const rows = stmt.all() as Array<{
				id: string;
				date: string;
				description: string;
				amount: number;
				currency: string | null;
				type: 'income' | 'expense' | 'transfer';
				category_id: string | null;
			}>;

			return rows.map((row) => ({
				id: row.id,
				date: new Date(row.date),
				description: row.description,
				amount: row.amount,
				currency: row.currency || undefined,
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
	 * Find transactions with pagination, filtering, and sorting
	 */
	async findWithPagination(options: PaginationOptions): Promise<PaginatedResult<Transaction>> {
		try {
			const db = this.ensureConnection();
			const {
				page = 1,
				limit = 25,
				sortBy = 'date',
				sortOrder = 'DESC',
				dateRange,
				transactionType = 'all',
				searchTerm,
				categoryIds,
				includeUncategorized,
			} = options;

			// Calculate offset
			const offset = (page - 1) * limit;

			// Build WHERE clause
			const conditions: string[] = [];
			const params: unknown[] = [];

			// Date range filter
			if (dateRange?.from) {
				conditions.push('t.date >= ?');
				params.push(dateRange.from.toISOString());
			}
			if (dateRange?.to) {
				conditions.push('t.date <= ?');
				params.push(dateRange.to.toISOString());
			}

			// Transaction type filter
			if (transactionType !== 'all') {
				conditions.push('t.type = ?');
				params.push(transactionType);
			}

			// Search term filter
			if (searchTerm && searchTerm.trim()) {
				conditions.push('t.description LIKE ?');
				params.push(`%${searchTerm.trim()}%`);
			}

			// Category filters
			if (categoryIds && categoryIds.length > 0) {
				// Build an IN clause for category IDs
				const placeholders = categoryIds.map(() => '?').join(', ');
				if (includeUncategorized) {
					conditions.push(
						`(t.category_id IN (${placeholders}) OR t.category_id IS NULL)`,
					);
					params.push(...categoryIds);
				} else {
					conditions.push(`t.category_id IN (${placeholders})`);
					params.push(...categoryIds);
				}
			} else if (includeUncategorized) {
				// Only uncategorized
				conditions.push('t.category_id IS NULL');
			}

			const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

			// Build ORDER BY clause
			const validSortFields = ['date', 'description', 'amount', 'type'];
			const sortField = validSortFields.includes(sortBy) ? sortBy : 'date';
			const orderByClause = `ORDER BY t.${sortField} ${sortOrder}, t.created_at ${sortOrder}`;

			// Get total count
			const countStmt = db.prepare(`
				SELECT COUNT(*) as total
				FROM transactions t
				${whereClause}
			`);
			const { total } = countStmt.get(...params) as { total: number };

			// Get paginated results
			const dataStmt = db.prepare(`
				SELECT t.id, t.date, t.description, t.amount, t.type, t.currency, t.category_id
				FROM transactions t
				${whereClause}
				${orderByClause}
				LIMIT ? OFFSET ?
			`);

			const rows = dataStmt.all(...params, limit, offset) as Array<{
				id: string;
				date: string;
				description: string;
				amount: number;
				currency: string | null;
				type: 'income' | 'expense' | 'transfer';
				category_id: string | null;
			}>;

			const transactions = rows.map((row) => ({
				id: row.id,
				date: new Date(row.date),
				description: row.description,
				amount: row.amount,
				currency: row.currency || undefined,
				type: row.type,
				categoryId: row.category_id || undefined,
			}));

			// Calculate pagination metadata
			const totalPages = Math.ceil(total / limit);
			const hasNextPage = page < totalPages;
			const hasPreviousPage = page > 1;

			return {
				data: transactions,
				pagination: {
					currentPage: page,
					limit,
					total,
					totalPages,
					hasNextPage,
					hasPreviousPage,
				},
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch paginated transactions: ${
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
				SELECT t.id, t.date, t.description, t.amount, t.type, t.currency, t.category_id
				FROM transactions t
				WHERE t.id = ?
			`);

			const row = stmt.get(id) as {
				id: string;
				date: string;
				description: string;
				amount: number;
				currency: string | null;
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
				currency: row.currency || undefined,
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
				SELECT t.id, t.date, t.description, t.amount, t.type, t.currency, t.category_id
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
	async update(
		id: string,
		updates: Partial<Omit<Transaction, 'id'>>,
	): Promise<Transaction | null> {
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

			const stmt = db.prepare(
				'UPDATE categories SET is_active = 0, updated_at = ? WHERE id = ?',
			);
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

	// ===== SUBSCRIPTION CRUD OPERATIONS =====

	/**
	 * Create a new subscription
	 */
	async createSubscription(
		subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>,
	): Promise<Subscription> {
		try {
			const db = this.ensureConnection();
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
			const db = this.ensureConnection();
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
			const db = this.ensureConnection();
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
			const db = this.ensureConnection();
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
			const db = this.ensureConnection();

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
			const db = this.ensureConnection();

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
			const db = this.ensureConnection();
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
			const db = this.ensureConnection();
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
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT amount, billing_frequency, custom_frequency_days
				FROM subscriptions
				WHERE is_active = 1
			`);

			const rows = stmt.all() as Array<{
				amount: number;
				billing_frequency: string;
				custom_frequency_days: number | null;
			}>;

			let totalMonthlyCost = 0;

			for (const row of rows) {
				let monthlyCost = 0;

				switch (row.billing_frequency) {
					case 'monthly':
						monthlyCost = row.amount;
						break;
					case 'quarterly':
						monthlyCost = row.amount / 3;
						break;
					case 'annually':
						monthlyCost = row.amount / 12;
						break;
					case 'custom':
						if (row.custom_frequency_days) {
							// Convert custom frequency to monthly equivalent
							const monthsPerCycle = row.custom_frequency_days / 30.44; // Average days per month
							monthlyCost = row.amount / monthsPerCycle;
						}
						break;
				}

				totalMonthlyCost += monthlyCost;
			}

			return totalMonthlyCost;
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to calculate total monthly cost: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM subscriptions (monthly cost calculation)',
			);
		}
	}

	/**
	 * Find subscriptions that haven't been used recently
	 */
	async findUnusedSubscriptions(daysSinceLastUse: number): Promise<Subscription[]> {
		try {
			const db = this.ensureConnection();
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastUse);

			const stmt = db.prepare(`
				SELECT id, name, description, amount, currency, billing_frequency, 
				       custom_frequency_days, next_payment_date, category_id, is_active, 
				       start_date, end_date, notes, website, cancellation_url, 
				       last_used_date, usage_rating, created_at, updated_at
				FROM subscriptions
				WHERE is_active = 1 
				  AND (last_used_date IS NULL OR last_used_date < ?)
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
			const db = this.ensureConnection();
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
			const db = this.ensureConnection();
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
			const db = this.ensureConnection();

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
			const db = this.ensureConnection();

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
			const db = this.ensureConnection();

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
			const db = this.ensureConnection();

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
			const db = this.ensureConnection();
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

	// ===== BUDGET CRUD OPERATIONS =====

	/**
	 * Create a new budget
	 */
	async createBudget(budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>): Promise<Budget> {
		try {
			const db = this.ensureConnection();
			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			const stmt = db.prepare(`
				INSERT INTO budgets (
					id, name, description, category_id, amount, currency, period, 
					start_date, end_date, is_active, alert_thresholds, scenario_id, 
					created_at, updated_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);

			stmt.run(
				id,
				budget.name,
				budget.description || null,
				budget.categoryId,
				budget.amount,
				budget.currency,
				budget.period,
				budget.startDate.toISOString(),
				budget.endDate.toISOString(),
				budget.isActive ? 1 : 0,
				JSON.stringify(budget.alertThresholds),
				budget.scenarioId || null,
				now,
				now,
			);

			return {
				id,
				...budget,
				createdAt: new Date(now),
				updatedAt: new Date(now),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to create budget: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'INSERT INTO budgets',
			);
		}
	}

	/**
	 * Find all budgets
	 */
	async findAllBudgets(): Promise<Budget[]> {
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT id, name, description, category_id, amount, currency, period, 
				       start_date, end_date, is_active, alert_thresholds, scenario_id, 
				       created_at, updated_at
				FROM budgets
				ORDER BY created_at DESC
			`);

			const rows = stmt.all() as Array<{
				id: string;
				name: string;
				description: string | null;
				category_id: string;
				amount: number;
				currency: string;
				period: string;
				start_date: string;
				end_date: string;
				is_active: number;
				alert_thresholds: string;
				scenario_id: string | null;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				categoryId: row.category_id,
				amount: row.amount,
				currency: row.currency,
				period: row.period as Budget['period'],
				startDate: new Date(row.start_date),
				endDate: new Date(row.end_date),
				isActive: row.is_active === 1,
				alertThresholds: JSON.parse(row.alert_thresholds) as number[],
				scenarioId: row.scenario_id || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch budgets: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM budgets',
			);
		}
	}

	/**
	 * Find budget by ID
	 */
	async findBudgetById(id: string): Promise<Budget | null> {
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT id, name, description, category_id, amount, currency, period, 
				       start_date, end_date, is_active, alert_thresholds, scenario_id, 
				       created_at, updated_at
				FROM budgets
				WHERE id = ?
			`);

			const row = stmt.get(id) as {
				id: string;
				name: string;
				description: string | null;
				category_id: string;
				amount: number;
				currency: string;
				period: string;
				start_date: string;
				end_date: string;
				is_active: number;
				alert_thresholds: string;
				scenario_id: string | null;
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
				categoryId: row.category_id,
				amount: row.amount,
				currency: row.currency,
				period: row.period as Budget['period'],
				startDate: new Date(row.start_date),
				endDate: new Date(row.end_date),
				isActive: row.is_active === 1,
				alertThresholds: JSON.parse(row.alert_thresholds) as number[],
				scenarioId: row.scenario_id || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch budget by ID: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM budgets WHERE id = ?',
				[id],
			);
		}
	}

	/**
	 * Find budgets by category
	 */
	async findBudgetsByCategory(categoryId: string): Promise<Budget[]> {
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT id, name, description, category_id, amount, currency, period, 
				       start_date, end_date, is_active, alert_thresholds, scenario_id, 
				       created_at, updated_at
				FROM budgets
				WHERE category_id = ?
				ORDER BY created_at DESC
			`);

			const rows = stmt.all(categoryId) as Array<{
				id: string;
				name: string;
				description: string | null;
				category_id: string;
				amount: number;
				currency: string;
				period: string;
				start_date: string;
				end_date: string;
				is_active: number;
				alert_thresholds: string;
				scenario_id: string | null;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				categoryId: row.category_id,
				amount: row.amount,
				currency: row.currency,
				period: row.period as Budget['period'],
				startDate: new Date(row.start_date),
				endDate: new Date(row.end_date),
				isActive: row.is_active === 1,
				alertThresholds: JSON.parse(row.alert_thresholds) as number[],
				scenarioId: row.scenario_id || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch budgets by category: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM budgets WHERE category_id = ?',
				[categoryId],
			);
		}
	}

	/**
	 * Update an existing budget
	 */
	async updateBudget(id: string, updates: Partial<Omit<Budget, 'id'>>): Promise<Budget | null> {
		try {
			const db = this.ensureConnection();

			// First check if budget exists
			const existing = await this.findBudgetById(id);
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
			if (updates.categoryId !== undefined) {
				updateFields.push('category_id = ?');
				params.push(updates.categoryId);
			}
			if (updates.amount !== undefined) {
				updateFields.push('amount = ?');
				params.push(updates.amount);
			}
			if (updates.currency !== undefined) {
				updateFields.push('currency = ?');
				params.push(updates.currency);
			}
			if (updates.period !== undefined) {
				updateFields.push('period = ?');
				params.push(updates.period);
			}
			if (updates.startDate !== undefined) {
				updateFields.push('start_date = ?');
				params.push(updates.startDate.toISOString());
			}
			if (updates.endDate !== undefined) {
				updateFields.push('end_date = ?');
				params.push(updates.endDate.toISOString());
			}
			if (updates.isActive !== undefined) {
				updateFields.push('is_active = ?');
				params.push(updates.isActive ? 1 : 0);
			}
			if (updates.alertThresholds !== undefined) {
				updateFields.push('alert_thresholds = ?');
				params.push(JSON.stringify(updates.alertThresholds));
			}
			if (updates.scenarioId !== undefined) {
				updateFields.push('scenario_id = ?');
				params.push(updates.scenarioId);
			}

			// Always update the updated_at timestamp
			updateFields.push('updated_at = ?');
			params.push(new Date().toISOString());

			// Add ID parameter for WHERE clause
			params.push(id);

			const stmt = db.prepare(`
				UPDATE budgets 
				SET ${updateFields.join(', ')}
				WHERE id = ?
			`);

			stmt.run(...params);

			// Return the updated budget
			return await this.findBudgetById(id);
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to update budget: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'UPDATE budgets',
				[id, updates],
			);
		}
	}

	/**
	 * Delete a budget by ID
	 */
	async deleteBudget(id: string): Promise<boolean> {
		try {
			const db = this.ensureConnection();

			// Start a transaction to ensure all operations succeed or fail together
			const transaction = db.transaction(() => {
				// 1. Delete budget alerts
				const deleteAlerts = db.prepare('DELETE FROM budget_alerts WHERE budget_id = ?');
				deleteAlerts.run(id);

				// 2. Delete the budget itself
				const deleteBudget = db.prepare('DELETE FROM budgets WHERE id = ?');
				const result = deleteBudget.run(id);

				return result.changes > 0;
			});

			// Execute the transaction
			return transaction();
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to delete budget: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'DELETE CASCADE budget and related data',
				[id],
			);
		}
	}

	// ===== BUDGET-SPECIFIC QUERIES =====

	/**
	 * Find active budgets
	 */
	async findActiveBudgets(): Promise<Budget[]> {
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT id, name, description, category_id, amount, currency, period, 
				       start_date, end_date, is_active, alert_thresholds, scenario_id, 
				       created_at, updated_at
				FROM budgets
				WHERE is_active = 1
				ORDER BY created_at DESC
			`);

			const rows = stmt.all() as Array<{
				id: string;
				name: string;
				description: string | null;
				category_id: string;
				amount: number;
				currency: string;
				period: string;
				start_date: string;
				end_date: string;
				is_active: number;
				alert_thresholds: string;
				scenario_id: string | null;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				categoryId: row.category_id,
				amount: row.amount,
				currency: row.currency,
				period: row.period as Budget['period'],
				startDate: new Date(row.start_date),
				endDate: new Date(row.end_date),
				isActive: row.is_active === 1,
				alertThresholds: JSON.parse(row.alert_thresholds) as number[],
				scenarioId: row.scenario_id || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch active budgets: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM budgets WHERE is_active = 1',
			);
		}
	}

	/**
	 * Find budgets from the active scenario only
	 */
	async findBudgetsByActiveScenario(): Promise<Budget[]> {
		try {
			const db = this.ensureConnection();

			// First, find the active scenario
			const activeScenarioStmt = db.prepare(`
				SELECT id FROM budget_scenarios WHERE is_active = 1 LIMIT 1
			`);
			const activeScenario = activeScenarioStmt.get() as { id: string } | undefined;

			let stmt;
			let rows;

			if (activeScenario) {
				// Get budgets from the active scenario
				stmt = db.prepare(`
					SELECT id, name, description, category_id, amount, currency, period, 
					       start_date, end_date, is_active, alert_thresholds, scenario_id, 
					       created_at, updated_at
					FROM budgets
					WHERE is_active = 1 AND scenario_id = ?
					ORDER BY created_at DESC
				`);
				rows = stmt.all(activeScenario.id);
			} else {
				// No active scenario, get budgets without scenario (legacy support)
				stmt = db.prepare(`
					SELECT id, name, description, category_id, amount, currency, period, 
					       start_date, end_date, is_active, alert_thresholds, scenario_id, 
					       created_at, updated_at
					FROM budgets
					WHERE is_active = 1 AND scenario_id IS NULL
					ORDER BY created_at DESC
				`);
				rows = stmt.all();
			}

			return (
				rows as Array<{
					id: string;
					name: string;
					description: string | null;
					category_id: string;
					amount: number;
					currency: string;
					period: string;
					start_date: string;
					end_date: string;
					is_active: number;
					alert_thresholds: string;
					scenario_id: string | null;
					created_at: string;
					updated_at: string;
				}>
			).map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				categoryId: row.category_id,
				amount: row.amount,
				currency: row.currency,
				period: row.period as Budget['period'],
				startDate: new Date(row.start_date),
				endDate: new Date(row.end_date),
				isActive: row.is_active === 1,
				alertThresholds: JSON.parse(row.alert_thresholds) as number[],
				scenarioId: row.scenario_id || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch budgets by active scenario: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM budgets with active scenario',
			);
		}
	}

	/**
	 * Find budgets by period date range
	 */
	async findBudgetsByPeriod(startDate: Date, endDate: Date): Promise<Budget[]> {
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT id, name, description, category_id, amount, currency, period, 
				       start_date, end_date, is_active, alert_thresholds, scenario_id, 
				       created_at, updated_at
				FROM budgets
				WHERE (start_date <= ? AND end_date >= ?) OR (start_date >= ? AND start_date <= ?)
				ORDER BY start_date ASC
			`);

			const endDateStr = endDate.toISOString();
			const startDateStr = startDate.toISOString();
			const rows = stmt.all(endDateStr, startDateStr, startDateStr, endDateStr) as Array<{
				id: string;
				name: string;
				description: string | null;
				category_id: string;
				amount: number;
				currency: string;
				period: string;
				start_date: string;
				end_date: string;
				is_active: number;
				alert_thresholds: string;
				scenario_id: string | null;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				categoryId: row.category_id,
				amount: row.amount,
				currency: row.currency,
				period: row.period as Budget['period'],
				startDate: new Date(row.start_date),
				endDate: new Date(row.end_date),
				isActive: row.is_active === 1,
				alertThresholds: JSON.parse(row.alert_thresholds) as number[],
				scenarioId: row.scenario_id || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch budgets by period: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM budgets (period range)',
				[startDate, endDate],
			);
		}
	}

	/**
	 * Find budgets by scenario
	 */
	async findBudgetsByScenario(scenarioId: string): Promise<Budget[]> {
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT id, name, description, category_id, amount, currency, period, 
				       start_date, end_date, is_active, alert_thresholds, scenario_id, 
				       created_at, updated_at
				FROM budgets
				WHERE scenario_id = ?
				ORDER BY created_at DESC
			`);

			const rows = stmt.all(scenarioId) as Array<{
				id: string;
				name: string;
				description: string | null;
				category_id: string;
				amount: number;
				currency: string;
				period: string;
				start_date: string;
				end_date: string;
				is_active: number;
				alert_thresholds: string;
				scenario_id: string | null;
				created_at: string;
				updated_at: string;
			}>;

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				categoryId: row.category_id,
				amount: row.amount,
				currency: row.currency,
				period: row.period as Budget['period'],
				startDate: new Date(row.start_date),
				endDate: new Date(row.end_date),
				isActive: row.is_active === 1,
				alertThresholds: JSON.parse(row.alert_thresholds) as number[],
				scenarioId: row.scenario_id || undefined,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			}));
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch budgets by scenario: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM budgets WHERE scenario_id = ?',
				[scenarioId],
			);
		}
	}

	/**
	 * Calculate budget progress for a specific budget
	 */
	async calculateBudgetProgress(budgetId: string): Promise<BudgetProgress | null> {
		try {
			const db = this.ensureConnection();

			// First get the budget
			const budget = await this.findBudgetById(budgetId);
			if (!budget) {
				return null;
			}

			// Determine effective period for calculation
			const now = new Date();
			const isIndefinite = budget.endDate.getFullYear() >= 9999;
			let effectiveStart = new Date(
				budget.startDate.getFullYear(),
				budget.startDate.getMonth(),
				budget.startDate.getDate(),
				0,
				0,
				0,
				0,
			);
			let effectiveEnd = new Date(
				budget.endDate.getFullYear(),
				budget.endDate.getMonth(),
				budget.endDate.getDate(),
				23,
				59,
				59,
				999,
			);
			if (isIndefinite) {
				if (budget.period === 'monthly') {
					// Current month window: 1st to last day of this month
					effectiveStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
					effectiveEnd = new Date(
						now.getFullYear(),
						now.getMonth() + 1,
						0,
						23,
						59,
						59,
						999,
					);
				} else {
					// Yearly: Jan 1 to Dec 31 of current year
					effectiveStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
					effectiveEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
				}
			}

			// Calculate current spending in this (effective) budget period
			const spendingStmt = db.prepare(`
				SELECT COALESCE(SUM(ABS(amount)), 0) as total_spent
				FROM transactions
				WHERE category_id = ? 
				  AND type = 'expense' 
				  AND date >= ? 
				  AND date <= ?
			`);

			const spendingResult = spendingStmt.get(
				budget.categoryId,
				effectiveStart.toISOString(),
				effectiveEnd.toISOString(),
			) as { total_spent: number };

			const currentSpent = spendingResult.total_spent;
			const remainingAmount = Math.max(0, budget.amount - currentSpent);
			const percentageSpent = budget.amount > 0 ? (currentSpent / budget.amount) * 100 : 0;

			// Calculate status
			let status: BudgetProgress['status'] = 'on-track';
			if (percentageSpent >= 100) {
				status = 'over-budget';
			} else if (percentageSpent >= 85) {
				status = 'at-risk';
			}

			// Calculate days remaining and projections
			const daysRemaining = Math.max(
				0,
				Math.ceil((effectiveEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
			);
			const totalDays = Math.ceil(
				(effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24),
			);
			const daysElapsed = Math.max(1, totalDays - daysRemaining);
			const averageDailySpend = currentSpent / daysElapsed;
			const projectedSpent =
				daysRemaining > 0 ? currentSpent + averageDailySpend * daysRemaining : currentSpent;

			// Get subscription costs for this category
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

			const subscriptionResult = subscriptionStmt.get(budget.categoryId) as {
				monthly_subscription_cost: number;
			};
			const monthlySubscriptionCost = subscriptionResult.monthly_subscription_cost;

			// Calculate subscription allocation for budget period
			const budgetMonths =
				(effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
			const subscriptionAllocated = monthlySubscriptionCost * budgetMonths;
			const variableSpent = Math.max(0, currentSpent - subscriptionAllocated);

			return {
				budgetId,
				budget,
				currentSpent,
				remainingAmount,
				percentageSpent,
				status,
				projectedSpent,
				daysRemaining,
				averageDailySpend,
				subscriptionAllocated,
				variableSpent,
				lastUpdated: new Date(),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to calculate budget progress: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT budget progress calculations',
				[budgetId],
			);
		}
	}

	/**
	 * Analyze historical spending for a category over specified months
	 */
	async analyzeHistoricalSpending(categoryId: string, months: number): Promise<SpendingAnalysis> {
		// Test implementation - should be tested for production use
		try {
			const db = this.ensureConnection();

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
			const averageMonthly =
				monthlyAmounts.reduce((sum, amount) => sum + amount, 0) /
				Math.max(1, monthlyAmounts.length);
			const minMonthly = Math.min(...monthlyAmounts, 0);
			const maxMonthly = Math.max(...monthlyAmounts, 0);

			// Calculate standard deviation
			const variance =
				monthlyAmounts.reduce((sum, amount) => {
					return sum + Math.pow(amount - averageMonthly, 2);
				}, 0) / Math.max(1, monthlyAmounts.length);
			const standardDeviation = Math.sqrt(variance);

			// Calculate simple trend
			let trend = 0;
			if (monthlyAmounts.length >= 2) {
				const firstHalf = monthlyAmounts.slice(0, Math.floor(monthlyAmounts.length / 2));
				const secondHalf = monthlyAmounts.slice(Math.floor(monthlyAmounts.length / 2));
				const firstAvg =
					firstHalf.reduce((sum, amount) => sum + amount, 0) / firstHalf.length;
				const secondAvg =
					secondHalf.reduce((sum, amount) => sum + amount, 0) / secondHalf.length;
				trend = secondAvg - firstAvg;
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

			const subscriptionResult = subscriptionStmt.get(categoryId) as {
				monthly_subscription_cost: number;
			};
			const subscriptionCosts = subscriptionResult.monthly_subscription_cost;
			const variableSpending = Math.max(0, averageMonthly - subscriptionCosts);

			// Calculate confidence based on data quality
			const dataQualityFactors = [
				Math.min(1, monthlyAmounts.length / 6),
				Math.min(1, transactions.length / 20),
				Math.max(0, 1 - standardDeviation / Math.max(1, averageMonthly)),
			];

			const confidence =
				dataQualityFactors.reduce((sum, factor) => sum + factor, 0) /
				dataQualityFactors.length;

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
				confidence: Math.max(0.1, Math.min(1, confidence)),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to analyze historical spending: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT historical spending analysis',
				[categoryId, months],
			);
		}
	}

	// ===== BUDGET SCENARIO MANAGEMENT =====

	/**
	 * Create a new budget scenario
	 */
	async createBudgetScenario(
		scenario: Omit<BudgetScenario, 'id' | 'budgets' | 'totalBudgeted'>,
	): Promise<BudgetScenario> {
		// Test implementation - should be tested for production use
		try {
			const db = this.ensureConnection();
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
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to create budget scenario: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'INSERT INTO budget_scenarios',
			);
		}
	}

	/**
	 * Find all budget scenarios
	 */
	async findAllBudgetScenarios(): Promise<BudgetScenario[]> {
		// Test implementation - should be tested for production use
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT id, name, description, is_active, created_at, updated_at
				FROM budget_scenarios
				ORDER BY created_at DESC
			`);

			const rows = stmt.all() as Array<{
				id: string;
				name: string;
				description: string | null;
				is_active: number;
				created_at: string;
				updated_at: string;
			}>;

			const scenarios: BudgetScenario[] = [];

			for (const row of rows) {
				// Get budgets for this scenario
				const budgets = await this.findBudgetsByScenario(row.id);
				const totalBudgeted = budgets.reduce((sum, budget) => sum + budget.amount, 0);

				scenarios.push({
					id: row.id,
					name: row.name,
					description: row.description || undefined,
					isActive: row.is_active === 1,
					budgets,
					totalBudgeted,
					createdAt: new Date(row.created_at),
					updatedAt: new Date(row.updated_at),
				});
			}

			return scenarios;
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch budget scenarios: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM budget_scenarios',
			);
		}
	}

	/**
	 * Find budget scenario by ID
	 */
	async findBudgetScenarioById(id: string): Promise<BudgetScenario | null> {
		// Test implementation - should be tested for production use
		try {
			const db = this.ensureConnection();
			const stmt = db.prepare(`
				SELECT id, name, description, is_active, created_at, updated_at
				FROM budget_scenarios
				WHERE id = ?
			`);

			const row = stmt.get(id) as {
				id: string;
				name: string;
				description: string | null;
				is_active: number;
				created_at: string;
				updated_at: string;
			} | null;

			if (!row) {
				return null;
			}

			// Get budgets for this scenario
			const budgets = await this.findBudgetsByScenario(row.id);
			const totalBudgeted = budgets.reduce((sum, budget) => sum + budget.amount, 0);

			return {
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				isActive: row.is_active === 1,
				budgets,
				totalBudgeted,
				createdAt: new Date(row.created_at),
				updatedAt: new Date(row.updated_at),
			};
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to fetch budget scenario by ID: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'SELECT FROM budget_scenarios WHERE id = ?',
				[id],
			);
		}
	}

	/**
	 * Update an existing budget scenario
	 */
	async updateBudgetScenario(
		id: string,
		updates: Partial<Omit<BudgetScenario, 'id' | 'budgets' | 'totalBudgeted'>>,
	): Promise<BudgetScenario | null> {
		// Test implementation - should be tested for production use
		return null; // TODO: Implement in Step 2.2
	}

	/**
	 * Delete a budget scenario by ID
	 */
	async deleteBudgetScenario(id: string): Promise<boolean> {
		// Test implementation - should be tested for production use
		return false; // TODO: Implement in Step 2.2
	}

	/**
	 * Activate a budget scenario
	 */
	async activateBudgetScenario(id: string): Promise<void> {
		try {
			const db = this.ensureConnection();

			// First, verify the scenario exists
			const scenario = await this.findBudgetScenarioById(id);
			if (!scenario) {
				throw new Error(`Budget scenario not found: ${id}`);
			}

			// Start a transaction to ensure atomicity
			db.exec('BEGIN TRANSACTION');

			try {
				// Set all scenarios to inactive
				const deactivateStmt = db.prepare(`
					UPDATE budget_scenarios 
					SET is_active = 0, updated_at = ?
				`);
				deactivateStmt.run(new Date().toISOString());

				// Activate the specified scenario
				const activateStmt = db.prepare(`
					UPDATE budget_scenarios 
					SET is_active = 1, updated_at = ?
					WHERE id = ?
				`);
				activateStmt.run(new Date().toISOString(), id);

				// Commit the transaction
				db.exec('COMMIT');
			} catch (error) {
				// Rollback on error
				db.exec('ROLLBACK');
				throw error;
			}
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.OPERATION_FAILED,
				`Failed to activate budget scenario: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	// ===== BUDGET ALERT MANAGEMENT =====

	/**
	 * Create a new budget alert
	 */
	async createBudgetAlert(alert: Omit<BudgetAlert, 'id'>): Promise<BudgetAlert> {
		// Test implementation - should be tested for production use
		try {
			const db = this.ensureConnection();
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
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to create budget alert: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				'INSERT INTO budget_alerts',
			);
		}
	}

	/**
	 * Find budget alerts
	 */
	async findBudgetAlerts(budgetId?: string): Promise<BudgetAlert[]> {
		// Test implementation - should be tested for production use
		return []; // TODO: Implement in Step 2.2
	}

	/**
	 * Find unread budget alerts
	 */
	async findUnreadBudgetAlerts(): Promise<BudgetAlert[]> {
		// Test implementation - should be tested for production use
		return []; // TODO: Implement in Step 2.2
	}

	/**
	 * Mark budget alert as read
	 */
	async markBudgetAlertAsRead(alertId: string): Promise<boolean> {
		// Test implementation - should be tested for production use
		return false; // TODO: Implement in Step 2.2
	}

	/**
	 * Delete a budget alert
	 */
	async deleteBudgetAlert(alertId: string): Promise<boolean> {
		// Test implementation - should be tested for production use
		return false; // TODO: Implement in Step 2.2
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
