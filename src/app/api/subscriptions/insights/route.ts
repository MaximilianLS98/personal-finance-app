import { createTransactionRepository } from '@/lib/database';
import { financeDb } from '@/lib/finance-db';
import { readSubscriptionHistory, subscriptionInsights } from '@/lib/subscription-history';
import { NextResponse } from 'next/server';

export async function GET() {
	try {
		const db = await financeDb();
		const repository = createTransactionRepository();
		await repository.initialize();
		const subscriptions = await repository.findAllSubscriptions();
		const { payments, prices } = readSubscriptionHistory(db);
		return NextResponse.json({
			success: true,
			data: subscriptionInsights(subscriptions, payments, prices),
		});
	} catch (error) {
		console.error('Subscription insights failed', error);
		return NextResponse.json({ message: 'Unable to load subscription history' }, { status: 500 });
	}
}
