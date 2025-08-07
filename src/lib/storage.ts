/**
 * Simple in-memory storage for transaction data
 * This is a temporary solution for the initial version
 */

import { Transaction } from './types';

/**
 * In-memory storage for transactions
 */
let transactionStorage: Transaction[] = [];

/**
 * Store transactions in memory
 * @param transactions Array of transactions to store
 */
export function storeTransactions(transactions: Transaction[]): void {
	transactionStorage = [...transactions];
}

/**
 * Retrieve all stored transactions
 * @returns Array of stored transactions
 */
export function getStoredTransactions(): Transaction[] {
	return [...transactionStorage];
}

/**
 * Clear all stored transactions
 */
export function clearStoredTransactions(): void {
	transactionStorage = [];
}

/**
 * Check if there are any stored transactions
 * @returns True if transactions exist, false otherwise
 */
export function hasStoredTransactions(): boolean {
	return transactionStorage.length > 0;
}
