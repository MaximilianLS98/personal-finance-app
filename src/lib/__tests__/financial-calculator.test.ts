/**
 * Unit tests for financial calculation utilities
 */

import {
	calculateTotalIncome,
	calculateTotalExpenses,
	calculateFinancialSummary,
	formatCurrency,
	formatAmount,
} from '../financial-calculator';
import { Transaction } from '../types';

// Mock transaction data for testing
const mockTransactions: Transaction[] = [
	{
		id: '1',
		date: new Date('2024-01-01'),
		description: 'Salary',
		amount: 50000,
		type: 'income',
	},
	{
		id: '2',
		date: new Date('2024-01-02'),
		description: 'Freelance work',
		amount: 15000,
		type: 'income',
	},
	{
		id: '3',
		date: new Date('2024-01-03'),
		description: 'Grocery shopping',
		amount: -800,
		type: 'expense',
	},
	{
		id: '4',
		date: new Date('2024-01-04'),
		description: 'Rent payment',
		amount: -12000,
		type: 'expense',
	},
	{
		id: '5',
		date: new Date('2024-01-05'),
		description: 'Utilities',
		amount: -2500,
		type: 'expense',
	},
];

describe('calculateTotalIncome', () => {
	it('should calculate total income correctly', () => {
		const result = calculateTotalIncome(mockTransactions);
		expect(result).toBe(65000); // 50000 + 15000
	});

	it('should return 0 for empty transactions array', () => {
		const result = calculateTotalIncome([]);
		expect(result).toBe(0);
	});

	it('should return 0 when no income transactions exist', () => {
		const expenseOnlyTransactions: Transaction[] = [
			{
				id: '1',
				date: new Date('2024-01-01'),
				description: 'Expense',
				amount: -1000,
				type: 'expense',
			},
		];
		const result = calculateTotalIncome(expenseOnlyTransactions);
		expect(result).toBe(0);
	});

	it('should handle only income transactions', () => {
		const incomeOnlyTransactions: Transaction[] = [
			{
				id: '1',
				date: new Date('2024-01-01'),
				description: 'Income 1',
				amount: 1000,
				type: 'income',
			},
			{
				id: '2',
				date: new Date('2024-01-02'),
				description: 'Income 2',
				amount: 2000,
				type: 'income',
			},
		];
		const result = calculateTotalIncome(incomeOnlyTransactions);
		expect(result).toBe(3000);
	});
});

describe('calculateTotalExpenses', () => {
	it('should calculate total expenses correctly', () => {
		const result = calculateTotalExpenses(mockTransactions);
		expect(result).toBe(15300); // 800 + 12000 + 2500 (all as positive values)
	});

	it('should return 0 for empty transactions array', () => {
		const result = calculateTotalExpenses([]);
		expect(result).toBe(0);
	});

	it('should return 0 when no expense transactions exist', () => {
		const incomeOnlyTransactions: Transaction[] = [
			{
				id: '1',
				date: new Date('2024-01-01'),
				description: 'Income',
				amount: 1000,
				type: 'income',
			},
		];
		const result = calculateTotalExpenses(incomeOnlyTransactions);
		expect(result).toBe(0);
	});

	it('should handle only expense transactions', () => {
		const expenseOnlyTransactions: Transaction[] = [
			{
				id: '1',
				date: new Date('2024-01-01'),
				description: 'Expense 1',
				amount: -1000,
				type: 'expense',
			},
			{
				id: '2',
				date: new Date('2024-01-02'),
				description: 'Expense 2',
				amount: -2000,
				type: 'expense',
			},
		];
		const result = calculateTotalExpenses(expenseOnlyTransactions);
		expect(result).toBe(3000);
	});
});

describe('calculateFinancialSummary', () => {
	it('should calculate complete financial summary correctly', () => {
		const result = calculateFinancialSummary(mockTransactions);

		expect(result.totalIncome).toBe(65000);
		expect(result.totalExpenses).toBe(15300);
		expect(result.netAmount).toBe(49700); // 65000 - 15300
		expect(result.transactionCount).toBe(5);
	});

	it('should handle empty transactions array', () => {
		const result = calculateFinancialSummary([]);

		expect(result.totalIncome).toBe(0);
		expect(result.totalExpenses).toBe(0);
		expect(result.netAmount).toBe(0);
		expect(result.transactionCount).toBe(0);
	});

	it('should handle negative net amount (expenses > income)', () => {
		const negativeNetTransactions: Transaction[] = [
			{
				id: '1',
				date: new Date('2024-01-01'),
				description: 'Small income',
				amount: 1000,
				type: 'income',
			},
			{
				id: '2',
				date: new Date('2024-01-02'),
				description: 'Large expense',
				amount: -5000,
				type: 'expense',
			},
		];

		const result = calculateFinancialSummary(negativeNetTransactions);

		expect(result.totalIncome).toBe(1000);
		expect(result.totalExpenses).toBe(5000);
		expect(result.netAmount).toBe(-4000);
		expect(result.transactionCount).toBe(2);
	});
});

describe('formatCurrency', () => {
	it('should format positive amounts with USD currency by default', () => {
		const result = formatCurrency(12345.67);
		expect(result).toBe('$12,345.67');
	});

	it('should format negative amounts correctly', () => {
		const result = formatCurrency(-1234.56);
		expect(result).toBe('-$1,234.56');
	});

	it('should format zero correctly', () => {
		const result = formatCurrency(0);
		expect(result).toBe('$0.00');
	});

	it('should handle different currencies', () => {
		const result = formatCurrency(1000, 'USD', 'en-US');
		expect(result).toBe('$1,000.00');
	});

	it('should handle different locales', () => {
		const result = formatCurrency(1000, 'EUR', 'de-DE');
		expect(result).toMatch(/1\.000,00/);
		expect(result).toContain('€');
	});

	it('should handle large numbers', () => {
		const result = formatCurrency(1234567.89);
		expect(result).toBe('$1,234,567.89');
	});
});

describe('formatAmount', () => {
	it('should format positive amounts without currency symbol', () => {
		const result = formatAmount(12345.67);
		expect(result).toBe('12,345.67');
		expect(result).not.toContain('kr');
		expect(result).not.toContain('$');
	});

	it('should format negative amounts correctly', () => {
		const result = formatAmount(-1234.56);
		expect(result).toBe('-1,234.56');
	});

	it('should format zero correctly', () => {
		const result = formatAmount(0);
		expect(result).toBe('0.00');
	});

	it('should handle different locales', () => {
		const result = formatAmount(1000, 'en-US');
		expect(result).toBe('1,000.00');
	});

	it('should handle large numbers', () => {
		const result = formatAmount(1234567.89);
		expect(result).toBe('1,234,567.89');
	});

	it('should always show two decimal places', () => {
		const result = formatAmount(100);
		expect(result).toBe('100.00');
	});
});
