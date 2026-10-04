import { currencyCode } from '../../money';
import { budgetForecast, spendingSource } from '../../planning';
import type { Budget, BudgetProgress, SpendingAnalysis } from '../../types';
import { DatabaseConnectionError } from '../connection';
import type { RepositoryContext } from '../repository-context';
import { DatabaseErrorType } from '../types';

export class BudgetsRepository {
	constructor(private readonly context: RepositoryContext) {}

	// ===== BUDGET CRUD OPERATIONS =====

	/**
	 * Create a new budget
	 */
	async createBudget(budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>): Promise<Budget> {
		try {
			const db = this.context.connection();
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
				`Failed to create budget: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'INSERT INTO budgets',
			);
		}
	}

	/**
	 * Find all budgets
	 */
	async findAllBudgets(): Promise<Budget[]> {
		try {
			const db = this.context.connection();
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
				`Failed to fetch budgets: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'SELECT FROM budgets',
			);
		}
	}

	/**
	 * Find budget by ID
	 */
	async findBudgetById(id: string): Promise<Budget | null> {
		try {
			const db = this.context.connection();
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
				`Failed to fetch budget by ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
			const db = this.context.connection();
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
			const db = this.context.connection();

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
				`Failed to update budget: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
			const db = this.context.connection();

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
				`Failed to delete budget: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
			const db = this.context.connection();
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
			const db = this.context.connection();

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
			const db = this.context.connection();
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
			const db = this.context.connection();
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
		const budget = await this.findBudgetById(budgetId);
		return budget ? budgetForecast(this.context.connection(), budget) : null;
	}

	/**
	 * Analyze historical spending for a category over specified months
	 */
	async categorySpendingInRange(
		categoryId: string,
		currency: string,
		start: Date,
		end: Date,
	): Promise<number> {
		const db = this.context.connection();
		return (
			db
				.query(
					`SELECT COALESCE(SUM(-amount),0) AS total FROM ${spendingSource(db)} WHERE category_id=? AND type='expense' AND UPPER(COALESCE(NULLIF(TRIM(currency),''),'UNKNOWN'))=? AND substr(date,1,10)>=? AND substr(date,1,10)<=?`,
				)
				.get(
					categoryId,
					currencyCode(currency),
					start.toISOString().slice(0, 10),
					end.toISOString().slice(0, 10),
				) as { total: number }
		).total;
	}
	async analyzeHistoricalSpending(
		categoryId: string,
		months: number,
		currency = 'UNKNOWN',
	): Promise<SpendingAnalysis> {
		try {
			const db = this.context.connection();

			// Calculate date range for analysis
			const endDate = new Date();
			const startDate = new Date();
			startDate.setMonth(startDate.getMonth() - months);

			// Get transaction data for the category
			const transactionStmt = db.prepare(`
				SELECT amount, date
				FROM ${spendingSource(db)}
				WHERE category_id = ?
				  AND type = 'expense'
                  AND UPPER(COALESCE(NULLIF(TRIM(currency),''),'UNKNOWN')) = ?
				  AND substr(date,1,10) >= ?
				  AND substr(date,1,10) <= ?
				ORDER BY date ASC
			`);

			const transactions = transactionStmt.all(
				categoryId,
				currencyCode(currency),
				startDate.toISOString().slice(0, 10),
				endDate.toISOString().slice(0, 10),
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
				monthlySpending.set(monthKey, current - transaction.amount);
			}

			// Calculate monthly statistics
			const monthlyAmounts = Array.from(monthlySpending.values());
			const averageMonthly =
				monthlyAmounts.reduce((sum, amount) => sum + amount, 0) /
				Math.max(1, monthlyAmounts.length);
			const minMonthly = Math.min(...monthlyAmounts);
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
				const firstAvg = firstHalf.reduce((sum, amount) => sum + amount, 0) / firstHalf.length;
				const secondAvg = secondHalf.reduce((sum, amount) => sum + amount, 0) / secondHalf.length;
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
				WHERE category_id = ? AND is_active = 1 AND UPPER(COALESCE(NULLIF(TRIM(currency),''),'UNKNOWN')) = ?
			`);

			const subscriptionResult = subscriptionStmt.get(categoryId, currencyCode(currency)) as {
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
				dataQualityFactors.reduce((sum, factor) => sum + factor, 0) / dataQualityFactors.length;

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
}
