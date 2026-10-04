import { assignTransactions, unassignedTransactions } from '@/lib/legacy-accounts';
import { NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { createAccount, listAccounts, reconcileAccount } from '@/lib/ledger-service';
import { badRequest } from '@/lib/route-utils';
export async function GET(request: Request) {
	const db = await financeDb();
	return NextResponse.json(
		new URL(request.url).searchParams.get('action') === 'unassigned'
			? unassignedTransactions(db)
			: listAccounts(db),
	);
}
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const db = await financeDb();
		return NextResponse.json(
			body.action === 'assign'
				? assignTransactions(db, body.accountId, body.transactionIds)
				: body.action === 'reconcile'
					? reconcileAccount(db, body.id, body.asOf, body.statementBalance)
					: createAccount(db, body),
		);
	} catch (error) {
		return badRequest(error);
	}
}
