import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { NextRequest } from 'next/server';
import { getConnectionManager, resetConnectionManager } from '../../src/lib/database/connection';
import { createTransactionRepository } from '../../src/lib/database';
import { POST as create } from '../../src/app/api/subscriptions/route';
import { PUT as update } from '../../src/app/api/subscriptions/[id]/route';
import { GET as calendar } from '../../src/app/api/subscriptions/calendar/route';
import { readSubscriptionHistory } from '../../src/lib/subscription-history';
import { financeDb } from '../../src/lib/finance-db';

beforeEach(async () => {
	resetConnectionManager();
	getConnectionManager({ filename: ':memory:' });
	await financeDb();
});
afterEach(async () => {
	await getConnectionManager().close();
	resetConnectionManager();
});
const payload = {
	name: 'Synthetic custom schedule',
	amount: 120,
	currency: 'NOK',
	categoryId: 'cat_entertainment',
	billingFrequency: 'custom',
	customFrequencyDays: 10,
	nextPaymentDate: '2026-10-01',
	startDate: '2026-09-01',
};
function request(body: unknown, method = 'POST') {
	return new NextRequest('http://localhost/api/subscriptions', {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });
async function stored() {
	const repo = createTransactionRepository();
	await repo.initialize();
	return repo.findAllSubscriptions();
}
async function custom() {
	const response = await create(request(payload));
	expect(response.status).toBe(201);
	return (await response.json()).data.id as string;
}
const calendarRequest = () =>
	new NextRequest('http://localhost/api/subscriptions/calendar?from=2026-10-01&to=2026-10-31');

describe('custom subscription schedule API validation', () => {
	it.each([0, -1, 1.5, '10', null, 9007199254740992])(
		'rejects invalid new custom intervals (%s) without persisting a subscription',
		async (customFrequencyDays) => {
			const response = await create(request({ ...payload, customFrequencyDays }));
			expect(response.status).toBe(400);
			expect((await response.json()).message).toContain('positive whole number');
			expect(await stored()).toEqual([]);
			expect(readSubscriptionHistory(await financeDb()).prices).toEqual([]);
		},
	);
	it('rejects interval-only partial edits atomically and preserves working calendar and price history', async () => {
		const id = await custom();
		const before = readSubscriptionHistory(await financeDb()).prices;
		for (const customFrequencyDays of [0, -2, 1.5, '10', null]) {
			const response = await update(request({ customFrequencyDays }, 'PUT'), context(id));
			expect(response.status).toBe(400);
			expect((await stored())[0].customFrequencyDays).toBe(10);
		}
		expect(readSubscriptionHistory(await financeDb()).prices).toEqual(before);
		const response = await calendar(calendarRequest());
		expect(response.status).toBe(200);
		expect((await response.json()).events.map((event: { date: string }) => event.date)).toEqual([
			'2026-10-01',
			'2026-10-11',
			'2026-10-21',
			'2026-10-31',
		]);
	});
	it('retains a valid stored interval for unrelated updates and uses valid interval edits in calendar output', async () => {
		const id = await custom();
		expect((await update(request({ name: 'Renamed' }, 'PUT'), context(id))).status).toBe(200);
		expect((await update(request({ billingFrequency: 'custom' }, 'PUT'), context(id))).status).toBe(
			200,
		);
		expect((await update(request({ customFrequencyDays: 15 }, 'PUT'), context(id))).status).toBe(
			200,
		);
		expect((await stored())[0].customFrequencyDays).toBe(15);
		const response = await calendar(calendarRequest());
		expect(response.status).toBe(200);
		expect((await response.json()).events.map((event: { date: string }) => event.date)).toEqual([
			'2026-10-01',
			'2026-10-16',
			'2026-10-31',
		]);
	});
	it('validates switching billing frequency against the merged interval and allows leaving custom billing', async () => {
		const created = await create(
			request({ ...payload, billingFrequency: 'monthly', customFrequencyDays: undefined }),
		);
		expect(created.status).toBe(201);
		const id = (await created.json()).data.id;
		expect((await update(request({ billingFrequency: 'custom' }, 'PUT'), context(id))).status).toBe(
			400,
		);
		expect(
			(
				await update(
					request({ billingFrequency: 'custom', customFrequencyDays: 14 }, 'PUT'),
					context(id),
				)
			).status,
		).toBe(200);
		expect(
			(
				await update(
					request({ billingFrequency: 'monthly', customFrequencyDays: null }, 'PUT'),
					context(id),
				)
			).status,
		).toBe(200);
		expect((await stored())[0].billingFrequency).toBe('monthly');
		expect((await calendar(calendarRequest())).status).toBe(200);
		expect((await update(request({ billingFrequency: null }, 'PUT'), context(id))).status).toBe(
			400,
		);
	});
});
