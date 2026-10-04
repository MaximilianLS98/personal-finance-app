import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { NextRequest } from 'next/server';
import { financeDb } from '../../src/lib/finance-db';
import { getConnectionManager, resetConnectionManager } from '../../src/lib/database/connection';
import { GET as review, POST as categorize } from '../../src/app/api/review/route';
import { GET as overview } from '../../src/app/api/overview/route';
import {
	GET as details,
	PUT as updateDetails,
} from '../../src/app/api/transactions/[id]/details/route';
beforeEach(async () => {
	resetConnectionManager();
	getConnectionManager({ filename: ':memory:' });
	const db = await financeDb();
	db.query(
		"INSERT INTO transactions(id,date,description,amount,type,currency) VALUES('purchase','2026-10-01','Synthetic merchant',-120,'expense','NOK'),('receipt','2026-10-02','Synthetic refund',30,'income','NOK')",
	).run();
});
afterEach(async () => {
	await getConnectionManager().close();
	resetConnectionManager();
});
const request = (url: string, body?: unknown) =>
	new NextRequest(
		`http://localhost${url}`,
		body
			? {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				}
			: undefined,
	);
const context = (id: string) => ({ params: Promise.resolve({ id }) });
describe('review, detail and overview routes', () => {
	it('categorizes through HTTP and restores original review queue on undo', async () => {
		expect((await (await review(request('/api/review?month=2026-10'))).json()).total).toBe(1);
		const response = await categorize(
			request('/api/review', {
				ids: ['purchase'],
				categoryId: 'cat_groceries',
				pattern: 'Synthetic merchant',
				createRule: true,
				applyHistory: true,
			}),
		);
		expect(response.status).toBe(200);
		const action = await response.json();
		expect((await (await review(request('/api/review?month=2026-10'))).json()).total).toBe(0);
		expect(
			(await categorize(request('/api/review', { action: 'undo', id: action.id }))).status,
		).toBe(200);
		expect((await (await review(request('/api/review?month=2026-10'))).json()).total).toBe(1);
	});
	it('saves splits and reimbursement links then reports adjusted category totals', async () => {
		expect(
			(
				await updateDetails(
					request('/api/transactions/purchase/details', {
						action: 'split',
						allocations: [
							{ categoryId: 'cat_groceries', amount: 80 },
							{ categoryId: 'cat_shopping', amount: 40 },
						],
					}),
					context('purchase'),
				)
			).status,
		).toBe(200);
		expect(
			(
				await updateDetails(
					request('/api/transactions/receipt/details', {
						action: 'link',
						purchaseId: 'purchase',
						kind: 'reimbursement',
					}),
					context('receipt'),
				)
			).status,
		).toBe(200);
		const report = await (await overview(request('/api/overview?month=2026-10'))).json();
		expect(report.totals[0]).toMatchObject({ expenses: 90, income: 0, count: 2 });
		expect(
			report.categories.find((row: { categoryId: string }) => row.categoryId === 'cat_groceries')
				.amount,
		).toBe(60);
		const receipt = await (
			await details(request('/api/transactions/receipt/details'), context('receipt'))
		).json();
		expect(receipt.refund.kind).toBe('reimbursement');
		await updateDetails(
			request('/api/transactions/receipt/details', { action: 'unlink' }),
			context('receipt'),
		);
		expect(
			(await (await overview(request('/api/overview?month=2026-10'))).json()).totals[0],
		).toMatchObject({ expenses: 120, income: 30 });
	});
	it('rejects invalid requests without altering records', async () => {
		expect(
			(await categorize(request('/api/review', { ids: ['missing'], categoryId: 'cat_groceries' })))
				.status,
		).toBe(400);
		expect((await review(request('/api/review?month=broken'))).status).toBe(400);
		expect((await overview(request('/api/overview?month=2026-99'))).status).toBe(400);
		expect(
			(
				await updateDetails(
					request('/api/transactions/purchase/details', {
						action: 'split',
						allocations: [{ categoryId: 'cat_groceries', amount: 1 }],
					}),
					context('purchase'),
				)
			).status,
		).toBe(400);
		expect(
			(await details(request('/api/transactions/missing/details'), context('missing'))).status,
		).toBe(404);
		expect((await financeDb()).query('SELECT * FROM transaction_allocations').all()).toHaveLength(
			0,
		);
	});
});
