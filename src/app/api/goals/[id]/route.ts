import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { listGoals, saveGoal } from '@/lib/planning';
import { planningError } from '@/lib/planning-api';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, { params }: Context) {
	try {
		const { id } = await params;
		const db = await financeDb();
		const goal = listGoals(db).find((g) => g.id === id);
		if (!goal) throw new Error('Goal not found');
		return NextResponse.json({
			goal,
			contributions: db
				.query(
					'SELECT id,amount,date,note FROM goal_contributions WHERE goal_id=? ORDER BY date DESC,id',
				)
				.all(id),
			plans: db
				.query(
					'SELECT s.id,s.name,s.amount,s.billing_frequency,s.is_active FROM subscriptions s JOIN goal_subscription_plans p ON p.subscription_id=s.id WHERE p.goal_id=?',
				)
				.all(id),
		});
	} catch (error) {
		return planningError(error);
	}
}
export async function PUT(request: NextRequest, { params }: Context) {
	try {
		const { id } = await params;
		saveGoal(await financeDb(), await request.json(), id);
		return NextResponse.json({ id });
	} catch (error) {
		return planningError(error);
	}
}
export async function DELETE(_request: NextRequest, { params }: Context) {
	try {
		const { id } = await params;
		const result = (await financeDb()).query('DELETE FROM savings_goals WHERE id=?').run(id);
		if (!result.changes) throw new Error('Goal not found');
		return NextResponse.json({ success: true });
	} catch (error) {
		return planningError(error);
	}
}
