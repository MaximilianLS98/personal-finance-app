import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { linkRefund, setAllocations, transactionDetails } from '@/lib/transaction-ledger';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, context: Context) {
	try {
		return NextResponse.json(transactionDetails(await financeDb(), (await context.params).id));
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Details failed' },
			{ status: 404 },
		);
	}
}
export async function PUT(request: NextRequest, context: Context) {
	try {
		const db = await financeDb(),
			{ id } = await context.params,
			body = await request.json();
		if (body.action === 'split') setAllocations(db, id, body.allocations);
		else if (body.action === 'link') linkRefund(db, id, body.purchaseId, body.kind);
		else if (body.action === 'unlink')
			db.query('DELETE FROM refund_links WHERE refund_id=?').run(id);
		else throw new Error('Unknown action');
		return NextResponse.json(transactionDetails(db, id));
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Update failed' },
			{ status: 400 },
		);
	}
}
