/**
 * Core data models and TypeScript interfaces for the CSV Finance Tracker
 */

/**
 * Represents a single financial transaction from CSV data
 */
export interface Transaction {
	/** Unique identifier for the transaction */
	id: string;
	/** Date when the transaction occurred */
	date: Date;
	/** Description or memo of the transaction */
	description: string;
	/** Transaction amount (positive for income, negative for expenses) */
	amount: number;
	/** Optional ISO 4217 currency code (e.g., 'NOK', 'USD') parsed from CSV if available */
	currency?: string;
	/** Type of transaction based on amount or detected patterns */
	type: 'income' | 'expense' | 'transfer';
	/** Category ID for expense categorization */
	categoryId?: string;
}

/**
 * Category for organizing transactions
 */
export interface Category {
	/** Unique identifier for the category */
	id: string;
	/** Display name of the category */
	name: string;
	/** Optional description */
	description?: string;
	/** Hex color code for UI display */
	color: string;
	/** Lucide icon name */
	icon: string;
	/** Parent category ID for subcategories */
	parentId?: string;
	/** Whether the category is active */
	isActive: boolean;
	/** Creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
}

/**
 * Rule for automatic categorization
 */
export interface CategoryRule {
	/** Unique identifier for the rule */
	id: string;
	/** Category this rule assigns to */
	categoryId: string;
	/** Pattern to match against transaction descriptions */
	pattern: string;
	/** Type of pattern matching */
	patternType: 'exact' | 'contains' | 'starts_with' | 'regex';
	/** Confidence score (0.0-1.0) */
	confidenceScore: number;
	/** Number of times this rule has been used */
	usageCount: number;
	/** Last time this rule was used */
	lastUsedAt?: Date;
	/** Whether rule was created by user or system */
	createdBy: 'user' | 'system';
	/** Whether the rule is active */
	isActive: boolean;
	/** Creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
}

/**
 * Category suggestion for a transaction
 */
export interface CategorySuggestion {
	/** Suggested category */
	category: Category;
	/** Confidence score for this suggestion */
	confidence: number;
	/** Rule that triggered this suggestion */
	rule?: CategoryRule;
	/** Reason for the suggestion */
	reason: string;
}

/**
 * Transaction with category information
 */
export interface TransactionWithCategory extends Transaction {
	/** Category information if assigned */
	category?: Category;
	/** Category suggestions if available */
	categorySuggestions?: CategorySuggestion[];
}

/**
 * Subscription model for recurring payments
 */
export interface Subscription {
	/** Unique identifier for the subscription */
	id: string;
	/** Name of the subscription service */
	name: string;
	/** Optional description */
	description?: string;
	/** Subscription amount per billing cycle */
	amount: number;
	/** Currency code (e.g., 'NOK', 'USD') */
	currency: string;
	/** How often the subscription bills */
	billingFrequency: 'monthly' | 'quarterly' | 'annually' | 'custom';
	/** Custom frequency in days (only used when billingFrequency is 'custom') */
	customFrequencyDays?: number;
	/** Next expected payment date */
	nextPaymentDate: Date;
	/** Category ID for this subscription */
	categoryId: string;
	/** Whether the subscription is currently active */
	isActive: boolean;
	/** When the subscription started */
	startDate: Date;
	/** When the subscription ended (if cancelled) */
	endDate?: Date;
	/** Optional notes about the subscription */
	notes?: string;
	/** Website URL for the service */
	website?: string;
	/** URL for cancelling the subscription */
	cancellationUrl?: string;
	/** Last time the subscription was used (if tracked) */
	lastUsedDate?: Date;
	/** User rating of subscription value (1-5 scale) */
	usageRating?: number;
	/** Creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
}

/**
 * Pattern for detecting subscription transactions
 */
export interface SubscriptionPattern {
	/** Unique identifier for the pattern */
	id: string;
	/** Subscription this pattern belongs to */
	subscriptionId: string;
	/** Pattern to match against transaction descriptions */
	pattern: string;
	/** Type of pattern matching */
	patternType: 'exact' | 'contains' | 'starts_with' | 'regex';
	/** Confidence score for this pattern (0.0-1.0) */
	confidenceScore: number;
	/** Whether pattern was created by user or system */
	createdBy: 'user' | 'system';
	/** Whether the pattern is active */
	isActive: boolean;
	/** Creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
}

/**
 * Enhanced transaction model with subscription information
 */
export interface TransactionWithSubscription extends Transaction {
	/** Whether this transaction is part of a subscription */
	isSubscription: boolean;
	/** Subscription ID if this is a subscription transaction */
	subscriptionId?: string;
	/** Subscription information if available */
	subscription?: Subscription;
}

/**
 * Aggregated financial data for summary display
 */
export interface FinancialSummary {
	/** Total income amount for the period */
	totalIncome: number;
	/** Total expenses amount for the period */
	totalExpenses: number;
	/** Net amount (income - expenses) */
	netAmount: number;
	/** Total number of transactions processed */
	transactionCount: number;
}

/**
 * Consistent error response format for API endpoints
 */
export interface ErrorResponse {
	/** Error type or code */
	error: string;
	/** Human-readable error message */
	message: string;
	/** Optional additional error details */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	details?: any;
}

/**
 * Budget period configuration
 */
export interface BudgetPeriod {
	/** Type of budget period */
	type: 'monthly' | 'yearly';
	/** Start date of the budget period */
	startDate: Date;
	/** End date of the budget period */
	endDate: Date;
}

/**
 * Budget entity for managing spending limits by category
 */
export interface Budget {
	/** Unique identifier for the budget */
	id: string;
	/** Display name of the budget */
	name: string;
	/** Optional description */
	description?: string;
	/** Category this budget applies to */
	categoryId: string;
	/** Budget amount */
	amount: number;
	/** Currency code */
	currency: string;
	/** Budget period type */
	period: 'monthly' | 'yearly';
	/** Start date of the budget */
	startDate: Date;
	/** End date of the budget */
	endDate: Date;
	/** Whether the budget is currently active */
	isActive: boolean;
	/** Alert threshold percentages (e.g., [50, 75, 90, 100]) */
	alertThresholds: number[];
	/** Optional scenario ID this budget belongs to */
	scenarioId?: string;
	/** Creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
}

/**
 * Budget progress tracking
 */
export interface BudgetProgress {
	/** Budget ID this progress relates to */
	budgetId: string;
	/** The budget this progress is for */
	budget: Budget;
	/** Current amount spent in this budget period */
	currentSpent: number;
	/** Remaining amount in budget */
	remainingAmount: number;
	/** Percentage of budget spent (0-100) */
	percentageSpent: number;
	/** Current budget status */
	status: BudgetStatus;
	/** Projected spending based on current velocity */
	projectedSpent: number;
	/** Days remaining in budget period */
	daysRemaining: number;
	/** Average daily spending rate */
	averageDailySpend: number;
	/** Amount allocated to subscription costs */
	subscriptionAllocated: number;
	/** Amount spent on variable expenses */
	variableSpent: number;
	/** When this progress was last calculated */
	lastUpdated: Date;
}

/**
 * Budget status indicators
 */
export type BudgetStatus = 'on-track' | 'at-risk' | 'over-budget';

/**
 * Budget suggestion with multiple options
 */
export interface BudgetSuggestion {
	/** Category this suggestion is for */
	categoryId: string;
	/** Category name */
	categoryName: string;
	/** Period this suggestion applies to */
	period: BudgetPeriod;
	/** Different suggestion tiers */
	suggestions: {
		conservative: BudgetAmount;
		moderate: BudgetAmount;
		aggressive: BudgetAmount;
	};
	/** Historical spending analysis */
	historicalData: {
		averageSpending: number;
		minSpending: number;
		maxSpending: number;
		standardDeviation: number;
		monthsAnalyzed: number;
	};
	/** Subscription cost breakdown for this category */
	subscriptionCosts: {
		fixedAmount: number;
		subscriptionCount: number;
	};
	/** Confidence level in suggestions (0-1) */
	confidence: number;
}

/**
 * Individual budget amount suggestion
 */
export interface BudgetAmount {
	/** Suggested budget amount */
	amount: number;
	/** Explanation for this suggestion */
	reasoning: string;
	/** Confidence in this specific suggestion (0-1) */
	confidence: number;
}

/**
 * Budget scenario for managing multiple budget sets
 */
export interface BudgetScenario {
	/** Unique identifier for the scenario */
	id: string;
	/** Display name of the scenario */
	name: string;
	/** Optional description */
	description?: string;
	/** Whether this scenario is currently active */
	isActive: boolean;
	/** Budgets belonging to this scenario */
	budgets: Budget[];
	/** Total amount budgeted across all budgets in scenario */
	totalBudgeted: number;
	/** Creation timestamp */
	createdAt: Date;
	/** Last update timestamp */
	updatedAt: Date;
}

/**
 * Budget alert for threshold notifications
 */
export interface BudgetAlert {
	/** Unique identifier for the alert */
	id: string;
	/** Budget this alert relates to */
	budgetId: string;
	/** Type of alert */
	alertType:
		| 'threshold'
		| 'projection'
		| 'exceeded'
		| 'large_transaction'
		| 'bulk_import'
		| 'subscription_added'
		| 'subscription_removed'
		| 'subscription_category_changed'
		| 'subscription_amount_changed'
		| 'subscription_frequency_changed'
		| 'subscription_renewal'
		| 'subscription_insufficient_budget';
	/** Threshold percentage that triggered this alert */
	thresholdPercentage?: number;
	/** Alert message */
	message: string;
	/** Whether user has seen this alert */
	isRead: boolean;
	/** When the alert was created */
	createdAt: Date;
}

/**
 * Historical spending analysis result
 */
export interface SpendingAnalysis {
	/** Category being analyzed */
	categoryId: string;
	/** Period analyzed */
	periodMonths: number;
	/** Average monthly spending */
	averageMonthly: number;
	/** Minimum monthly spending */
	minMonthly: number;
	/** Maximum monthly spending */
	maxMonthly: number;
	/** Standard deviation of monthly spending */
	standardDeviation: number;
	/** Spending trend (positive = increasing, negative = decreasing) */
	trend: number;
	/** Fixed subscription costs per month */
	subscriptionCosts: number;
	/** Variable spending per month (excluding subscriptions) */
	variableSpending: number;
	/** Confidence in analysis based on data quality */
	confidence: number;
}

/**
 * Budget variance analysis
 */
export interface VarianceAnalysis {
	/** Budget being analyzed */
	budgetId: string;
	/** Month-by-month variance data */
	monthlyVariances: MonthlyVariance[];
	/** Overall variance statistics */
	overallVariance: {
		averageVariance: number;
		totalOverspend: number;
		totalUnderspend: number;
		varianceStdDev: number;
	};
	/** Insights and patterns found */
	insights: string[];
}

/**
 * Monthly variance data
 */
export interface MonthlyVariance {
	/** Month and year */
	month: string;
	/** Budgeted amount for the month */
	budgeted: number;
	/** Actual spending for the month */
	actual: number;
	/** Variance amount (positive = over budget) */
	variance: number;
	/** Variance percentage */
	variancePercentage: number;
}

/**
 * Budget creation request
 */
export interface CreateBudgetRequest {
	/** Budget name */
	name: string;
	/** Optional description */
	description?: string;
	/** Category ID */
	categoryId: string;
	/** Budget amount */
	amount: number;
	/** Currency code */
	currency?: string;
	/** Budget period type */
	period: 'monthly' | 'yearly';
	/** Start date */
	startDate: Date;
	/** End date */
	endDate: Date;
	/** Alert thresholds */
	alertThresholds?: number[];
	/** Scenario ID if part of a scenario */
	scenarioId?: string;
}

/**
 * Transaction Repository Interface
 * Re-export from database/repository for type safety
 */
export interface TransactionRepository {
	// Core CRUD operations
	create(transaction: Omit<Transaction, 'id'>): Promise<Transaction>;
	findAll(): Promise<Transaction[]>;
	findById(id: string): Promise<Transaction | null>;
	findByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]>;
	calculateSummary(startDate?: Date, endDate?: Date): Promise<FinancialSummary>;

