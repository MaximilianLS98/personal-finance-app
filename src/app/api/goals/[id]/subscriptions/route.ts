import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { planSubscription } from '@/lib/planning';
import { planningError } from '@/lib/planning-api';
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) {
	try {
		const { id } = await params;
		const body = await request.json();
		planSubscription(await financeDb(), id, body.subscriptionId);
		return NextResponse.json({ success: true });
	} catch (error) {
		return planningError(error);
	}
}
export async function DELETE(request: NextRequest, { params }: Context) {
	try {
		const { id } = await params;
		const body = await request.json();
		(await financeDb())
			.query('DELETE FROM goal_subscription_plans WHERE goal_id=? AND subscription_id=?')
			.run(id, body.subscriptionId);
		return NextResponse.json({ success: true });
	} catch (error) {
		return planningError(error);
	}
}
