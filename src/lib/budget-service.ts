/**
 * Budget Management Service
 * Core service layer for budget operations, integrating repository,
 * analytics engine, and suggestion generator for comprehensive budget management
 */

import type {
	Budget,
	BudgetProgress,
	BudgetSuggestion,
	BudgetScenario,
	BudgetAlert,
	CreateBudgetRequest,
	TransactionRepository,
	BudgetPeriod,
	VarianceAnalysis,
} from './types';

import { BudgetAnalyticsEngine } from './budget-analytics-engine';
import { BudgetSuggestionGenerator } from './budget-suggestion-generator';

export class BudgetService {
	private analyticsEngine: BudgetAnalyticsEngine;
	private suggestionGenerator: BudgetSuggestionGenerator;

	constructor(private repository: TransactionRepository) {
		this.analyticsEngine = new BudgetAnalyticsEngine(repository);
		this.suggestionGenerator = new BudgetSuggestionGenerator(repository);
	}

	// ===== BUDGET CRUD OPERATIONS =====

	/**
	 * Create a new budget with validation and suggestion integration
	 */
	async createBudget(request: CreateBudgetRequest): Promise<Budget> {
		// Test implementation - should be tested for production use
		try {
			// Validate the category exists
			const category = await this.repository.getCategoryById(request.categoryId);
			if (!category) {
				throw new Error(`Category not found: ${request.categoryId}`);
			}

			// Validate date range
			if (request.startDate >= request.endDate) {
				throw new Error('Start date must be before end date');
			}

			// If no scenario is specified, use the active scenario (or default)
			let scenarioId = request.scenarioId;
			if (!scenarioId) {
				// Find the active scenario
				const scenarios = await this.repository.findAllBudgetScenarios();
				const activeScenario = scenarios.find((s) => s.isActive);
				scenarioId = activeScenario?.id || 'default-scenario';
			}

			// Set defaults
			const budgetData: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'> = {
				name: request.name,
				description: request.description,
				categoryId: request.categoryId,
				amount: request.amount,
				currency: request.currency || 'NOK',
				period: request.period,
				startDate: request.startDate,
				endDate: request.endDate,
				isActive: true,
				alertThresholds: request.alertThresholds || [50, 75, 90, 100],
				scenarioId: scenarioId,
			};

			// Create the budget
			const budget = await this.repository.createBudget(budgetData);

			// Create initial alert thresholds if configured
			if (budget.alertThresholds.length > 0) {
				await this.createInitialAlerts(budget);
			}

			return budget;
		} catch (error) {
			throw new Error(
				`Failed to create budget: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	/**
	 * Get all budgets with optional filtering
	 */
	async getBudgets(options?: {
		categoryId?: string;
		scenarioId?: string;
		activeOnly?: boolean;
		dateRange?: { start: Date; end: Date };
	}): Promise<Budget[]> {
		// Test implementation - should be tested for production use
		try {
			let budgets: Budget[];

			if (options?.categoryId) {
				budgets = await this.repository.findBudgetsByCategory(options.categoryId);
			} else if (options?.scenarioId) {
				budgets = await this.repository.findBudgetsByScenario(options.scenarioId);
			} else if (options?.dateRange) {
				budgets = await this.repository.findBudgetsByPeriod(
					options.dateRange.start,
					options.dateRange.end,
				);
			} else {
				budgets = await this.repository.findAllBudgets();
			}

			// Apply additional filters
			if (options?.activeOnly) {
				budgets = budgets.filter((b) => b.isActive);
			}

			return budgets;
		} catch (error) {
			throw new Error(
				`Failed to fetch budgets: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	/**
	 * Get budget with current progress
	 */
	async getBudgetWithProgress(budgetId: string): Promise<{
		budget: Budget;
		progress: BudgetProgress;
	} | null> {
		// Test implementation - should be tested for production use
		try {
			const budget = await this.repository.findBudgetById(budgetId);
			if (!budget) {
				return null;
			}

			const progress = await this.repository.calculateBudgetProgress(budgetId);
			if (!progress) {
				throw new Error('Failed to calculate budget progress');
			}

			return { budget, progress };
		} catch (error) {
			throw new Error(
				`Failed to get budget with progress: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	/**
	 * Update an existing budget
	 */
	async updateBudget(
		budgetId: string,
		updates: Partial<Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>>,
	): Promise<Budget | null> {
		// Test implementation - should be tested for production use
		try {
			// Validate category if being updated
			if (updates.categoryId) {
				const category = await this.repository.getCategoryById(updates.categoryId);
				if (!category) {
					throw new Error(`Category not found: ${updates.categoryId}`);
				}
			}

			// Validate date range if being updated
			if (updates.startDate && updates.endDate && updates.startDate >= updates.endDate) {
				throw new Error('Start date must be before end date');
			}

			const updatedBudget = await this.repository.updateBudget(budgetId, updates);

			// Recalculate alerts if thresholds changed
			if (updatedBudget && updates.alertThresholds) {
				await this.updateBudgetAlerts(updatedBudget);
			}

			return updatedBudget;
		} catch (error) {
			throw new Error(
				`Failed to update budget: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	/**
	 * Delete a budget
	 */
	async deleteBudget(budgetId: string): Promise<boolean> {
		// Test implementation - should be tested for production use
		return await this.repository.deleteBudget(budgetId);
	}

	// ===== BUDGET ANALYTICS =====

	/**
	 * Get intelligent budget suggestions for a category
	 */
	async getBudgetSuggestions(
		categoryId: string,
		period: BudgetPeriod,
	): Promise<BudgetSuggestion> {
		// Test implementation - should be tested for production use
		return await this.suggestionGenerator.generateSuggestions(categoryId, period);
	}

	/**
	 * Analyze budget performance and variance
	 */
	async analyzeBudgetPerformance(budgetId: string): Promise<{
		budget: Budget;
		progress: BudgetProgress;
		variance: VarianceAnalysis;
		projection: {
			projectedEndDate: Date;
			projectedTotalSpent: number;
			riskLevel: 'low' | 'medium' | 'high';
			daysUntilDepletion: number | null;
			recommendedDailySpend: number;
		};
	}> {
		// Test implementation - should be tested for production use
		try {
			const budget = await this.repository.findBudgetById(budgetId);
			if (!budget) {
				throw new Error(`Budget not found: ${budgetId}`);
			}

			const [progress, variance, projection] = await Promise.all([
				this.repository.calculateBudgetProgress(budgetId),
				this.analyticsEngine.calculateBudgetVariance(budget),
				this.analyticsEngine.projectBudgetPerformance(budgetId),
			]);

			if (!progress) {
				throw new Error('Failed to calculate budget progress');
			}

			return {
				budget,
				progress,
				variance,
				projection,
			};
		} catch (error) {
			throw new Error(
				`Failed to analyze budget performance: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	/**
	 * Get dashboard data for all active budgets
	 */
	async getBudgetDashboardData(): Promise<{
		activeBudgets: Budget[];
		budgetProgress: Array<BudgetProgress>;
		totalBudgeted: number;
		totalSpent: number;
		overallStatus: 'on-track' | 'at-risk' | 'over-budget';
		alerts: BudgetAlert[];
	}> {
		// Test implementation - should be tested for production use
		try {
			const activeBudgets = await this.repository.findBudgetsByActiveScenario();

			// Get progress for all active budgets
			const progressPromises = activeBudgets.map((budget) =>
				this.repository.calculateBudgetProgress(budget.id),
			);

			const progressResults = await Promise.all(progressPromises);
			const budgetProgress = progressResults.filter((p) => p !== null) as BudgetProgress[];

			// Calculate totals
			const totalBudgeted = activeBudgets.reduce((sum, budget) => sum + budget.amount, 0);
			const totalSpent = budgetProgress.reduce(
				(sum, progress) => sum + progress.currentSpent,
				0,
			);

			// Determine overall status
			const overBudgetCount = budgetProgress.filter((p) => p.status === 'over-budget').length;
			const atRiskCount = budgetProgress.filter((p) => p.status === 'at-risk').length;

			let overallStatus: 'on-track' | 'at-risk' | 'over-budget' = 'on-track';
			if (overBudgetCount > 0) {
				overallStatus = 'over-budget';
			} else if (atRiskCount > activeBudgets.length * 0.3) {
				// More than 30% at risk
				overallStatus = 'at-risk';
			}

			// Get recent alerts
			const alerts = await this.repository.findUnreadBudgetAlerts();

			return {
				activeBudgets,
				budgetProgress,
				totalBudgeted,
				totalSpent,
				overallStatus,
				alerts,
			};
		} catch (error) {
			throw new Error(
				`Failed to get budget dashboard data: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	// ===== BUDGET SCENARIOS =====

	/**
	 * Create a new budget scenario
	 */
	async createBudgetScenario(
		name: string,
		description?: string,
		copyFromScenarioId?: string,
	): Promise<BudgetScenario> {
		// Test implementation - should be tested for production use
		try {
			const scenario = await this.repository.createBudgetScenario({
				name,
				description,
				isActive: false, // New scenarios start inactive
			});

			// Copy budgets from existing scenario if requested
			if (copyFromScenarioId) {
				await this.copyBudgetsToScenario(copyFromScenarioId, scenario.id);
			}

			return scenario;
		} catch (error) {
			throw new Error(
				`Failed to create budget scenario: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	/**
	 * Activate a budget scenario (deactivates others)
	 */
	async activateBudgetScenario(scenarioId: string): Promise<void> {
		// Test implementation - should be tested for production use
		await this.repository.activateBudgetScenario(scenarioId);
	}

	// ===== PRIVATE HELPER METHODS =====

	/**
	 * Create initial alert thresholds for a new budget
	 */
	private async createInitialAlerts(budget: Budget): Promise<void> {
		// Test implementation - should be tested for production use
		try {
			// Create threshold-based alerts
			const alertPromises = budget.alertThresholds.map((threshold) =>
				this.repository.createBudgetAlert({
					budgetId: budget.id,
					alertType: 'threshold',
					thresholdPercentage: threshold,
					message: `Budget alert: ${threshold}% of ${budget.name} budget reached`,
					isRead: false,
				}),
			);

			await Promise.all(alertPromises);
		} catch (error) {
			// Don't fail budget creation if alerts fail
			console.warn(`Failed to create initial alerts for budget ${budget.id}:`, error);
		}
	}

	/**
	 * Update budget alerts when thresholds change
	 */
	private async updateBudgetAlerts(budget: Budget): Promise<void> {
		// Test implementation - should be tested for production use
		try {
			// Get existing alerts for this budget
			const existingAlerts = await this.repository.findBudgetAlerts(budget.id);

			// Remove old threshold alerts
			const deletePromises = existingAlerts
				.filter((alert) => alert.alertType === 'threshold')
				.map((alert) => this.repository.deleteBudgetAlert(alert.id));

			await Promise.all(deletePromises);

			// Create new threshold alerts
			await this.createInitialAlerts(budget);
		} catch (error) {
			console.warn(`Failed to update alerts for budget ${budget.id}:`, error);
		}
	}

	/**
	 * Copy budgets from one scenario to another
	 */
	private async copyBudgetsToScenario(
		sourceScenarioId: string,
		targetScenarioId: string,
	): Promise<void> {
		// Test implementation - should be tested for production use
		try {
			const sourceBudgets = await this.repository.findBudgetsByScenario(sourceScenarioId);

			const copyPromises = sourceBudgets.map((budget) =>
				this.repository.createBudget({
					name: `${budget.name} (Copy)`,
					description: budget.description,
					categoryId: budget.categoryId,
					amount: budget.amount,
					currency: budget.currency,
					period: budget.period,
					startDate: budget.startDate,
					endDate: budget.endDate,
					isActive: budget.isActive,
					alertThresholds: budget.alertThresholds,
					scenarioId: targetScenarioId,
				}),
			);

			await Promise.all(copyPromises);
		} catch (error) {
			console.warn(`Failed to copy budgets to scenario ${targetScenarioId}:`, error);
		}
	}
}
