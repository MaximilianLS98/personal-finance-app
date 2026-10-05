import { NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import {
	detectTransfers,
	matchTransfer,
	transferCandidates,
	unmatchTransfer,
} from '@/lib/ledger-service';
import {
	setTransferClassification,
	listTransferRules,
	deleteTransferRule,
} from '@/lib/transfer-classification';
import { badRequest } from '@/lib/route-utils';
export async function GET() {
	const db = await financeDb();
	return NextResponse.json({
		rules: listTransferRules(db),
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
		if (b.action === 'classify')
			return NextResponse.json(setTransferClassification(await financeDb(), b));
		if (b.action === 'detect') return NextResponse.json(detectTransfers(await financeDb()));
		if (b.action !== undefined) throw new Error('Unknown transfer action');
		return NextResponse.json(matchTransfer(await financeDb(), b.outgoingId, b.incomingId));
	} catch (e) {
		return badRequest(e);
	}
}
export async function DELETE(request: Request) {
	try {
		const b = await request.json();
		if (b.action === 'rule') deleteTransferRule(await financeDb(), b.id);
		else if (b.action === undefined) unmatchTransfer(await financeDb(), b.id, true);
		else throw new Error('Unknown transfer action');
		return NextResponse.json({ success: true });
	} catch (e) {
		return badRequest(e);
	}
}
