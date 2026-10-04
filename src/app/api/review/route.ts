import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { applyReview, reviewInbox, undoReview } from '@/lib/review-service';
export async function GET(request: NextRequest) {
	try {
		return NextResponse.json(
			reviewInbox(await financeDb(), request.nextUrl.searchParams.get('month') || undefined),
		);
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Review failed' },
			{ status: 400 },
		);
	}
}
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const db = await financeDb();
		return NextResponse.json(
			body.action === 'undo' ? undoReview(db, body.id) : applyReview(db, body),
		);
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Review failed' },
			{ status: 400 },
		);
	}
}
