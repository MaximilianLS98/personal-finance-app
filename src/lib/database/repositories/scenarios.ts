import { budgetTotals, comparableBudgetTotal } from '../../budget-totals';
import type { BudgetScenario } from '../../types';
import { DatabaseConnectionError } from '../connection';
import type { RepositoryContext } from '../repository-context';
import { DatabaseErrorType } from '../types';

export class ScenariosRepository {
	constructor(private readonly context: RepositoryContext) {}

	// ===== BUDGET SCENARIO MANAGEMENT =====

	/**
	 * Create a new budget scenario
	 */
	async createBudgetScenario(
		scenario: Omit<BudgetScenario, 'id' | 'budgets' | 'totalBudgeted' | 'createdAt' | 'updatedAt'>,
		copyFromScenarioId?: string,
	): Promise<BudgetScenario> {
		try {
			const db = this.context.connection();
			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			const stmt = db.prepare(`
				INSERT INTO budget_scenarios (id, name, description, is_active, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`);

			db.transaction(() => {
				if (
					copyFromScenarioId &&
					!db.query('SELECT 1 FROM budget_scenarios WHERE id=?').get(copyFromScenarioId)
				)
					throw new Error('Source scenario not found');
				if (scenario.isActive) db.prepare('UPDATE budget_scenarios SET is_active = 0').run();
				stmt.run(
					id,
					scenario.name,
					scenario.description || null,
					scenario.isActive ? 1 : 0,
					now,
					now,
				);
				if (copyFromScenarioId) {
					const sourceBudgets = db
						.query('SELECT id FROM budgets WHERE scenario_id=?')
						.all(copyFromScenarioId) as { id: string }[];
					for (const source of sourceBudgets) {
						const budgetId = crypto.randomUUID();
						db.query(
							`INSERT INTO budgets(id,name,description,category_id,amount,currency,period,start_date,end_date,is_active,alert_thresholds,scenario_id,created_at,updated_at)
                          SELECT ?,name || ' (Copy)',description,category_id,amount,currency,period,start_date,end_date,is_active,alert_thresholds,?,?,? FROM budgets WHERE id=?`,
						).run(budgetId, id, now, now, source.id);
						db.query(
							'INSERT INTO budget_cycle_settings(budget_id,payday,rollover) SELECT ?,payday,rollover FROM budget_cycle_settings WHERE budget_id=?',
						).run(budgetId, source.id);
					}
				}
			})();

			return (await this.findBudgetScenarioById(id))!;
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
		try {
			const db = this.context.connection();
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
				const budgets = await this.context.repository.findBudgetsByScenario(row.id);
				const totalBudgeted = comparableBudgetTotal(budgets);

				scenarios.push({
					id: row.id,
					name: row.name,
					description: row.description || undefined,
					isActive: row.is_active === 1,
					budgets,
					totalBudgeted,
					totals: budgetTotals(budgets),
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
		try {
			const db = this.context.connection();
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
			const budgets = await this.context.repository.findBudgetsByScenario(row.id);
			const totalBudgeted = comparableBudgetTotal(budgets);

			return {
				id: row.id,
				name: row.name,
				description: row.description || undefined,
				isActive: row.is_active === 1,
				budgets,
				totalBudgeted,
				totals: budgetTotals(budgets),
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
		updates: Partial<
			Omit<BudgetScenario, 'id' | 'budgets' | 'totalBudgeted' | 'createdAt' | 'updatedAt'>
		>,
	): Promise<BudgetScenario | null> {
		const existing = await this.findBudgetScenarioById(id);
		if (!existing) return null;
		const db = this.context.connection();
		db.transaction(() => {
			if (updates.isActive) db.prepare('UPDATE budget_scenarios SET is_active = 0').run();
			db.prepare(
				'UPDATE budget_scenarios SET name = ?, description = ?, is_active = ?, updated_at = ? WHERE id = ?',
			).run(
				updates.name ?? existing.name,
				updates.description ?? existing.description ?? null,
				(updates.isActive ?? existing.isActive) ? 1 : 0,
				new Date().toISOString(),
				id,
			);
		})();
		return this.findBudgetScenarioById(id);
	}

	/**
	 * Delete a budget scenario by ID
	 */
	async deleteBudgetScenario(id: string): Promise<boolean> {
		const scenario = await this.findBudgetScenarioById(id);
		if (!scenario) return false;
		if (scenario.isActive) throw new Error('Cannot delete active scenario');
		return (
			this.context.connection().prepare('DELETE FROM budget_scenarios WHERE id = ?').run(id)
				.changes > 0
		);
	}

	/**
	 * Activate a budget scenario
	 */
	async activateBudgetScenario(id: string): Promise<void> {
		try {
			const db = this.context.connection();

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
				DatabaseErrorType.TRANSACTION_FAILED,
				`Failed to activate budget scenario: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}
}