	// Category operations
	getCategories(): Promise<Category[]>;
	getCategoryById(id: string): Promise<Category | null>;

	// Subscription operations
	findAllSubscriptions(): Promise<Subscription[]>;
	findSubscriptionsByCategory(categoryId: string): Promise<Subscription[]>;

	// Budget operations
	createBudget(budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>): Promise<Budget>;
	findAllBudgets(): Promise<Budget[]>;
	findBudgetById(id: string): Promise<Budget | null>;
	findBudgetsByCategory(categoryId: string): Promise<Budget[]>;
	findActiveBudgets(): Promise<Budget[]>;
	findBudgetsByPeriod(startDate: Date, endDate: Date): Promise<Budget[]>;
	findBudgetsByScenario(scenarioId: string): Promise<Budget[]>;
	calculateBudgetProgress(budgetId: string): Promise<BudgetProgress | null>;
	analyzeHistoricalSpending(categoryId: string, months: number): Promise<SpendingAnalysis>;

	// Budget scenario operations
	createBudgetScenario(
		scenario: Omit<BudgetScenario, 'id' | 'budgets' | 'totalBudgeted'>,
	): Promise<BudgetScenario>;
	findAllBudgetScenarios(): Promise<BudgetScenario[]>;
	findBudgetScenarioById(id: string): Promise<BudgetScenario | null>;
	activateBudgetScenario(id: string): Promise<void>;

	// Budget alert operations
	createBudgetAlert(alert: Omit<BudgetAlert, 'id'>): Promise<BudgetAlert>;
	findBudgetAlerts(budgetId?: string): Promise<BudgetAlert[]>;
	findUnreadBudgetAlerts(): Promise<BudgetAlert[]>;
}
