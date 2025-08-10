/**
 * Tests for subscription pattern detection engine
 */

import { SubscriptionPatternEngine } from '../subscription-pattern-engine';
import type { Transaction, TransactionRepository } from '../types';

// Mock repository for testing
const mockRepository: jest.Mocked<TransactionRepository> = {
	// Core CRUD operations
	create: jest.fn(),
	createMany: jest.fn(),
	findAll: jest.fn(),
	findWithPagination: jest.fn(),
	findById: jest.fn(),
	findByDateRange: jest.fn(),
	update: jest.fn(),
	delete: jest.fn(),

	// Business logic operations
	calculateSummary: jest.fn(),
	checkDuplicates: jest.fn(),

	// Category operations
	getCategories: jest.fn(),
	getCategoryById: jest.fn(),
	createCategory: jest.fn(),
	updateCategory: jest.fn(),
	deleteCategory: jest.fn(),
	getCategoryRules: jest.fn(),
	createCategoryRule: jest.fn(),
	updateRuleUsage: jest.fn(),
	deleteCategoryRule: jest.fn(),

	// Subscription CRUD operations
	createSubscription: jest.fn(),
	findAllSubscriptions: jest.fn(),
	findSubscriptionById: jest.fn(),
	findSubscriptionsByCategory: jest.fn(),
	updateSubscription: jest.fn(),
	deleteSubscription: jest.fn(),

	// Subscription-specific queries
	findActiveSubscriptions: jest.fn(),
	findUpcomingPayments: jest.fn(),
	calculateTotalMonthlyCost: jest.fn(),
	findUnusedSubscriptions: jest.fn(),

	// Subscription pattern management
	createSubscriptionPattern: jest.fn(),
	findPatternsBySubscription: jest.fn(),
	updatePatternUsage: jest.fn(),
	deleteSubscriptionPattern: jest.fn(),

	// Transaction-subscription integration
	flagTransactionAsSubscription: jest.fn(),
	unflagTransactionAsSubscription: jest.fn(),
	findSubscriptionTransactions: jest.fn(),

	// Database management
	initialize: jest.fn(),
	close: jest.fn(),
};

