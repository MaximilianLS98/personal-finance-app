import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { saveContribution } from '@/lib/planning';
import { planningError } from '@/lib/planning-api';
type Context = { params: Promise<{ id: string; contributionId: string }> };
export async function PUT(request: NextRequest, { params }: Context) {
	try {
		const { id, contributionId } = await params;
		saveContribution(await financeDb(), id, await request.json(), contributionId);
		return NextResponse.json({ id: contributionId });
	} catch (error) {
		return planningError(error);
	}
}
export async function DELETE(_request: NextRequest, { params }: Context) {
	try {
		const { id, contributionId } = await params;
		const result = (await financeDb())
			.query('DELETE FROM goal_contributions WHERE id=? AND goal_id=?')
			.run(contributionId, id);
		if (!result.changes) throw new Error('Contribution not found');
		return NextResponse.json({ success: true });
	} catch (error) {
		return planningError(error);
	}
}
