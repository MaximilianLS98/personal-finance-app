import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { NextRequest } from 'next/server';
import { POST as detect } from '../../src/app/api/subscriptions/detect/route';
import { getConnectionManager } from '../../src/lib/database/connection';
import { createTransactionRepository } from '../../src/lib/database';

beforeEach(async () => {
	await getConnectionManager({ filename: ':memory:' }).close();
	await createTransactionRepository().initialize();
});
afterEach(async () => {
	await getConnectionManager().close();
});

describe('historical subscription detection API', () => {
	it('includes imported history older than two years and excludes already tracked history on every query path', async () => {
		const repo = createTransactionRepository();
		await repo.initialize();
		const rows = [];
		for (const month of ['01', '02', '03', '04'])
			rows.push(
				await repo.create({
					date: new Date(`2020-${month}-12`),
					description: 'Example Historic Membership',
					amount: -450,
					type: 'expense',
					currency: 'NOK',
				}),
			);
		const request = (body: object) =>
			new NextRequest('http://localhost/api/subscriptions/detect', {
				method: 'POST',
				body: JSON.stringify(body),
			});
		const first = await (await detect(request({}))).json();
		expect(first.data.analyzedTransactions).toBe(4);
		expect(first.data.candidates).toHaveLength(1);
		expect(first.data.candidates[0]).toMatchObject({
			activity: 'no_recent_payment',
			lastPaymentDate: '2020-04-12',
		});
		const sub = await repo.createSubscription({
			name: 'Historical membership',
			amount: 450,
			currency: 'NOK',
			billingFrequency: 'monthly',
			categoryId: 'cat_entertainment',
			isActive: false,
			startDate: new Date('2020-01-12'),
			nextPaymentDate: new Date('2020-05-12'),
		});
		for (const row of rows) await repo.flagTransactionAsSubscription(row.id, sub.id);
		for (const body of [
			{},
			{ transactionIds: rows.map((t) => t.id) },
			{ dateRange: { from: '2020-01-01', to: '2020-12-31' } },
		]) {
			const response = await detect(request(body));
			expect(response.status).toBe(200);
			expect((await response.json()).data.candidates).toHaveLength(0);
		}
	});
});
