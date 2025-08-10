/**
 * Tests for subscription detection and suggestion system
 * Verifies the core detection algorithm and suggestion workflow
 */

import type { Transaction } from '../types';
import { SubscriptionPatternEngine } from '../subscription-pattern-engine';
import { SubscriptionService } from '../subscription-service';

// Mock repository for testing
const mockRepository = {
	findActiveSubscriptions: jest.fn().mockResolvedValue([]),
	findPatternsBySubscription: jest.fn().mockResolvedValue([]),
	createSubscriptionPattern: jest.fn(),
	updatePatternUsage: jest.fn(),
	createSubscription: jest.fn(),
	findAllSubscriptions: jest.fn(),
	findSubscriptionById: jest.fn(),
	updateSubscription: jest.fn(),
	deleteSubscription: jest.fn(),
	findSubscriptionsByCategory: jest.fn(),
	findUpcomingPayments: jest.fn(),
	calculateTotalMonthlyCost: jest.fn(),
	findUnusedSubscriptions: jest.fn(),
	flagTransactionAsSubscription: jest.fn(),
	unflagTransactionAsSubscription: jest.fn(),
	findSubscriptionTransactions: jest.fn(),
	deleteSubscriptionPattern: jest.fn(),
	getCategories: jest
		.fn()
		.mockResolvedValue([{ id: 'cat1', name: 'Entertainment', color: '#ff0000', icon: 'play' }]),
	findById: jest.fn().mockImplementation((id: string) => {
		// Return mock transaction based on ID
		return Promise.resolve({
			id,
			date: new Date(),
			description: 'Mock Transaction',
			amount: -100,
			type: 'expense',
			currency: 'NOK',
		});
	}),
} as any;

