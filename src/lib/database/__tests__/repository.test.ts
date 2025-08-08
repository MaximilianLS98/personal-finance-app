/**
 * Unit tests for TransactionRepository CRUD operations
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Transaction } from '../../types';

// Mock the connection module
jest.mock('../connection', () => ({
	getConnectionManager: jest.fn(),
	resetConnectionManager: jest.fn(),
	DatabaseConnectionError: class MockDatabaseConnectionError extends Error {
		constructor(
			public type: string,
			message: string,
			public query?: string,
			public params?: any[],
		) {
			super(message);
			this.name = 'DatabaseConnectionError';
		}
	},
}));

// Mock the types module
jest.mock('../types', () => ({
	DatabaseErrorType: {
		CONNECTION_FAILED: 'CONNECTION_FAILED',
		MIGRATION_FAILED: 'MIGRATION_FAILED',
		CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
		TRANSACTION_FAILED: 'TRANSACTION_FAILED',
		DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
	},
}));

// Mock crypto.randomUUID globally
Object.defineProperty(global, 'crypto', {
	value: {
		randomUUID: jest.fn(),
	},
});

import { SQLiteTransactionRepository } from '../repository';
import { getConnectionManager, resetConnectionManager } from '../connection';

describe('SQLiteTransactionRepository', () => {
	let repository: SQLiteTransactionRepository;
	let mockDb: any;
	let mockManager: any;

	const sampleTransaction: Omit<Transaction, 'id'> = {
		date: new Date('2024-01-15'),
		description: 'Test transaction',
		amount: 100.5,
		type: 'income',
	};

	beforeEach(async () => {
		// Create mock database
		mockDb = {
			prepare: jest.fn(),
			transaction: jest.fn(),
			close: jest.fn(),
		};

		// Create mock connection manager
		mockManager = {
			getConnection: jest.fn().mockReturnValue(mockDb),
			isReady: jest.fn().mockReturnValue(true),
			initialize: jest.fn().mockResolvedValue(undefined),
			runMigrations: jest.fn().mockResolvedValue(undefined),
			close: jest.fn().mockResolvedValue(undefined),
		};

		// Mock the getConnectionManager function
		(getConnectionManager as jest.Mock).mockReturnValue(mockManager);

		repository = new SQLiteTransactionRepository();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('create', () => {
		it('should create a single transaction successfully', async () => {
			const mockStmt = {
				run: jest.fn(),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			// Mock crypto.randomUUID
			const mockUUID = 'test-uuid-123';
			global.crypto = {
				randomUUID: jest.fn().mockReturnValue(mockUUID),
			} as any;

			const result = await repository.create(sampleTransaction);

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining('INSERT INTO transactions'),
			);
			expect(mockStmt.run).toHaveBeenCalledWith(
				mockUUID,
				sampleTransaction.date.toISOString(),
				sampleTransaction.description,
				sampleTransaction.amount,
				sampleTransaction.type,
				expect.any(String), // created_at
				expect.any(String), // updated_at
			);
			expect(result).toEqual({
				id: mockUUID,
				...sampleTransaction,
			});
		});

		it('should handle duplicate constraint violations', async () => {
			const mockStmt = {
				run: jest.fn().mockImplementation(() => {
					const error = new Error('UNIQUE constraint failed');
					throw error;
				}),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			global.crypto = {
				randomUUID: jest.fn().mockReturnValue('test-uuid'),
			} as any;

			await expect(repository.create(sampleTransaction)).rejects.toThrow(
				'Transaction with same date, description, and amount already exists',
			);
		});

		it('should handle general database errors', async () => {
			const mockStmt = {
				run: jest.fn().mockImplementation(() => {
					throw new Error('Database connection failed');
				}),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			global.crypto = {
				randomUUID: jest.fn().mockReturnValue('test-uuid'),
			} as any;

			await expect(repository.create(sampleTransaction)).rejects.toThrow(
				'Failed to create transaction',
			);
		});
	});

	describe('createMany', () => {
		it('should create multiple transactions in a batch', async () => {
			const transactions = [
				sampleTransaction,
				{
					...sampleTransaction,
					description: 'Second transaction',
					amount: 200.75,
				},
			];

			const mockStmt = {
				run: jest.fn(),
			};
			mockDb.prepare.mockReturnValue(mockStmt);
			mockDb.transaction.mockImplementation((fn) => fn());

			global.crypto = {
				randomUUID: jest.fn().mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2'),
			} as any;

			const result = await repository.createMany(transactions);

			expect(mockDb.transaction).toHaveBeenCalled();
			expect(mockStmt.run).toHaveBeenCalledTimes(2);
			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('uuid-1');
			expect(result[1].id).toBe('uuid-2');
		});

		it('should return empty array for empty input', async () => {
			const result = await repository.createMany([]);
			expect(result).toEqual([]);
		});

		it('should skip duplicates and continue with other transactions', async () => {
			const transactions = [
				sampleTransaction,
				{
					...sampleTransaction,
					description: 'Second transaction',
				},
			];

			const mockStmt = {
				run: jest
					.fn()
					.mockImplementationOnce(() => {
						throw new Error('UNIQUE constraint failed');
					})
					.mockImplementationOnce(() => {}), // Second call succeeds
			};
			mockDb.prepare.mockReturnValue(mockStmt);
			mockDb.transaction.mockImplementation((fn) => fn());

			global.crypto = {
				randomUUID: jest.fn().mockReturnValueOnce('uuid-1').mockReturnValueOnce('uuid-2'),
			} as unknown;

			const result = await repository.createMany(transactions);

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('uuid-2');
		});
	});

	describe('findAll', () => {
		it('should return all transactions ordered by date', async () => {
			const mockRows = [
				{
					id: 'id-1',
					date: '2024-01-15T00:00:00.000Z',
					description: 'Transaction 1',
					amount: 100,
					type: 'income' as const,
				},
				{
					id: 'id-2',
					date: '2024-01-14T00:00:00.000Z',
					description: 'Transaction 2',
					amount: -50,
					type: 'expense' as const,
				},
			];

			const mockStmt = {
				all: jest.fn().mockReturnValue(mockRows),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			const result = await repository.findAll();

			expect(mockDb.prepare).toHaveBeenCalledWith(
				expect.stringContaining('SELECT id, date, description, amount, type'),
			);
			expect(result).toHaveLength(2);
			expect(result[0].date).toBeInstanceOf(Date);
			expect(result[0].id).toBe('id-1');
		});

		it('should handle database errors', async () => {
			const mockStmt = {
				all: jest.fn().mockImplementation(() => {
					throw new Error('Database error');
				}),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			await expect(repository.findAll()).rejects.toThrow('Failed to fetch transactions');
		});
	});

	describe('findById', () => {
		it('should return transaction by ID', async () => {
			const mockRow = {
				id: 'test-id',
				date: '2024-01-15T00:00:00.000Z',
				description: 'Test transaction',
				amount: 100,
				type: 'income' as const,
			};

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockRow),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			const result = await repository.findById('test-id');

			expect(mockStmt.get).toHaveBeenCalledWith('test-id');
			expect(result).not.toBeNull();
			expect(result!.id).toBe('test-id');
			expect(result!.date).toBeInstanceOf(Date);
		});

		it('should return null for non-existent ID', async () => {
			const mockStmt = {
				get: jest.fn().mockReturnValue(null),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			const result = await repository.findById('non-existent');

			expect(result).toBeNull();
		});
	});

	describe('findByDateRange', () => {
		it('should return transactions within date range', async () => {
			const startDate = new Date('2024-01-01');
			const endDate = new Date('2024-01-31');
			const mockRows = [
				{
					id: 'id-1',
					date: '2024-01-15T00:00:00.000Z',
					description: 'Transaction 1',
					amount: 100,
					type: 'income' as const,
				},
			];

			const mockStmt = {
				all: jest.fn().mockReturnValue(mockRows),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			const result = await repository.findByDateRange(startDate, endDate);

			expect(mockStmt.all).toHaveBeenCalledWith(
				startDate.toISOString(),
				endDate.toISOString(),
			);
			expect(result).toHaveLength(1);
		});
	});

	describe('calculateSummary', () => {
		it('should calculate financial summary correctly', async () => {
			const mockResult = {
				totalIncome: 500,
				totalExpenses: 200,
				transactionCount: 10,
			};

			const mockStmt = {
				get: jest.fn().mockReturnValue(mockResult),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			const result = await repository.calculateSummary();

			expect(result.totalIncome).toBe(500);
			expect(result.totalExpenses).toBe(200);
			expect(result.netAmount).toBe(300);
			expect(result.transactionCount).toBe(10);
		});
	});

	describe('checkDuplicates', () => {
		it('should identify duplicate transactions', async () => {
			const transactions = [sampleTransaction];
			const mockStmt = {
				get: jest.fn().mockReturnValue({ id: 'existing-id' }),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			const result = await repository.checkDuplicates(transactions);

			expect(result).toHaveLength(1);
			expect(result[0]).toContain(sampleTransaction.description);
		});

		it('should return empty array for no duplicates', async () => {
			const transactions = [sampleTransaction];
			const mockStmt = {
				get: jest.fn().mockReturnValue(null),
			};
			mockDb.prepare.mockReturnValue(mockStmt);

			const result = await repository.checkDuplicates(transactions);

			expect(result).toEqual([]);
		});

		it('should handle empty input', async () => {
			const result = await repository.checkDuplicates([]);
			expect(result).toEqual([]);
		});
	});

	describe('initialize', () => {
		it('should initialize repository when manager is not ready', async () => {
			mockManager.isReady.mockReturnValue(false);

			await repository.initialize();

			expect(mockManager.initialize).toHaveBeenCalled();
			expect(mockManager.runMigrations).toHaveBeenCalled();
		});

		it('should skip initialization when manager is ready', async () => {
			mockManager.isReady.mockReturnValue(true);

			await repository.initialize();

			expect(mockManager.initialize).not.toHaveBeenCalled();
		});
	});

	describe('close', () => {
		it('should close the database connection', async () => {
			await repository.close();

			expect(mockManager.close).toHaveBeenCalled();
		});
	});
});
