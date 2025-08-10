import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { SubscriptionBudgetIntegrationService } from '@/lib/subscription-budget-integration';
import { ErrorResponse } from '@/lib/types';

/**
 * GET /api/subscriptions/[id] - Get subscription details by ID
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
	const repository = createTransactionRepository();

	try {
		const { id } = await context.params;

		await repository.initialize();
		const subscription = await repository.findSubscriptionById(id);

		if (!subscription) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Subscription not found',
				} as ErrorResponse,
				{ status: 404 },
			);
		}

		return NextResponse.json(
			{
				success: true,
				data: subscription,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Get subscription API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while fetching subscription',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}

/**
 * PUT /api/subscriptions/[id] - Update a subscription
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
	const repository = createTransactionRepository();

	try {
		const { id } = await context.params;
		const body = await request.json();

		await repository.initialize();

		// Check if subscription exists
		const existingSubscription = await repository.findSubscriptionById(id);
		if (!existingSubscription) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Subscription not found',
				} as ErrorResponse,
				{ status: 404 },
			);
		}

		// Validate billing frequency if provided
		if (body.billingFrequency) {
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

		// Validate amount if provided
		if (body.amount !== undefined && body.amount <= 0) {
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

		// Verify category exists if provided
		if (body.categoryId) {
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
		}

		// Prepare update data with date parsing
		const updates = {
			...body,
			...(body.nextPaymentDate && { nextPaymentDate: new Date(body.nextPaymentDate) }),
			...(body.startDate && { startDate: new Date(body.startDate) }),
			...(body.endDate && { endDate: new Date(body.endDate) }),
			...(body.lastUsedDate && { lastUsedDate: new Date(body.lastUsedDate) }),
		};

		const updatedSubscription = await repository.updateSubscription(id, updates);

		if (!updatedSubscription) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Subscription not found',
				} as ErrorResponse,
				{ status: 404 },
			);
		}

		// Update budgets with subscription changes
		try {
			const budgetIntegration = new SubscriptionBudgetIntegrationService(repository);
			await budgetIntegration.onSubscriptionUpdated(
				id,
				existingSubscription,
				updatedSubscription,
			);
		} catch (budgetError) {
			console.error('Error updating budgets after subscription update:', budgetError);
			// Don't fail the subscription update if budget updates fail
		}

		return NextResponse.json(
			{
				success: true,
				data: updatedSubscription,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Update subscription API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while updating subscription',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}

/**
 * DELETE /api/subscriptions/[id] - Delete a subscription
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
	const repository = createTransactionRepository();

	try {
		const { id } = await context.params;

		await repository.initialize();

		// Get subscription before deleting for budget updates
		const subscriptionToDelete = await repository.findSubscriptionById(id);

		const deleted = await repository.deleteSubscription(id);

		if (!deleted) {
			return NextResponse.json(
				{
					error: 'NOT_FOUND',
					message: 'Subscription not found',
				} as ErrorResponse,
				{ status: 404 },
			);
		}

		// Update budgets after subscription deletion
		if (subscriptionToDelete) {
			try {
				const budgetIntegration = new SubscriptionBudgetIntegrationService(repository);
				await budgetIntegration.onSubscriptionDeleted(subscriptionToDelete);
			} catch (budgetError) {
				console.error('Error updating budgets after subscription deletion:', budgetError);
				// Don't fail the subscription deletion if budget updates fail
			}
		}

		return NextResponse.json(
			{
				success: true,
				message: 'Subscription deleted successfully',
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Delete subscription API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while deleting subscription',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
