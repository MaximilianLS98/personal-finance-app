import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { NextRequest } from 'next/server';
import {
	GET as calendar,
	PUT as preferences,
} from '../../src/app/api/subscriptions/calendar/route';
import { GET as insights } from '../../src/app/api/subscriptions/insights/route';
import { GET as dashboard } from '../../src/app/api/subscriptions/dashboard/route';
import { getConnectionManager } from '../../src/lib/database/connection';
import { createTransactionRepository } from '../../src/lib/database';
let id: string;
beforeEach(async () => {
	await getConnectionManager({ filename: ':memory:' }).close();
	const repo = createTransactionRepository();
	await repo.initialize();
	const cat = await repo.createCategory({ name: 'Service test', icon: 'Wallet', color: '#123456' });
	for (const [currency, amount] of [
		['NOK', 100],
		['USD', 10],
	] as const) {
		const sub = await repo.createSubscription({
			name: `Service ${currency}`,
			amount,
			currency,
			billingFrequency: 'monthly',
			nextPaymentDate: new Date('2026-10-15'),
			startDate: new Date('2025-01-01'),
			isActive: true,
			categoryId: cat.id,
		});
		if (currency === 'NOK') id = sub.id;
	}
});
afterEach(async () => {
	await getConnectionManager().close();
});
describe('subscription APIs', () => {
	it('serves currency-separated history and scoped legacy dashboard totals', async () => {
		const response = await insights();
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(
			body.data.map((g: { currency: string; monthlyTotal: number }) => [
				g.currency,
				g.monthlyTotal,
			]),
		).toEqual([
			['NOK', 100],
			['USD', 10],
		]);
		const summary = await dashboard(
			new NextRequest('http://localhost/api/subscriptions/dashboard?currency=USD'),
		);
		expect(summary.status).toBe(200);
		const data = await summary.json();
		expect(data.data.summary.totalMonthlyCost).toBe(10);
		expect(data.data.summary.currency).toBe('USD');
	});
	it('saves reminders, serves bill events, and returns downloadable ICS with alarms', async () => {
		const saved = await preferences(
			new NextRequest('http://localhost/api/subscriptions/calendar', {
				method: 'PUT',
				body: JSON.stringify({
					subscriptionId: id,
					reminderDays: 3,
					cancellationNoticeDays: 7,
					enabled: true,
				}),
			}),
		);
		expect(saved.status).toBe(200);
		const events = await calendar(
			new NextRequest('http://localhost/api/subscriptions/calendar?from=2026-10-01&to=2026-10-31'),
		);
		expect(events.status).toBe(200);
		const body = await events.json();
		expect(
			body.events.find((event: { subscriptionId: string }) => event.subscriptionId === id)
				.cancellationDate,
		).toBe('2026-10-08');
		const exported = await calendar(
			new NextRequest(
				'http://localhost/api/subscriptions/calendar?from=2026-10-01&to=2026-10-31&format=ics',
			),
		);
		expect(exported.headers.get('content-type')).toContain('text/calendar');
		expect(exported.headers.get('content-disposition')).toContain('attachment');
		expect(await exported.text()).toContain('TRIGGER:-P3D');
	});
	it('returns validation errors without changing preferences', async () => {
		const rejected = await preferences(
			new NextRequest('http://localhost/api/subscriptions/calendar', {
				method: 'PUT',
				body: JSON.stringify({
					subscriptionId: id,
					reminderDays: -1,
					cancellationNoticeDays: 7,
					enabled: true,
				}),
			}),
		);
		expect(rejected.status).toBe(400);
		const invalid = await calendar(
			new NextRequest('http://localhost/api/subscriptions/calendar?from=2026-02-30&to=2026-03-31'),
		);
		expect(invalid.status).toBe(400);
	});
});
