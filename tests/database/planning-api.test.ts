import { afterEach, beforeEach, expect, it } from 'bun:test';
import { NextRequest } from 'next/server';
import { getConnectionManager } from '../../src/lib/database/connection';
import { POST as create, GET as list } from '../../src/app/api/goals/route';
import { GET as detail, DELETE as remove, PUT as update } from '../../src/app/api/goals/[id]/route';
import { POST as contribute } from '../../src/app/api/goals/[id]/contributions/route';
import {
	PUT as editContribution,
	DELETE as removeContribution,
} from '../../src/app/api/goals/[id]/contributions/[contributionId]/route';
const request = (url: string, method = 'GET', body?: unknown) =>
	new NextRequest(`http://localhost${url}`, {
		method,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
beforeEach(async () => {
	await getConnectionManager({ filename: ':memory:' }).close();
});
afterEach(async () => {
	await getConnectionManager({ filename: ':memory:' }).close();
});
it('round-trips a goal and its contribution history through API handlers', async () => {
	const created = await create(
		request('/api/goals', 'POST', {
			name: 'Holiday',
			target: 3000,
			currency: 'NOK',
			deadline: '2090-12-31',
		}),
	);
	expect(created.status).toBe(201);
	const { id } = await created.json();
	const context = { params: Promise.resolve({ id }) };
	const contribution = await contribute(
		request('', 'POST', { amount: 250, date: '2026-01-01', note: 'Deposit' }),
		context,
	);
	expect(contribution.status).toBe(201);
	const { id: contributionId } = await contribution.json();
	let response = await detail(request(''), context);
	let body = await response.json();
	expect(body.goal.saved).toBe(250);
	expect(body.contributions[0].note).toBe('Deposit');
	const edited = await editContribution(
		request('', 'PUT', { amount: 300, date: '2026-01-02', note: 'Corrected' }),
		{ params: Promise.resolve({ id, contributionId }) },
	);
	expect(edited.status).toBe(200);
	response = await detail(request(''), context);
	body = await response.json();
	expect(body.goal.saved).toBe(300);
	expect(
		(
			await update(
				request('', 'PUT', {
					name: 'Holiday',
					target: 4000,
					currency: 'EUR',
					deadline: '2090-12-31',
				}),
				context,
			)
		).status,
	).toBe(400);
	expect(
		(
			await removeContribution(request('', 'DELETE'), {
				params: Promise.resolve({ id, contributionId }),
			})
		).status,
	).toBe(200);
	expect((await remove(request('', 'DELETE'), context)).status).toBe(200);
	expect((await detail(request(''), context)).status).toBe(404);
	expect((await (await list()).json()).data).toHaveLength(0);
});
it('returns actionable validation errors rather than storing invalid values', async () => {
	expect(
		(
			await create(
				request('', 'POST', { name: 'X', target: -1, currency: 'NOK', deadline: '2090-01-01' }),
			)
		).status,
	).toBe(400);
	expect(
		(
			await create(
				request('', 'POST', { name: 'X', target: 100, currency: 'NOK', deadline: '2026-02-30' }),
			)
		).status,
	).toBe(400);
	const created = await create(
		request('', 'POST', { name: 'X', target: 100, currency: 'NOK', deadline: '2090-01-01' }),
	);
	const { id } = await created.json();
	expect(
		(
			await contribute(request('', 'POST', { amount: 20, date: '2090-01-01' }), {
				params: Promise.resolve({ id }),
			})
		).status,
	).toBe(400);
	expect(
		(
			await contribute(request('', 'POST', { amount: 20, date: '2026-01-01' }), {
				params: Promise.resolve({ id: 'missing' }),
			})
		).status,
	).toBe(404);
});
