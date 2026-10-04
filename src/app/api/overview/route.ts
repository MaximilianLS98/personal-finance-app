import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { monthlyOverview } from '@/lib/overview-service';
export async function GET(request: NextRequest) {
	try {
		return NextResponse.json(
			monthlyOverview(
				await financeDb(),
				request.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7),
			),
		);
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Overview failed' },
			{ status: 400 },
		);
	}
}
