import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { createFinanceBackup, exportTransactionsCSV } from '@/lib/finance-backup';
export async function GET(request: NextRequest) {
	const format = new URL(request.url).searchParams.get('format') || 'json';
	if (!['json', 'csv'].includes(format))
		return NextResponse.json({ message: 'Export format must be json or csv' }, { status: 400 });
	try {
		const db = await financeDb();
		const csv = format === 'csv';
		return new NextResponse(
			csv ? exportTransactionsCSV(db) : JSON.stringify(createFinanceBackup(db), null, 2),
			{
				headers: {
					'Content-Type': csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
					'Content-Disposition': `attachment; filename="finance-${csv ? 'transactions' : 'all-data'}-${new Date().toISOString().slice(0, 10)}.${format}"`,
					'Cache-Control': 'no-store',
				},
			},
		);
	} catch (error) {
		console.error('Export failed', error);
		return NextResponse.json({ message: 'Unable to export finance data' }, { status: 500 });
	}
}
