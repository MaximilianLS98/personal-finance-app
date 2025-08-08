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
