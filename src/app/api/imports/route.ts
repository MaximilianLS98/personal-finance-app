import { NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import {
	commitImport,
	importHistory,
	previewImport,
	undoImport,
	type ImportOptions,
} from '@/lib/ledger-service';
import { badRequest } from '@/lib/route-utils';
export async function GET() {
	return NextResponse.json(importHistory(await financeDb()));
}
export async function POST(request: Request) {
	try {
		const form = await request.formData();
		const file = form.get('file');
		if (
			!(file instanceof File) ||
			file.size > 5 * 1024 * 1024 ||
			!file.name.toLowerCase().endsWith('.csv')
		)
			throw new Error('Choose a CSV file up to 5 MB');
		const options = JSON.parse(String(form.get('options') || '{}')) as ImportOptions;
		const content = await file.text();
		const db = await financeDb();
		return NextResponse.json(
			form.get('action') === 'commit'
				? commitImport(db, content, file.name, options)
				: previewImport(db, content, options),
		);
	} catch (error) {
		return badRequest(error);
	}
}
export async function DELETE(request: Request) {
	try {
		const { id } = await request.json();
		undoImport(await financeDb(), id);
		return NextResponse.json({ success: true });
	} catch (error) {
		return badRequest(error);
	}
}
