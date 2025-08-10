import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { createSubscriptionPatternEngine } from '@/lib/subscription-pattern-engine';
import { ErrorResponse } from '@/lib/types';

/**
 * POST /api/subscriptions/bulk-categorize - Bulk categorize detected subscriptions
 * Body: {
 *   subscriptions: Array<{
 *     name: string,
 *     amount: number,
 *     billingFrequency: string,
 *     categoryId: string,
 *     transactionIds: string[],
 *     patterns: Array<{ pattern: string, patternType: string, confidence: number }>
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const body = await request.json();
		const { subscriptions } = body;

		if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'subscriptions array is required and must not be empty',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		const results = {
			created: [] as any[],
			errors: [] as any[],
			flaggedTransactions: 0,
			createdPatterns: 0,
		};

		// Process each subscription
		for (let i = 0; i < subscriptions.length; i++) {
			const subscriptionData = subscriptions[i];

			try {
				// Validate required fields
				const requiredFields = [
					'name',
					'amount',
					'billingFrequency',
					'categoryId',
					'transactionIds',
				];
				for (const field of requiredFields) {
					if (!subscriptionData[field]) {
						throw new Error(`Missing required field: ${field}`);
					}
				}

				// Validate billing frequency
				const validFrequencies = ['monthly', 'quarterly', 'annually', 'custom'];
				if (!validFrequencies.includes(subscriptionData.billingFrequency)) {
					throw new Error('Invalid billing frequency');
				}

				// Validate amount
				if (subscriptionData.amount <= 0) {
					throw new Error('Amount must be positive');
				}

				// Verify category exists
				const category = await repository.getCategoryById(subscriptionData.categoryId);
				if (!category) {
					throw new Error('Category not found');
				}

				// Verify transactions exist
				const transactions = [];
				for (const transactionId of subscriptionData.transactionIds) {
					const transaction = await repository.findById(transactionId);
					if (!transaction) {
						throw new Error(`Transaction not found: ${transactionId}`);
					}
					transactions.push(transaction);
				}

				// Calculate next payment date based on the most recent transaction
				const sortedTransactions = transactions.sort(
					(a, b) => b.date.getTime() - a.date.getTime(),
				);
				const lastTransaction = sortedTransactions[0];
				const nextPaymentDate = new Date(lastTransaction.date);

				// Add billing frequency to next payment date
				switch (subscriptionData.billingFrequency) {
					case 'monthly':
						nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
						break;
					case 'quarterly':
						nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 3);
						break;
					case 'annually':
						nextPaymentDate.setFullYear(nextPaymentDate.getFullYear() + 1);
						break;
					case 'custom':
						if (!subscriptionData.customFrequencyDays) {
							throw new Error('customFrequencyDays required for custom frequency');
						}
						nextPaymentDate.setDate(
							nextPaymentDate.getDate() + subscriptionData.customFrequencyDays,
						);
						break;
				}

				// Create the subscription
				const newSubscription = await repository.createSubscription({
					name: subscriptionData.name,
					description: subscriptionData.description,
					amount: subscriptionData.amount,
					currency: subscriptionData.currency || transactions[0].currency || 'NOK',
					billingFrequency: subscriptionData.billingFrequency,
					customFrequencyDays: subscriptionData.customFrequencyDays,
					nextPaymentDate,
					categoryId: subscriptionData.categoryId,
					isActive:
						subscriptionData.isActive !== undefined ? subscriptionData.isActive : true,
					startDate: subscriptionData.startDate
						? new Date(subscriptionData.startDate)
						: sortedTransactions[sortedTransactions.length - 1].date,
					endDate: subscriptionData.endDate
						? new Date(subscriptionData.endDate)
						: undefined,
					notes: subscriptionData.notes,
					website: subscriptionData.website,
					cancellationUrl: subscriptionData.cancellationUrl,
					lastUsedDate: subscriptionData.lastUsedDate
						? new Date(subscriptionData.lastUsedDate)
						: undefined,
					usageRating: subscriptionData.usageRating,
				});

				// Create patterns for the subscription
				const detectionEngine = createSubscriptionPatternEngine(repository);
				let createdPatterns = 0;

				if (subscriptionData.patterns && Array.isArray(subscriptionData.patterns)) {
					// Use provided patterns
					for (const patternData of subscriptionData.patterns) {
						await repository.createSubscriptionPattern({
							subscriptionId: newSubscription.id,
							pattern: patternData.pattern,
							patternType: patternData.patternType,
							confidenceScore: patternData.confidence || 1.0,
							createdBy: 'user',
							isActive: true,
							createdAt: new Date(),
							updatedAt: new Date(),
						});
						createdPatterns++;
					}
				} else {
					// Generate patterns from transactions
					const patterns = await detectionEngine.createPatternsForSubscription(
						newSubscription.id,
						transactions,
					);
					createdPatterns = patterns.length;
				}

				// Flag all related transactions as subscription transactions
				let flaggedCount = 0;
				for (const transaction of transactions) {
					await repository.flagTransactionAsSubscription(
						transaction.id,
						newSubscription.id,
					);
					flaggedCount++;
				}

				results.created.push({
					subscription: newSubscription,
					flaggedTransactions: flaggedCount,
					createdPatterns,
				});

				results.flaggedTransactions += flaggedCount;
				results.createdPatterns += createdPatterns;
			} catch (error) {
				results.errors.push({
					index: i,
					subscription: subscriptionData.name || `Subscription ${i + 1}`,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		// Return results
		const statusCode = results.errors.length > 0 ? 207 : 201; // 207 Multi-Status if there are errors

		return NextResponse.json(
			{
				success: results.errors.length === 0,
				data: {
					summary: {
						totalProcessed: subscriptions.length,
						successfullyCreated: results.created.length,
						errors: results.errors.length,
						totalFlaggedTransactions: results.flaggedTransactions,
						totalCreatedPatterns: results.createdPatterns,
					},
					created: results.created,
					errors: results.errors,
				},
				...(results.errors.length > 0 && {
					message: `${results.created.length} subscriptions created successfully, ${results.errors.length} failed`,
				}),
			},
			{ status: statusCode },
		);
	} catch (error) {
		console.error('Bulk categorize subscriptions API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred during bulk categorization',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
