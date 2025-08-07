/**
 * Tests for the financial summary API endpoint
 */

import { GET } from '../route';
import { storeTransactions, clearStoredTransactions } from '@/lib/storage';
import { Transaction } from '@/lib/types';

// Mock console.error to avoid noise in test output
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('/api/summary', () => {
	beforeEach(() => {
		// Clear stored transactions before each test
		clearStoredTransactions();
		mockConsoleError.mockClear();
	});

	afterAll(() => {
		mockConsoleError.mockRestore();
	});

	describe('GET', () => {
		it('should return empty summary when no transaction data exists', async () => {
			const response = await GET();
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toEqual({
				success: true,
				data: {
					totalIncome: 0,
					totalExpenses: 0,
					netAmount: 0,
					transactionCount: 0,
				},
				message: 'No transaction data available',
			});
		});

		it('should calculate and return financial summary for stored transactions', async () => {
			// Arrange - store test transactions
			const testTransactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-01'),
					description: 'Salary',
					amount: 5000,
					type: 'income',
				},
				{
					id: '2',
					date: new Date('2024-01-02'),
					description: 'Groceries',
					amount: -150,
					type: 'expense',
				},
				{
					id: '3',
					date: new Date('2024-01-03'),
					description: 'Freelance work',
					amount: 800,
					type: 'income',
				},
				{
					id: '4',
					date: new Date('2024-01-04'),
					description: 'Rent',
					amount: -1200,
					type: 'expense',
				},
			];

			storeTransactions(testTransactions);

			// Act
			const response = await GET();
			const data = await response.json();

			// Assert
			expect(response.status).toBe(200);
			expect(data).toEqual({
				success: true,
				data: {
					totalIncome: 5800, // 5000 + 800
					totalExpenses: 1350, // 150 + 1200 (absolute values)
					netAmount: 4450, // 5800 - 1350
					transactionCount: 4,
				},
			});
		});

		it('should handle transactions with only income', async () => {
			// Arrange
			const testTransactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-01'),
					description: 'Salary',
					amount: 3000,
					type: 'income',
				},
				{
					id: '2',
					date: new Date('2024-01-02'),
					description: 'Bonus',
					amount: 500,
					type: 'income',
				},
			];

			storeTransactions(testTransactions);

			// Act
			const response = await GET();
			const data = await response.json();

			// Assert
			expect(response.status).toBe(200);
			expect(data.data).toEqual({
				totalIncome: 3500,
				totalExpenses: 0,
				netAmount: 3500,
				transactionCount: 2,
			});
		});

		it('should handle transactions with only expenses', async () => {
			// Arrange
			const testTransactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-01'),
					description: 'Rent',
					amount: -1000,
					type: 'expense',
				},
				{
					id: '2',
					date: new Date('2024-01-02'),
					description: 'Utilities',
					amount: -200,
					type: 'expense',
				},
			];

			storeTransactions(testTransactions);

			// Act
			const response = await GET();
			const data = await response.json();

			// Assert
			expect(response.status).toBe(200);
			expect(data.data).toEqual({
				totalIncome: 0,
				totalExpenses: 1200, // 1000 + 200 (absolute values)
				netAmount: -1200, // 0 - 1200
				transactionCount: 2,
			});
		});

		it('should handle single transaction', async () => {
			// Arrange
			const testTransactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-01'),
					description: 'Salary',
					amount: 2500,
					type: 'income',
				},
			];

			storeTransactions(testTransactions);

			// Act
			const response = await GET();
			const data = await response.json();

			// Assert
			expect(response.status).toBe(200);
			expect(data.data).toEqual({
				totalIncome: 2500,
				totalExpenses: 0,
				netAmount: 2500,
				transactionCount: 1,
			});
		});
	});
});
