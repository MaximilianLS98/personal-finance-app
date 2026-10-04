import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { NextRequest } from 'next/server';
import { financeDb } from '../../src/lib/finance-db';
import { getConnectionManager, resetConnectionManager } from '../../src/lib/database/connection';
import { POST as bulk } from '../../src/app/api/subscriptions/bulk-categorize/route';
import { POST as confirm } from '../../src/app/api/subscriptions/confirm/route';
import { GET as calendar } from '../../src/app/api/subscriptions/calendar/route';
import {
	nextDetectedPayment,
	saveDetectedSubscriptions,
} from '../../src/lib/detected-subscription';
beforeEach(async () => {
	resetConnectionManager();
	getConnectionManager({ filename: ':memory:' });
	const db = await financeDb();
	for (const [id, date, currency] of [
		['old-1', '2024-12-31', 'NOK'],
		['old-2', '2025-01-31', 'NOK'],
		['usd', '2025-01-31', 'USD'],
		['unknown', '2025-01-31', null],
	])
		db.query(
			"INSERT INTO transactions(id,date,description,amount,type,currency) VALUES(?,?,?,-100,'expense',?)",
		).run(id, date, 'Synthetic recurring merchant', currency);
});
afterEach(async () => {
	await getConnectionManager().close();
	resetConnectionManager();
});
const input = {
	name: 'Synthetic gym',
	amount: 100,
	currency: 'NOK',
	billingFrequency: 'monthly' as const,
	transactionIds: ['old-1', 'old-2'],
};
const request = (body: unknown) =>
	new NextRequest('http://localhost/api/subscriptions/confirm', {
		method: 'POST',
		body: JSON.stringify(body),
	});
const candidate = {
	...input,
	confidence: 0.99,
	matchingTransactions: input.transactionIds.map((id) => ({
		id,
		date: '2025-01-31',
		amount: -100,
		currency: 'NOK',
		type: 'expense',
	})),
	detectedPatterns: [],
	activity: 'no_recent_payment',
};
async function count(table: string) {
	return (await financeDb()).query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
}
describe('atomic historical subscription confirmation', () => {
	it('saves old recurring history inactive, links its payments, and excludes it from future calendar costs', async () => {
		const response = await bulk(request({ subscriptions: [input] }));
		expect(response.status).toBe(201);
		const data = await response.json();
		const sub = data.data.created[0].subscription;
		expect(sub).toMatchObject({
			currency: 'NOK',
			isActive: false,
			nextPaymentDate: '2025-02-28T00:00:00.000Z',
		});
		const db = await financeDb();
		expect(
			db.query('SELECT COUNT(*) AS n FROM transactions WHERE subscription_id=?').get(sub.id),
		).toEqual({ n: 2 });
		expect(await count('subscription_price_history')).toEqual({ n: 1 });
		const events = await calendar(
			new NextRequest('http://localhost/api/subscriptions/calendar?from=2026-10-01&to=2026-10-31'),
		);
		expect((await events.json()).events).toEqual([]);
		expect((await bulk(request({ subscriptions: [input] }))).status).toBe(400);
		expect(await count('subscriptions')).toEqual({ n: 1 });
	});
	it('allows explicit active status with a future calendar-aligned payment and retains separate currencies', async () => {
		const saved = saveDetectedSubscriptions(
			await financeDb(),
			[
				{ ...input, isActive: true },
				{ ...input, name: 'Dollar service', currency: 'USD', transactionIds: ['usd'] },
				{ ...input, name: 'Unknown service', currency: undefined, transactionIds: ['unknown'] },
			],
			new Date('2026-10-05'),
		);
		expect(saved.map((item) => item.subscription.currency)).toEqual(['NOK', 'USD', 'UNKNOWN']);
		expect(saved[0].subscription).toMatchObject({
			isActive: true,
			nextPaymentDate: new Date('2026-10-31'),
		});
		expect(saved.slice(1).map((item) => item.subscription.isActive)).toEqual([false, false]);
	});
	it('rolls back the complete batch, linked flags, patterns, and price history on invalid or overlapping candidates', async () => {
		for (const second of [
			{ ...input, currency: 'EUR' },
			{ ...input, name: 'Overlapping subscription' },
		]) {
			const response = await bulk(request({ subscriptions: [input, second] }));
			expect(response.status).toBe(400);
			for (const table of ['subscriptions', 'subscription_patterns', 'subscription_price_history'])
				expect(await count(table)).toEqual({ n: 0 });
			expect(
				(await financeDb())
					.query('SELECT COUNT(*) AS n FROM transactions WHERE is_subscription=1')
					.get(),
			).toEqual({ n: 0 });
		}
	});
	it('rejects actual currency mismatches and invalid custom intervals before any writes', async () => {
		for (const invalid of [
			{ ...input, currency: 'USD' },
			{ ...input, billingFrequency: 'custom', customFrequencyDays: 0 },
			{ ...input, billingFrequency: 'custom', customFrequencyDays: 9007199254740992 },
		])
			expect((await bulk(request({ subscriptions: [invalid] }))).status).toBe(400);
		expect(await count('subscriptions')).toEqual({ n: 0 });
	});
	it('legacy confirmation defaults history inactive and rolls back candidates when a selected match is invalid', async () => {
		const bad = await confirm(
			request({
				candidates: [{ candidate }],
				matches: [{ subscription: { id: 'missing' }, transaction: { id: 'usd' } }],
			}),
		);
		expect(bad.status).toBe(400);
		expect(await count('subscriptions')).toEqual({ n: 0 });
		const response = await confirm(request({ candidates: [{ candidate }] }));
		expect(response.status).toBe(200);
		expect((await response.json()).data.createdSubscriptions[0]).toMatchObject({
			isActive: false,
			currency: 'NOK',
		});
	});
	it('legacy confirmation honors explicit activation', async () => {
		const response = await confirm(
			request({ candidates: [{ candidate, overrides: { isActive: true } }] }),
		);
		expect(response.status).toBe(200);
		const sub = (await response.json()).data.createdSubscriptions[0];
		expect(sub.isActive).toBe(true);
		expect(sub.nextPaymentDate.slice(0, 10) >= new Date().toISOString().slice(0, 10)).toBe(true);
	});
});
describe('calendar cadence for detected payments', () => {
	it('clamps month ends without permanently drifting the billing anchor', () => {
		expect(nextDetectedPayment(new Date('2025-01-31'), 'monthly').toISOString().slice(0, 10)).toBe(
			'2025-02-28',
		);
		expect(
			nextDetectedPayment(new Date('2025-01-31'), 'monthly', undefined, new Date('2025-03-01'))
				.toISOString()
				.slice(0, 10),
		).toBe('2025-03-31');
		expect(nextDetectedPayment(new Date('2024-02-29'), 'annually').toISOString().slice(0, 10)).toBe(
			'2025-02-28',
		);
		expect(
			nextDetectedPayment(new Date('2025-01-31'), 'quarterly').toISOString().slice(0, 10),
		).toBe('2025-04-30');
		expect(
			nextDetectedPayment(new Date('2025-01-31'), 'custom', 14, new Date('2025-03-01'))
				.toISOString()
				.slice(0, 10),
		).toBe('2025-03-14');
	});
});
