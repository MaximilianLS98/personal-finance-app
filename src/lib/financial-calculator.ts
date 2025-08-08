/**
 * Financial calculation utilities for processing transaction data
 */

import { Transaction, FinancialSummary } from './types';

/**
 * Calculates the total income from an array of transactions
 * @param transactions Array of transactions to process
 * @returns Total income amount (sum of all positive amounts)
 */
export function calculateTotalIncome(transactions: Transaction[]): number {
	return transactions
		.filter((transaction) => transaction.type === 'income')
		.reduce((total, transaction) => total + transaction.amount, 0);
}

/**
 * Calculates the total expenses from an array of transactions
 * @param transactions Array of transactions to process
 * @returns Total expenses amount (sum of all negative amounts, returned as positive)
 */
export function calculateTotalExpenses(transactions: Transaction[]): number {
	return transactions
		.filter((transaction) => transaction.type === 'expense')
		.reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
}

/**
 * Calculates a complete financial summary from transactions
 * @param transactions Array of transactions to process
 * @returns FinancialSummary object with totals and counts
 */
export function calculateFinancialSummary(transactions: Transaction[]): FinancialSummary {
	const totalIncome = calculateTotalIncome(transactions);
	const totalExpenses = calculateTotalExpenses(transactions);

	return {
		totalIncome,
		totalExpenses,
		netAmount: totalIncome - totalExpenses,
		transactionCount: transactions.length,
	};
}

/**
 * Formats a number as currency with proper locale formatting
 * @param amount The amount to format
 * @param currency Currency code (default: 'NOK' for Norwegian Kroner)
 * @param locale Locale for formatting (default: 'nb-NO' for Norwegian)
 * @returns Formatted currency string
 */
export function formatCurrency(
	amount: number,
	currency: string = 'USD',
	locale: string = 'en-US',
): string {
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: currency,
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
}

/**
 * Formats a number as currency with simplified display (no currency symbol)
 * @param amount The amount to format
 * @param locale Locale for formatting (default: 'nb-NO' for Norwegian)
 * @returns Formatted number string with thousand separators
 */
export function formatAmount(amount: number, locale: string = 'en-US'): string {
	return new Intl.NumberFormat(locale, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
}
