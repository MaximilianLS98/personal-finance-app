import type { FinancialSummary, Transaction } from '../../types';
import { DatabaseConnectionError } from '../connection';
import type { RepositoryContext } from '../repository-context';
import type { CreateManyResult, DuplicateInfo, PaginatedResult, PaginationOptions } from '../types';
import { DatabaseErrorType } from '../types';

export class TransactionsRepository {
	constructor(private readonly context: RepositoryContext) {}

	/**
	 * Create a single transaction with enhanced duplicate detection
	 */
	async create(transaction: Omit<Transaction, 'id'>): Promise<Transaction> {
		try {
			const db = this.context.connection();
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
				...transaction,
				id,
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
				`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
					(dup) =>
						`${dup.date.toISOString()}-${dup.description}-${dup.amount}-${dup.currency || ''}`,
				),
			);

			const db = this.context.connection();

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
					}-${transaction.amount}-${transaction.currency || ''}`;

					// Check if this transaction is a known duplicate
					if (duplicateSet.has(transactionKey)) {
						const identifier = `${transaction.date.toLocaleDateString()}: ${
							transaction.description
						} (${transaction.type === 'income' ? '+' : ''}${transaction.amount.toFixed(2)})`;

						duplicates.push({
							date: transaction.date,
							currency: transaction.currency,
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
							...transaction,
							id,
						});
					} catch (error) {
						// Handle constraint violations (duplicates detected at database level)
						if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
							const identifier = `${transaction.date.toLocaleDateString()}: ${
								transaction.description
							} (${transaction.type === 'income' ? '+' : ''}${transaction.amount.toFixed(2)})`;

							duplicates.push({
								date: transaction.date,
								currency: transaction.currency,
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
			const db = this.context.connection();
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
				`Failed to fetch transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'SELECT FROM transactions',
			);
		}
	}

	/**
	 * Find transactions with pagination, filtering, and sorting
	 */
	async findWithPagination(options: PaginationOptions): Promise<PaginatedResult<Transaction>> {
		try {
			const db = this.context.connection();
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

			if (
				!Number.isInteger(page) ||
				page < 1 ||
				!Number.isInteger(limit) ||
				limit < 1 ||
				limit > 1000
			)
				throw new Error('Invalid pagination');

			// Calculate offset
			const offset = (page - 1) * limit;

			// Build WHERE clause
			const conditions: string[] = [];
			const params: (string | number)[] = [];

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
						`EXISTS(SELECT 1 FROM effective_transactions e WHERE e.id=t.id AND (e.category_id IN (${placeholders}) OR e.category_id IS NULL))`,
					);
					params.push(...categoryIds);
				} else {
					conditions.push(
						`EXISTS(SELECT 1 FROM effective_transactions e WHERE e.id=t.id AND e.category_id IN (${placeholders}))`,
					);
					params.push(...categoryIds);
				}
			} else if (includeUncategorized) {
				// Only uncategorized
				conditions.push(
					'EXISTS(SELECT 1 FROM effective_transactions e WHERE e.id=t.id AND e.category_id IS NULL)',
				);
			}

			const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

			// Build ORDER BY clause
			const validSortFields = ['date', 'description', 'amount', 'type'];
			const sortField = validSortFields.includes(sortBy) ? sortBy : 'date';
			const direction = sortOrder === 'ASC' ? 'ASC' : 'DESC';
			const orderByClause = `ORDER BY t.${sortField} ${direction}, t.created_at ${direction}`;

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
			const db = this.context.connection();
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
			const db = this.context.connection();
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
		if (startDate && endDate && startDate > endDate)
			throw new Error('Invalid date range: start date must be before or equal to end date');
		const db = this.context.connection();
		const rows = db
			.query(
				`SELECT COALESCE(currency,'UNKNOWN') currency,
		COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) totalIncome,
		COALESCE(SUM(CASE WHEN type='expense' THEN -amount ELSE 0 END),0) totalExpenses,
		COUNT(DISTINCT id) transactionCount FROM effective_transactions
		WHERE (? IS NULL OR date>=?) AND (? IS NULL OR date<=?) GROUP BY COALESCE(currency,'UNKNOWN')`,
			)
			.all(
				startDate?.toISOString() || null,
				startDate?.toISOString() || null,
				endDate?.toISOString() || null,
				endDate?.toISOString() || null,
			) as { totalIncome: number; totalExpenses: number; transactionCount: number }[];
		if (rows.length > 1)
			throw new Error('Choose a single currency; use per-currency summaries for mixed history');
		const row = rows[0] || { totalIncome: 0, totalExpenses: 0, transactionCount: 0 };
		return {
			totalIncome: row.totalIncome,
			totalExpenses: row.totalExpenses,
			transactionCount: row.transactionCount,
			netAmount: row.totalIncome - row.totalExpenses,
		};
	}

	/**
	 * Check for duplicate transactions and return detailed information
	 */
	async checkDuplicates(transactions: Omit<Transaction, 'id'>[]): Promise<DuplicateInfo[]> {
		if (transactions.length === 0) {
			return [];
		}

		try {
			const db = this.context.connection();
			const duplicates: DuplicateInfo[] = [];
			const stmt = db.prepare(`
				SELECT id FROM transactions
				WHERE date = ? AND description = ? AND amount = ? AND COALESCE(currency,'') = ?
				LIMIT 1
			`);

			for (const transaction of transactions) {
				const existing = stmt.get(
					transaction.date.toISOString(),
					transaction.description,
					transaction.amount,
					transaction.currency || '',
				);

				if (existing) {
					const identifier = `${transaction.date.toLocaleDateString()}: ${
						transaction.description
					} (${transaction.type === 'income' ? '+' : ''}${transaction.amount.toFixed(2)})`;

					duplicates.push({
						date: transaction.date,
						currency: transaction.currency,
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
				`Failed to check duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'SELECT FROM transactions (duplicate check)',
			);
		}
	}

	/**
	 * Update an existing transaction
	 */
	async update(id: string, updates: Partial<Omit<Transaction, 'id'>>): Promise<Transaction | null> {
		try {
			const db = this.context.connection();

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
				`Failed to update transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
			const db = this.context.connection();

			const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
			const result = stmt.run(id);

			// Check if any rows were affected
			return result.changes > 0;
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to delete transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'DELETE FROM transactions',
				[id],
			);
		}
	}
}
