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
	/** Type of transaction based on amount */
	type: 'income' | 'expense';
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
	details?: any;
}
