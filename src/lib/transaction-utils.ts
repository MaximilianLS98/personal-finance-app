/**
 * Utility functions for transaction processing and categorization
 */

/**
 * Patterns to detect Revolut internal transfers
 * These are typically transfers between the user's own accounts
 */
const REVOLUT_PATTERNS = [
	/REVOLUT\*\*\d+/i,                    // REVOLUT**2775
	/CRV\*REVOLUT\*\*\d+/i,              // CRV*REVOLUT**3832
	/REVOLUT.*\*\*\d+/i,                  // Any REVOLUT variant with **numbers
	/^REVOLUT/i,                          // Starts with REVOLUT
	/\bREVOLUT\b/i,                       // REVOLUT as a whole word
];

/**
 * Additional patterns for other internal transfer services
 * Can be extended as needed
 */
const INTERNAL_TRANSFER_PATTERNS = [
	...REVOLUT_PATTERNS,
	/PAYPAL\s+TRANSFER/i,                 // PayPal transfers
	/WISE\s+TRANSFER/i,                   // Wise (formerly TransferWise)
	/INTERNAL\s+TRANSFER/i,               // Generic internal transfer
];

/**
 * Detects if a transaction description indicates a Revolut internal transfer
 * @param description - The transaction description to analyze
 * @returns true if the transaction appears to be a Revolut transfer
 */
export function isRevolutTransfer(description: string): boolean {
	if (!description || typeof description !== 'string') {
		return false;
	}

	return REVOLUT_PATTERNS.some(pattern => pattern.test(description.trim()));
}

/**
 * Detects if a transaction description indicates any kind of internal transfer
 * @param description - The transaction description to analyze
 * @returns true if the transaction appears to be an internal transfer
 */
export function isInternalTransfer(description: string): boolean {
	if (!description || typeof description !== 'string') {
		return false;
	}

	return INTERNAL_TRANSFER_PATTERNS.some(pattern => pattern.test(description.trim()));
}

/**
 * Determines the correct transaction type based on amount and description
 * @param amount - The transaction amount
 * @param description - The transaction description
 * @returns The appropriate transaction type
 */
export function determineTransactionType(amount: number, description: string): 'income' | 'expense' | 'transfer' {
	// First check if it's an internal transfer
	if (isInternalTransfer(description)) {
		return 'transfer';
	}

	// Otherwise categorize based on amount
	return amount >= 0 ? 'income' : 'expense';
}

/**
 * Gets a display-friendly description for transaction types
 * @param type - The transaction type
 * @returns A human-readable description
 */
export function getTransactionTypeLabel(type: 'income' | 'expense' | 'transfer'): string {
	switch (type) {
		case 'income':
			return 'Income';
		case 'expense':
			return 'Expense';
		case 'transfer':
			return 'Transfer';
		default:
			return 'Unknown';
	}
}

/**
 * Gets appropriate styling classes for transaction types
 * @param type - The transaction type
 * @returns CSS classes for styling
 */
export function getTransactionTypeStyle(type: 'income' | 'expense' | 'transfer'): {
	badgeClass: string;
	amountClass: string;
} {
	switch (type) {
		case 'income':
			return {
				badgeClass: 'bg-green-100 text-green-800',
				amountClass: 'text-green-600'
			};
		case 'expense':
			return {
				badgeClass: 'bg-red-100 text-red-800',
				amountClass: 'text-red-600'
			};
		case 'transfer':
			return {
				badgeClass: 'bg-blue-100 text-blue-800',
				amountClass: 'text-blue-600'
			};
		default:
			return {
				badgeClass: 'bg-gray-100 text-gray-800',
				amountClass: 'text-gray-600'
			};
	}
}