import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import { createTransactionRepository } from '@/lib/database';
import {
	billEvents,
	calendarICS,
	reminderPreferences,
	saveReminder,
} from '@/lib/subscription-calendar';
export async function GET(request: NextRequest) {
	try {
		const db = await financeDb();
		const repository = createTransactionRepository();
		await repository.initialize();
		const subscriptions = await repository.findActiveSubscriptions();
		const preferences = reminderPreferences(db);
		const url = new URL(request.url);
		const from = url.searchParams.get('from') ?? new Date().toISOString().slice(0, 10);
		const to =
			url.searchParams.get('to') ??
			new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
		let events;
		try {
			events = billEvents(subscriptions, preferences, from, to);
		} catch (error) {
			return NextResponse.json({ message: (error as Error).message }, { status: 400 });
		}
		if (url.searchParams.get('format') === 'ics')
			return new NextResponse(calendarICS(events, from, to), {
				headers: {
					'Content-Type': 'text/calendar; charset=utf-8',
					'Content-Disposition': 'attachment; filename="subscription-bills.ics"',
					'Cache-Control': 'no-store',
				},
			});
		return NextResponse.json({ events, subscriptions, preferences, from, to });
	} catch (error) {
		console.error(error);
		return NextResponse.json({ message: 'Unable to load bill calendar' }, { status: 500 });
	}
}
export async function PUT(request: NextRequest) {
	try {
		const db = await financeDb();
		const value = await request.json();
		try {
			saveReminder(db, value);
		} catch (error) {
			return NextResponse.json({ message: (error as Error).message }, { status: 400 });
		}
		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ message: 'Unable to save reminder settings' }, { status: 500 });
	}
}
