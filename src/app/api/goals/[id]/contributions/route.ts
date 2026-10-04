import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { saveContribution } from '@/lib/planning';
import { planningError } from '@/lib/planning-api';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const contributionId = saveContribution(await financeDb(), id, await request.json());
		return NextResponse.json({ id: contributionId }, { status: 201 });
	} catch (error) {
		return planningError(error);
	}
}
