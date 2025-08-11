import { NextRequest, NextResponse } from 'next/server';
import { createTransactionRepository } from '@/lib/database';
import { createSubscriptionService } from '@/lib/subscription-service';
import { ErrorResponse } from '@/lib/types';

/**
 * Request body for providing feedback on subscription detection
 */
interface SubscriptionFeedbackRequest {
	/** Pattern ID that was used for detection */
	patternId: string;
	/** Whether the detection was correct */
	wasCorrect: boolean;
	/** Optional feedback message */
	feedback?: string;
}

/**
 * POST /api/subscriptions/feedback - Provide feedback on subscription detection accuracy
 */
export async function POST(request: NextRequest) {
	const repository = createTransactionRepository();

	try {
		await repository.initialize();

		const body = (await request.json()) as SubscriptionFeedbackRequest;
		const { patternId, wasCorrect, feedback } = body;

		// Validate required fields
		if (!patternId || typeof wasCorrect !== 'boolean') {
			return NextResponse.json(
				{
					error: 'INVALID_REQUEST',
					message: 'patternId and wasCorrect are required fields',
				} as ErrorResponse,
				{ status: 400 },
			);
		}

		const subscriptionService = createSubscriptionService(repository);

		// Update pattern confidence based on feedback
		await subscriptionService.updatePatternConfidence(patternId, wasCorrect);

		// Log feedback for analysis (in a real system, you might store this in a feedback table)
		console.log('Subscription detection feedback:', {
			patternId,
			wasCorrect,
			feedback,
			timestamp: new Date().toISOString(),
		});

		return NextResponse.json(
			{
				success: true,
				data: {
					message: 'Feedback recorded successfully',
					patternId,
					wasCorrect,
				},
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error('Subscription feedback API error:', error);

		return NextResponse.json(
			{
				error: 'INTERNAL_SERVER_ERROR',
				message: 'An unexpected error occurred while processing feedback',
				details: error instanceof Error ? error.message : 'Unknown error',
			} as ErrorResponse,
			{ status: 500 },
		);
	} finally {
		await repository.close();
	}
}
