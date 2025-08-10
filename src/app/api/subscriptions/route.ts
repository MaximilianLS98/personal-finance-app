import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { SubscriptionBudgetIntegrationService } from '@/lib/subscription-budget-integration';
import { ErrorResponse } from '@/lib/types';

/**
 * GET /api/subscriptions - Retrieve all subscriptions with optional filtering
 * Query params: active, category, sortBy, sortOrder
 */
export async function GET(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const url = new URL(request.url);
		const searchParams = url.searchParams;

		// Parse query parameters
		const activeOnly = searchParams.get('active') === 'true';
		const categoryId = searchParams.get('category');
		const sortBy = searchParams.get('sortBy') || 'name';
		const sortOrder = searchParams.get('sortOrder') || 'ASC';

		let subscriptions;

		if (activeOnly) {
			subscriptions = await repository.findActiveSubscriptions();
		} else if (categoryId) {
			subscriptions = await repository.findSubscriptionsByCategory(categoryId);
		} else {
			subscriptions = await repository.findAllSubscriptions();
		}

		// Apply sorting
		subscriptions.sort((a, b) => {
			let aValue: string | number | Date;
			let bValue: string | number | Date;

			switch (sortBy) {
				case 'name':
					aValue = a.name.toLowerCase();
					bValue = b.name.toLowerCase();
					break;
				case 'amount':
					aValue = a.amount;
					bValue = b.amount;
					break;
				case 'nextPaymentDate':
					aValue = a.nextPaymentDate;
					bValue = b.nextPaymentDate;
					break;
				case 'createdAt':
					aValue = a.createdAt;
					bValue = b.createdAt;
					break;
				default:
					aValue = a.name.toLowerCase();
					bValue = b.name.toLowerCase();
			}

			if (aValue < bValue) return sortOrder === 'ASC' ? -1 : 1;
			if (aValue > bValue) return sortOrder === 'ASC' ? 1 : -1;
			return 0;
		});

		return NextResponse.json(
			{
				success: true,
				data: subscriptions,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscriptions API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while fetching subscriptions',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}

/**
 * POST /api/subscriptions - Create a new subscription
 */
export async function POST(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const body = await request.json();

		// Validate required fields
		const requiredFields = [
			'name',
			'amount',
			'billingFrequency',
			'nextPaymentDate',
			'categoryId',
		];
		for (const field of requiredFields) {
			if (!body[field]) {
				return NextResponse.json(
					{
						error: 'VALIDATION_ERROR',
						message: `Missing required field: ${field}`,
					} as ErrorResponse,
					{ status: 400 },
				);
			}
		}

		// Validate billing frequency
		const validFrequencies = ['monthly', 'quarterly', 'annually', 'custom'];
		if (!validFrequencies.includes(body.billingFrequency)) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message:
						'Invalid billing frequency. Must be one of: monthly, quarterly, annually, custom',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Validate custom frequency days if needed
		if (
			body.billingFrequency === 'custom' &&
			(!body.customFrequencyDays || body.customFrequencyDays <= 0)
		) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message:
						'customFrequencyDays is required and must be positive when billingFrequency is custom',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Validate amount is positive
		if (body.amount <= 0) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'Amount must be positive',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Validate usage rating if provided
		if (body.usageRating !== undefined && (body.usageRating < 1 || body.usageRating > 5)) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'Usage rating must be between 1 and 5',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Verify category exists
		const category = await repository.getCategoryById(body.categoryId);
		if (!category) {
			return NextResponse.json(
				{
					error: 'VALIDATION_ERROR',
					message: 'Category not found',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		// Prepare subscription data
		const subscriptionData = {
			name: body.name,
			description: body.description,
			amount: body.amount,
			currency: body.currency || 'NOK',
			billingFrequency: body.billingFrequency,
			customFrequencyDays: body.customFrequencyDays,
			nextPaymentDate: new Date(body.nextPaymentDate),
			categoryId: body.categoryId,
			isActive: body.isActive !== undefined ? body.isActive : true,
			startDate: body.startDate ? new Date(body.startDate) : new Date(),
			endDate: body.endDate ? new Date(body.endDate) : undefined,
			notes: body.notes,
			website: body.website,
			cancellationUrl: body.cancellationUrl,
			lastUsedDate: body.lastUsedDate ? new Date(body.lastUsedDate) : undefined,
			usageRating: body.usageRating,
		};

		const subscription = await repository.createSubscription(subscriptionData);

		// Update budgets with new subscription
		try {
			const budgetIntegration = new SubscriptionBudgetIntegrationService(repository);
			await budgetIntegration.onSubscriptionCreated(subscription);
		} catch (budgetError) {
			console.error('Error updating budgets after subscription creation:', budgetError);
			// Don't fail the subscription creation if budget updates fail
		}

		return NextResponse.json(
			{
				success: true,
				data: subscription,
			},
			{ status: 201 },
		);
	} catch (error) {
		console.error('Create subscription API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while creating subscription',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
