import { NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { matchTransfer, transferCandidates, unmatchTransfer } from '@/lib/ledger-service';
import { badRequest } from '@/lib/route-utils';
export async function GET() {
	const db = await financeDb();
	return NextResponse.json({
		candidates: transferCandidates(db),
		matches: db
			.query(
				'SELECT m.*,o.description AS outgoing_description,i.description AS incoming_description,o.amount,o.currency FROM transfer_matches m JOIN transactions o ON o.id=m.outgoing_id JOIN transactions i ON i.id=m.incoming_id',
			)
			.all(),
	});
}
export async function POST(request: Request) {
	try {
		const b = await request.json();
		return NextResponse.json(matchTransfer(await financeDb(), b.outgoingId, b.incomingId));
	} catch (e) {
		return badRequest(e);
	}
}
export async function DELETE(request: Request) {
	try {
		const b = await request.json();
		unmatchTransfer(await financeDb(), b.id);
		return NextResponse.json({ success: true });
	} catch (e) {
		return badRequest(e);
	}
}
