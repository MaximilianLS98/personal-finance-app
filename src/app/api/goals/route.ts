import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { listGoals, saveGoal } from '@/lib/planning';
import { planningError } from '@/lib/planning-api';
export async function GET() {
	try {
		return NextResponse.json({ data: listGoals(await financeDb()) });
	} catch (error) {
		return planningError(error);
	}
}
export async function POST(request: NextRequest) {
	try {
		const id = saveGoal(await financeDb(), await request.json());
		return NextResponse.json({ id }, { status: 201 });
	} catch (error) {
		return planningError(error);
	}
}
