import type {
	Budget,
	BudgetAlert,
	BudgetProgress,
	BudgetScenario,
	Category,
	CategoryRule,
	FinancialSummary,
	SpendingAnalysis,
	Subscription,
	SubscriptionPattern,
	Transaction,
	TransactionWithSubscription,
} from '../types';
import type { CreateManyResult, DuplicateInfo, PaginatedResult, PaginationOptions } from './types';

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
	createSubscriptionPattern(pattern: Omit<SubscriptionPattern, 'id'>): Promise<SubscriptionPattern>;
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
	categorySpendingInRange(
		categoryId: string,
		currency: string,
		start: Date,
		end: Date,
	): Promise<number>;
	analyzeHistoricalSpending(
		categoryId: string,
		months: number,
		currency?: string,
	): Promise<SpendingAnalysis>;

	// Budget scenario management
	createBudgetScenario(
		scenario: Omit<BudgetScenario, 'id' | 'budgets' | 'totalBudgeted' | 'createdAt' | 'updatedAt'>,
		copyFromScenarioId?: string,
	): Promise<BudgetScenario>;
	findAllBudgetScenarios(): Promise<BudgetScenario[]>;
	findBudgetScenarioById(id: string): Promise<BudgetScenario | null>;
	updateBudgetScenario(
		id: string,
		updates: Partial<
			Omit<BudgetScenario, 'id' | 'budgets' | 'totalBudgeted' | 'createdAt' | 'updatedAt'>
		>,
	): Promise<BudgetScenario | null>;
	deleteBudgetScenario(id: string): Promise<boolean>;
	activateBudgetScenario(id: string): Promise<void>;

	// Budget alert management
	createBudgetAlert(alert: Omit<BudgetAlert, 'id' | 'createdAt'>): Promise<BudgetAlert>;
	findBudgetAlerts(budgetId?: string): Promise<BudgetAlert[]>;
	findUnreadBudgetAlerts(): Promise<BudgetAlert[]>;
	markBudgetAlertAsRead(alertId: string): Promise<boolean>;
	deleteBudgetAlert(alertId: string): Promise<boolean>;

	// Database management
	initialize(): Promise<void>;
	close(): Promise<void>;
}
