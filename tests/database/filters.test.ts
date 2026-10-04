import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { NextRequest } from 'next/server';
import { GET as dashboard } from '../../src/app/api/dashboard/route';
import { GET as transactions } from '../../src/app/api/transactions/route';
import { getConnectionManager } from '../../src/lib/database/connection';

beforeEach(async () => {
	await getConnectionManager({ filename: ':memory:' }).close();
});
afterAll(async () => {
	await getConnectionManager({ filename: ':memory:' }).close();
});
describe('API filter validation', () => {
	it.each(['interval=invalid', 'from=not-a-date', 'from=2026-12-01&to=2026-01-01'])(
		'rejects invalid dashboard filters: %s',
		async (query) => {
			const response = await dashboard(new NextRequest(`http://localhost/api/dashboard?${query}`));
			expect(response.status).toBe(400);
		},
	);
	it.each(['page=0', 'page=NaN', 'limit=1001', 'page=1&sortOrder=invalid', 'page=1&from=invalid'])(
		'rejects invalid transaction filters: %s',
		async (query) => {
			const response = await transactions(
				new NextRequest(`http://localhost/api/transactions?${query}`),
			);
			expect(response.status).toBe(400);
		},
	);
});