describe('SubscriptionPatternEngine', () => {
	let engine: SubscriptionPatternEngine;

	beforeEach(() => {
		engine = new SubscriptionPatternEngine(mockRepository);
		jest.clearAllMocks();
	});

	describe('detectSubscriptions', () => {
		it('should detect monthly recurring payments', async () => {
			// Create mock transactions for Netflix subscription
			const transactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-15'),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
					categoryId: 'entertainment',
				},
				{
					id: '2',
					date: new Date('2024-02-15'),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
					categoryId: 'entertainment',
				},
				{
					id: '3',
					date: new Date('2024-03-15'),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
					categoryId: 'entertainment',
				},
			];

			const candidates = await engine.detectSubscriptions(transactions);

			expect(candidates).toHaveLength(1);
			expect(candidates[0].name).toBe('Netflix.Com');
			expect(candidates[0].amount).toBe(149.0);
			expect(candidates[0].billingFrequency).toBe('monthly');
			expect(candidates[0].confidence).toBeGreaterThan(0.6);
			expect(candidates[0].matchingTransactions).toHaveLength(3);
		});

		it('should detect quarterly recurring payments', async () => {
			const transactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-01'),
					description: 'ADOBE CREATIVE CLOUD',
					amount: -599.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '2',
					date: new Date('2024-04-01'),
					description: 'ADOBE CREATIVE CLOUD',
					amount: -599.0,
					type: 'expense',
					currency: 'NOK',
				},
			];

			const candidates = await engine.detectSubscriptions(transactions);

			expect(candidates).toHaveLength(1);
			expect(candidates[0].billingFrequency).toBe('quarterly');
		});

		it('should not detect non-recurring transactions', async () => {
			const transactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-15'),
					description: 'GROCERY STORE',
					amount: -250.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '2',
					date: new Date('2024-01-20'),
					description: 'GAS STATION',
					amount: -400.0,
					type: 'expense',
					currency: 'NOK',
				},
			];

			const candidates = await engine.detectSubscriptions(transactions);

			expect(candidates).toHaveLength(0);
		});
	});

	describe('analyzeRecurringPatterns', () => {
		it('should identify monthly patterns with date flexibility', async () => {
			const transactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-15'),
					description: 'SPOTIFY PREMIUM',
					amount: -99.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '2',
					date: new Date('2024-02-14'), // One day earlier
					description: 'SPOTIFY PREMIUM',
					amount: -99.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '3',
					date: new Date('2024-03-16'), // One day later
					description: 'SPOTIFY PREMIUM',
					amount: -99.0,
					type: 'expense',
					currency: 'NOK',
				},
			];

			const patterns = await engine.analyzeRecurringPatterns(transactions);

			expect(patterns).toHaveLength(1);
			expect(patterns[0].billingFrequency).toBe('monthly');
			expect(patterns[0].confidence).toBeGreaterThan(0.5);
		});
	});

	describe('matchExistingSubscriptions', () => {
		it('should match transactions against subscription patterns', async () => {
			// Mock existing subscription and patterns
			mockRepository.findActiveSubscriptions.mockResolvedValue([
				{
					id: 'sub-1',
					name: 'Netflix',
					amount: 149.0,
					currency: 'NOK',
					billingFrequency: 'monthly',
					nextPaymentDate: new Date('2024-04-15'),
					categoryId: 'entertainment',
					isActive: true,
					startDate: new Date('2024-01-01'),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]);

			mockRepository.findPatternsBySubscription.mockResolvedValue([
				{
					id: 'pattern-1',
					subscriptionId: 'sub-1',
					pattern: 'NETFLIX.COM',
					patternType: 'contains',
					confidenceScore: 0.9,
					createdBy: 'system',
					isActive: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]);

			const transactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-04-15'),
					description: 'NETFLIX.COM MONTHLY',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
				},
			];

			const matches = await engine.matchExistingSubscriptions(transactions);

			expect(matches).toHaveLength(1);
			expect(matches[0].subscription.name).toBe('Netflix');
			expect(matches[0].confidence).toBeGreaterThan(0.7);
		});
	});
});

describe('Pattern matching confidence calculation', () => {
	let engine: SubscriptionPatternEngine;

	beforeEach(() => {
		engine = new SubscriptionPatternEngine(mockRepository);
	});

	it('should calculate exact match confidence correctly', () => {
		const transaction: Transaction = {
			id: '1',
			date: new Date(),
			description: 'NETFLIX.COM',
			amount: -149.0,
			type: 'expense',
			currency: 'NOK',
		};

		const pattern = {
			id: 'p1',
			subscriptionId: 's1',
			pattern: 'NETFLIX.COM',
			patternType: 'exact' as const,
			confidenceScore: 1.0,
			createdBy: 'system' as const,
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		// Access private method for testing
		const confidence = (engine as any).calculatePatternMatch(transaction, pattern);
		expect(confidence).toBe(1.0);
	});

	it('should calculate contains match confidence correctly', () => {
		const transaction: Transaction = {
			id: '1',
			date: new Date(),
			description: 'NETFLIX.COM MONTHLY SUBSCRIPTION',
			amount: -149.0,
			type: 'expense',
			currency: 'NOK',
		};

		const pattern = {
			id: 'p1',
			subscriptionId: 's1',
			pattern: 'NETFLIX',
			patternType: 'contains' as const,
			confidenceScore: 0.8,
			createdBy: 'system' as const,
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const confidence = (engine as any).calculatePatternMatch(transaction, pattern);
		expect(confidence).toBe(0.9 * 0.8); // match score * pattern confidence
	});
});