describe('Subscription Detection System', () => {
	let patternEngine: SubscriptionPatternEngine;
	let subscriptionService: SubscriptionService;

	beforeEach(() => {
		jest.clearAllMocks();
		// Reset to default mock values
		mockRepository.findActiveSubscriptions.mockResolvedValue([]);
		mockRepository.findPatternsBySubscription.mockResolvedValue([]);
		patternEngine = new SubscriptionPatternEngine(mockRepository);
		subscriptionService = new SubscriptionService(mockRepository);
	});

	describe('Core Detection Algorithm (Task 3.1)', () => {
		it('should detect monthly recurring payments', async () => {
			// Create sample transactions for Netflix subscription using recent dates
			const now = new Date();
			const transactions: Transaction[] = [
				{
					id: '1',
					date: new Date(now.getFullYear(), now.getMonth() - 2, 15),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
					categoryId: 'cat1',
				},
				{
					id: '2',
					date: new Date(now.getFullYear(), now.getMonth() - 1, 15),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
					categoryId: 'cat1',
				},
				{
					id: '3',
					date: new Date(now.getFullYear(), now.getMonth(), 15),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
					categoryId: 'cat1',
				},
			];

			const candidates = await patternEngine.detectSubscriptions(transactions);

			expect(candidates).toHaveLength(1);
			expect(candidates[0].name).toBe('Netflix Com');
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
				{
					id: '3',
					date: new Date('2024-07-01'),
					description: 'ADOBE CREATIVE CLOUD',
					amount: -599.0,
					type: 'expense',
					currency: 'NOK',
				},
			];

			const candidates = await patternEngine.detectSubscriptions(transactions);

			expect(candidates).toHaveLength(1);
			expect(candidates[0].billingFrequency).toBe('quarterly');
			expect(candidates[0].confidence).toBeGreaterThan(0.4);
		});

		it('should handle description variations with fuzzy matching', async () => {
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
					date: new Date('2024-02-15'),
					description: 'SPOTIFY PREMIUM',
					amount: -99.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '3',
					date: new Date('2024-03-15'),
					description: 'SPOTIFY PREMIUM',
					amount: -99.0,
					type: 'expense',
					currency: 'NOK',
				},
			];

			const candidates = await patternEngine.detectSubscriptions(transactions);

			expect(candidates).toHaveLength(1);
			expect(candidates[0].name).toContain('Spotify');
		});

		it('should not suggest subscriptions that already exist and are active', async () => {
			// Mock existing active subscription
			const existingSubscription = {
				id: 'existing-sub-1',
				name: 'Netflix',
				amount: 149.0,
				currency: 'NOK',
				billingFrequency: 'monthly' as const,
				isActive: true,
				categoryId: 'cat1',
				startDate: new Date('2024-01-01'),
				nextPaymentDate: new Date('2024-04-15'),
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const existingPattern = {
				id: 'pattern-1',
				subscriptionId: 'existing-sub-1',
				pattern: 'NETFLIX.COM',
				patternType: 'exact' as const,
				confidenceScore: 1.0,
				createdBy: 'user' as const,
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			// Mock repository to return existing subscription and pattern
			mockRepository.findActiveSubscriptions.mockResolvedValue([existingSubscription]);
			mockRepository.findPatternsBySubscription.mockResolvedValue([existingPattern]);

			const transactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-15'),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '2',
					date: new Date('2024-02-15'),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '3',
					date: new Date('2024-03-15'),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
				},
			];

			const candidates = await patternEngine.detectSubscriptions(transactions);

			// Should not suggest Netflix subscription since it already exists
			expect(candidates).toHaveLength(0);
		});

		it('should filter out monthly subscriptions that appear to have been canceled', async () => {
			// Create dates relative to now to avoid date issues
			const now = new Date();
			const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, 15);
			const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 15);
			const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 15);
			const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 15);
			const sevenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 7, 15);
			const eightMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 8, 15);

			const transactions: Transaction[] = [
				// Canceled subscription: last payment more than 6 months ago (should be filtered out)
				{
					id: '1',
					date: eightMonthsAgo,
					description: 'CANCELED STREAMING SERVICE',
					amount: -99.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '2',
					date: sevenMonthsAgo,
					description: 'CANCELED STREAMING SERVICE',
					amount: -99.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '3',
					date: sevenMonthsAgo, // Last payment more than 4 months ago
					description: 'CANCELED STREAMING SERVICE',
					amount: -99.0,
					type: 'expense',
					currency: 'NOK',
				},
				// Active subscription: recent payments (should be kept)
				{
					id: '4',
					date: threeMonthsAgo,
					description: 'ACTIVE STREAMING SERVICE',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '5',
					date: twoMonthsAgo,
					description: 'ACTIVE STREAMING SERVICE',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '6',
					date: oneMonthAgo,
					description: 'ACTIVE STREAMING SERVICE',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
				},
			];

			const candidates = await patternEngine.detectSubscriptions(transactions);

			// Should only detect the active subscription, not the canceled one
			expect(candidates).toHaveLength(1);
			expect(candidates[0].name).toBe('Active Streaming Service');
			expect(candidates[0].amount).toBe(149.0);
		});

		it('should handle amount variations within tolerance', async () => {
			const transactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-15'),
					description: 'GYM MEMBERSHIP',
					amount: -399.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '2',
					date: new Date('2024-02-15'),
					description: 'GYM MEMBERSHIP',
					amount: -399.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '3',
					date: new Date('2024-03-15'),
					description: 'GYM MEMBERSHIP',
					amount: -409.0, // Small price increase
					type: 'expense',
					currency: 'NOK',
				},
			];

			const candidates = await patternEngine.detectSubscriptions(transactions);

			expect(candidates).toHaveLength(1);
			expect(candidates[0].confidence).toBeGreaterThan(0.5);
		});
	});

	describe('Subscription Suggestion System (Task 3.2)', () => {
		it('should provide user confirmation workflow', async () => {
			const mockCandidate = {
				name: 'Netflix',
				amount: 149.0,
				currency: 'NOK',
				billingFrequency: 'monthly' as const,
				categoryId: 'cat1',
				confidence: 0.9,
				matchingTransactions: [
					{
						id: '1',
						date: new Date('2024-01-15'),
						description: 'NETFLIX.COM',
						amount: -149.0,
						type: 'expense' as const,
						currency: 'NOK',
					},
				],
				detectedPatterns: [
					{ pattern: 'NETFLIX.COM', patternType: 'exact' as const, confidence: 1.0 },
				],
				reason: 'Detected monthly recurring payment',
			};

			mockRepository.createSubscription.mockResolvedValue({
				id: 'sub1',
				...mockCandidate,
				isActive: true,
				startDate: new Date('2024-01-15'),
				nextPaymentDate: new Date('2024-02-15'),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const result = await subscriptionService.confirmSubscription({
				candidate: mockCandidate,
				overrides: { notes: 'Confirmed by user' },
			});

			expect(mockRepository.createSubscription).toHaveBeenCalled();
			expect(result.name).toBe('Netflix');
		});

		it('should integrate with existing category system using isSubscription flag', async () => {
			const transactionIds = ['tx1', 'tx2'];
			const subscriptionId = 'sub1';

			await subscriptionService.flagTransactionsAsSubscription(
				subscriptionId,
				transactionIds,
			);

			expect(mockRepository.flagTransactionAsSubscription).toHaveBeenCalledTimes(2);
			expect(mockRepository.flagTransactionAsSubscription).toHaveBeenCalledWith(
				'tx1',
				'sub1',
			);
			expect(mockRepository.flagTransactionAsSubscription).toHaveBeenCalledWith(
				'tx2',
				'sub1',
			);
		});

		it('should implement retroactive transaction flagging', async () => {
			const mockCandidate = {
				name: 'Spotify',
				amount: 99.0,
				currency: 'NOK',
				billingFrequency: 'monthly' as const,
				confidence: 0.8,
				matchingTransactions: [
					{
						id: 'tx1',
						date: new Date(),
						description: 'SPOTIFY',
						amount: -99,
						type: 'expense' as const,
					},
					{
						id: 'tx2',
						date: new Date(),
						description: 'SPOTIFY',
						amount: -99,
						type: 'expense' as const,
					},
				],
				detectedPatterns: [],
				reason: 'Test',
			};

			mockRepository.createSubscription.mockResolvedValue({
				id: 'sub1',
				name: 'Spotify',
				amount: 99.0,
				currency: 'NOK',
				billingFrequency: 'monthly',
				isActive: true,
				startDate: new Date(),
				nextPaymentDate: new Date(),
				categoryId: 'cat1',
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			await subscriptionService.confirmSubscription({ candidate: mockCandidate });

			// Verify that all matching transactions were flagged
			expect(mockRepository.flagTransactionAsSubscription).toHaveBeenCalledWith(
				'tx1',
				'sub1',
			);
			expect(mockRepository.flagTransactionAsSubscription).toHaveBeenCalledWith(
				'tx2',
				'sub1',
			);
		});

		it('should implement learning mechanism to improve detection accuracy', async () => {
			const patternId = 'pattern1';

			// Test positive feedback
			await subscriptionService.updatePatternConfidence(patternId, true);
			expect(mockRepository.updatePatternUsage).toHaveBeenCalledWith(patternId, true);

			// Test negative feedback
			await subscriptionService.updatePatternConfidence(patternId, false);
			expect(mockRepository.updatePatternUsage).toHaveBeenCalledWith(patternId, false);
		});
	});

	describe('Integration Tests', () => {
		it('should handle complete detection and confirmation workflow', async () => {
			const transactions: Transaction[] = [
				{
					id: '1',
					date: new Date('2024-01-15'),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '2',
					date: new Date('2024-02-15'),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
				},
				{
					id: '3',
					date: new Date('2024-03-15'),
					description: 'NETFLIX.COM',
					amount: -149.0,
					type: 'expense',
					currency: 'NOK',
				},
			];

			// Step 1: Detect subscriptions
			const detectionResult = await subscriptionService.detectSubscriptions(transactions);

			expect(detectionResult.candidates).toHaveLength(1);
			expect(detectionResult.totalTransactions).toBe(3);
			expect(detectionResult.alreadyFlagged).toBe(0);

			// Step 2: Confirm subscription
			const candidate = detectionResult.candidates[0];
			mockRepository.createSubscription.mockResolvedValue({
				id: 'sub1',
				...candidate,
				isActive: true,
				startDate: new Date('2024-01-15'),
				nextPaymentDate: new Date('2024-03-15'),
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const subscription = await subscriptionService.confirmSubscription({ candidate });

			expect(subscription.name).toBe(candidate.name);
			expect(mockRepository.flagTransactionAsSubscription).toHaveBeenCalledTimes(3);
		});
	});
});
