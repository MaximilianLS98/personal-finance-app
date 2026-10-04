import { getConnectionManager, type SQLiteConnectionManager } from './connection';
import type { TransactionRepository } from './contracts';
import { AlertsRepository } from './repositories/alerts';
import { BudgetsRepository } from './repositories/budgets';
import { CategoriesRepository } from './repositories/categories';
import { ScenariosRepository } from './repositories/scenarios';
import { SubscriptionsRepository } from './repositories/subscriptions';
import { TransactionsRepository } from './repositories/transactions';
import { RepositoryContext } from './repository-context';
export type { TransactionRepository } from './contracts';

/** Compatibility facade. Domain repositories share a connection owned by the manager. */
export class SQLiteTransactionRepository implements TransactionRepository {
	private readonly context = new RepositoryContext();
	constructor(private readonly manager: SQLiteConnectionManager = getConnectionManager()) {
		this.context.repository = this;
	}
	async initialize(): Promise<void> {
		await this.manager.initialize();
		await this.manager.runMigrations();
		this.context.db = this.manager.getConnection();
	}
	/** Release this facade; other requests keep using the process-owned connection. */
	async close(): Promise<void> {
		this.context.db = null;
	}
	private readonly transactions = new TransactionsRepository(this.context);
	create = this.transactions.create.bind(this.transactions);
	createMany = this.transactions.createMany.bind(this.transactions);
	findAll = this.transactions.findAll.bind(this.transactions);
	findWithPagination = this.transactions.findWithPagination.bind(this.transactions);
	findById = this.transactions.findById.bind(this.transactions);
	findByDateRange = this.transactions.findByDateRange.bind(this.transactions);
	calculateSummary = this.transactions.calculateSummary.bind(this.transactions);
	checkDuplicates = this.transactions.checkDuplicates.bind(this.transactions);
	update = this.transactions.update.bind(this.transactions);
	delete = this.transactions.delete.bind(this.transactions);
	private readonly categories = new CategoriesRepository(this.context);
	getCategories = this.categories.getCategories.bind(this.categories);
	getCategoryById = this.categories.getCategoryById.bind(this.categories);
	getCategoryRules = this.categories.getCategoryRules.bind(this.categories);
	createCategoryRule = this.categories.createCategoryRule.bind(this.categories);
	createCategory = this.categories.createCategory.bind(this.categories);
	updateCategory = this.categories.updateCategory.bind(this.categories);
	deleteCategory = this.categories.deleteCategory.bind(this.categories);
	deleteCategoryRule = this.categories.deleteCategoryRule.bind(this.categories);
	updateRuleUsage = this.categories.updateRuleUsage.bind(this.categories);
	private readonly subscriptions = new SubscriptionsRepository(this.context);
	createSubscription = this.subscriptions.createSubscription.bind(this.subscriptions);
	findAllSubscriptions = this.subscriptions.findAllSubscriptions.bind(this.subscriptions);
	findSubscriptionById = this.subscriptions.findSubscriptionById.bind(this.subscriptions);
	findSubscriptionsByCategory = this.subscriptions.findSubscriptionsByCategory.bind(
		this.subscriptions,
	);
	updateSubscription = this.subscriptions.updateSubscription.bind(this.subscriptions);
	deleteSubscription = this.subscriptions.deleteSubscription.bind(this.subscriptions);
	findActiveSubscriptions = this.subscriptions.findActiveSubscriptions.bind(this.subscriptions);
	findUpcomingPayments = this.subscriptions.findUpcomingPayments.bind(this.subscriptions);
	calculateTotalMonthlyCost = this.subscriptions.calculateTotalMonthlyCost.bind(this.subscriptions);
	findUnusedSubscriptions = this.subscriptions.findUnusedSubscriptions.bind(this.subscriptions);
	createSubscriptionPattern = this.subscriptions.createSubscriptionPattern.bind(this.subscriptions);
	findPatternsBySubscription = this.subscriptions.findPatternsBySubscription.bind(
		this.subscriptions,
	);
	updatePatternUsage = this.subscriptions.updatePatternUsage.bind(this.subscriptions);
	deleteSubscriptionPattern = this.subscriptions.deleteSubscriptionPattern.bind(this.subscriptions);
	flagTransactionAsSubscription = this.subscriptions.flagTransactionAsSubscription.bind(
		this.subscriptions,
	);
	unflagTransactionAsSubscription = this.subscriptions.unflagTransactionAsSubscription.bind(
		this.subscriptions,
	);
	findSubscriptionTransactions = this.subscriptions.findSubscriptionTransactions.bind(
		this.subscriptions,
	);
	private readonly budgets = new BudgetsRepository(this.context);
	createBudget = this.budgets.createBudget.bind(this.budgets);
	findAllBudgets = this.budgets.findAllBudgets.bind(this.budgets);
	findBudgetById = this.budgets.findBudgetById.bind(this.budgets);
	findBudgetsByCategory = this.budgets.findBudgetsByCategory.bind(this.budgets);
	updateBudget = this.budgets.updateBudget.bind(this.budgets);
	deleteBudget = this.budgets.deleteBudget.bind(this.budgets);
	findActiveBudgets = this.budgets.findActiveBudgets.bind(this.budgets);
	findBudgetsByActiveScenario = this.budgets.findBudgetsByActiveScenario.bind(this.budgets);
	findBudgetsByPeriod = this.budgets.findBudgetsByPeriod.bind(this.budgets);
	findBudgetsByScenario = this.budgets.findBudgetsByScenario.bind(this.budgets);
	calculateBudgetProgress = this.budgets.calculateBudgetProgress.bind(this.budgets);
	categorySpendingInRange = this.budgets.categorySpendingInRange.bind(this.budgets);
	analyzeHistoricalSpending = this.budgets.analyzeHistoricalSpending.bind(this.budgets);
	private readonly scenarios = new ScenariosRepository(this.context);
	createBudgetScenario = this.scenarios.createBudgetScenario.bind(this.scenarios);
	findAllBudgetScenarios = this.scenarios.findAllBudgetScenarios.bind(this.scenarios);
	findBudgetScenarioById = this.scenarios.findBudgetScenarioById.bind(this.scenarios);
	updateBudgetScenario = this.scenarios.updateBudgetScenario.bind(this.scenarios);
	deleteBudgetScenario = this.scenarios.deleteBudgetScenario.bind(this.scenarios);
	activateBudgetScenario = this.scenarios.activateBudgetScenario.bind(this.scenarios);
	private readonly alerts = new AlertsRepository(this.context);
	createBudgetAlert = this.alerts.createBudgetAlert.bind(this.alerts);
	findBudgetAlerts = this.alerts.findBudgetAlerts.bind(this.alerts);
	findUnreadBudgetAlerts = this.alerts.findUnreadBudgetAlerts.bind(this.alerts);
	markBudgetAlertAsRead = this.alerts.markBudgetAlertAsRead.bind(this.alerts);
	deleteBudgetAlert = this.alerts.deleteBudgetAlert.bind(this.alerts);
}

export function createTransactionRepository(): TransactionRepository {
	return new SQLiteTransactionRepository();
}
